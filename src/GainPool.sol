// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITickr {
    function liveAt() external view returns (uint64);
}

interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
}

interface IDrop {
    function supply() external view returns (uint256);
    function holderOf(uint256 id) external view returns (address);
}

/// @title GainPool
/// @notice Collects the 3% from Tickr pairs (Tickr) and from the NFT book / royalties (ETH),
///         then pays it out once per US session to the holders of that day's top gainers.
///
///         Gainers are submitted sorted by % change, desc. Each one is weighted by its own gain,
///         running total capped at 100%: the gainer that crosses the cap gets the remainder and
///         nothing below it is paid. If every positive mover together is under 100%, the pot
///         is split pro rata between them. Unminted slots, and holders with < 1 Tickr,
///         forfeit their cut to the next session. No positive movers, no payout.
contract GainPool is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FULL = 1_000_000; // 100% in gain units (1 unit = 0.0001%)
    uint256 public constant MIN_HOLD = 1 ether;
    uint256 public constant CLOSE = 21 hours; // 16:00 New York is 20:00 or 21:00 UTC
    uint256 private constant PUSH_GAS = 30_000;

    IERC20 public immutable tickr;
    IDrop public drop;
    address public reporter;

    uint32 public lastDay;
    uint256 public owed;
    mapping(address => uint256) public credit;

    struct Round {
        uint32 day;
        uint16 gainers;
        uint16 paid;
        uint32 weight;
        uint64 blockNo;
        uint128 eth;
        uint128 tkn;
    }

    Round[] public rounds;

    event Bound(address drop);
    event ReporterSet(address reporter);
    event Paid(uint32 indexed day, uint256 indexed id, address indexed holder, uint256 gain, uint256 eth, uint256 tkn);
    event Settled(uint32 indexed day, uint256 gainers, uint256 paid, uint256 weight, uint256 eth, uint256 tkn);
    event Credited(address indexed holder, uint256 eth);
    event Claimed(address indexed holder, uint256 eth);

    error NotReporter();
    error NotLive();
    error Locked();
    error BadDay(uint32 day);
    error TooEarly(uint256 at);
    error BadInput();
    error BadId(uint256 id);
    error BadOrder(uint256 index);
    error PastCap(uint256 index);
    error PayFailed();

    constructor(IERC20 tickr_, address reporter_) Ownable(msg.sender) {
        tickr = tickr_;
        reporter = reporter_;
        emit ReporterSet(reporter_);
    }

    receive() external payable {}

    function bind(IDrop drop_) external onlyOwner {
        if (address(drop) != address(0)) revert Locked();
        drop = drop_;
        emit Bound(address(drop_));
    }

    function setReporter(address reporter_) external onlyOwner {
        reporter = reporter_;
        emit ReporterSet(reporter_);
    }

    /// @param day    session date as days since 1970-01-01 (New York calendar date)
    /// @param ids    slot ids of positive movers, by gain desc then id asc
    /// @param gains  % change in units of 0.0001% (12.5% = 125000), all > 0
    function settle(uint32 day, uint16[] calldata ids, uint32[] calldata gains) external nonReentrant {
        if (msg.sender != reporter) revert NotReporter();
        _checkDay(day);
        uint256 n = ids.length;
        if (gains.length != n) revert BadInput();
        lastDay = day;

        uint256 supply = drop.supply();
        uint256[] memory seen = new uint256[]((supply >> 8) + 1);
        uint256[] memory w = new uint256[](n);
        address[] memory to = new address[](n);
        uint256 total;

        // pass 1: validate, weigh, and lock eligibility before anything moves
        for (uint256 i; i < n; ++i) {
            uint256 id = ids[i];
            uint256 g = gains[i];
            if (id == 0 || id > supply) revert BadId(id);
            if (g == 0) revert BadInput();
            if (i != 0) {
                uint256 pg = gains[i - 1];
                if (g > pg || (g == pg && id <= ids[i - 1])) revert BadOrder(i);
            }
            uint256 bit = 1 << (id & 0xff);
            if (seen[id >> 8] & bit != 0) revert BadId(id);
            seen[id >> 8] |= bit;

            if (total >= FULL) revert PastCap(i);
            if (g > FULL - total) g = FULL - total;
            w[i] = g;
            total += g;

            address h = drop.holderOf(id);
            if (h != address(0) && tickr.balanceOf(h) >= MIN_HOLD) to[i] = h;
        }

        uint256 ethPot = address(this).balance - owed;
        uint256 tknPot = tickr.balanceOf(address(this));
        uint256 ethOut;
        uint256 tknOut;
        uint256 paid;

        // pass 2: pay
        for (uint256 i; i < n; ++i) {
            address h = to[i];
            if (h == address(0)) continue;
            uint256 e = ethPot * w[i] / total;
            uint256 t = tknPot * w[i] / total;
            if (t != 0) tickr.safeTransfer(h, t);
            if (e != 0) _push(h, e);
            ethOut += e;
            tknOut += t;
            ++paid;
            emit Paid(day, ids[i], h, gains[i], e, t);
        }

        rounds.push(
            Round({
                day: day,
                gainers: uint16(n),
                paid: uint16(paid),
                weight: uint32(total),
                blockNo: uint64(_blockNo()),
                eth: uint128(ethOut),
                tkn: uint128(tknOut)
            })
        );
        emit Settled(day, n, paid, total, ethOut, tknOut);
    }

    function claim() external nonReentrant {
        uint256 amount = credit[msg.sender];
        if (amount == 0) return;
        credit[msg.sender] = 0;
        owed -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert PayFailed();
        emit Claimed(msg.sender, amount);
    }

    // ----------------------------------------------------------------- views

    function pot() external view returns (uint256 eth, uint256 tkn) {
        return (address(this).balance - owed, tickr.balanceOf(address(this)));
    }

    function roundCount() external view returns (uint256) {
        return rounds.length;
    }

    /// @notice Earliest timestamp `day` can be settled, 0 if it never can.
    function settleableAt(uint32 day) public view returns (uint256) {
        uint256 live = ITickr(address(tickr)).liveAt();
        uint256 close = uint256(day) * 1 days + CLOSE;
        uint256 wd = (uint256(day) + 4) % 7; // 0 = Sunday
        if (live == 0 || day <= lastDay || close <= live || wd == 0 || wd == 6) return 0;
        return close;
    }

    // -------------------------------------------------------------- internals

    function _checkDay(uint32 day) private view {
        if (ITickr(address(tickr)).liveAt() == 0) revert NotLive();
        uint256 at = settleableAt(day);
        if (at == 0) revert BadDay(day);
        if (block.timestamp < at) revert TooEarly(at);
    }

    // Nitro chains report the L1 height in block.number; logs are indexed by L2 height.
    function _blockNo() private view returns (uint256) {
        if (block.chainid == 4663 || block.chainid == 46630) {
            return IArbSys(address(100)).arbBlockNumber();
        }
        return block.number;
    }

    // Contracts that can't take ETH in 30k gas get credited and claim later.
    function _push(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount, gas: PUSH_GAS}("");
        if (!ok) {
            credit[to] += amount;
            owed += amount;
            emit Credited(to, amount);
        }
    }
}
