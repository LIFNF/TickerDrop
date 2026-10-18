// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IMarketOracle} from "./IMarketOracle.sol";
import {RoundValidation} from "./RoundValidation.sol";

interface ITickr {
    function balanceAt(address account, uint48 timestamp) external view returns (uint256);
    function liveAt() external view returns (uint64);
}

interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
}

interface IDrop {
    function holderAt(uint256 id, uint48 timestamp) external view returns (address);
    function supply() external view returns (uint256);
    function holderOf(uint256 id) external view returns (address);
}

/// @title GainPool
/// @notice Collects the 3% from ordinary Tickr transfers (Tickr) and NFT book fills (ETH),
///         then pays it out to the holders of each session's top gainers. A session is settled
///         on its final close, no earlier than 09:30 New York on the next weekday; fees keep
///         stacking until then, so weekends and holidays roll into the next settlement.
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
    uint256 public constant OPEN = 9 hours + 30 minutes; // New York wall clock
    uint256 public constant CLOSE = 16 hours;
    uint256 private constant PUSH_GAS = 30_000;

    IERC20 public immutable tickr;
    IDrop public drop;
    address public immutable reporter;
    IMarketOracle public marketOracle;
    error UnverifiedMarketData();
    event MarketOracleBound(address oracle);

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
    uint256 public constant PAYOUT_BATCH = 64;

    struct Pending {
        uint32 day;
        uint32 total;
        uint16 count;
        uint16 cursor;
        uint16 paid;
        uint64 snapshotAt;
        uint64 startBlock;
        uint256 ethPot;
        uint256 tknPot;
        uint256 ethOut;
        uint256 tknOut;
        bytes32 commitment;
    }
    Pending private _pending;
    mapping(uint256 => uint64) public roundStartBlock;
    event SettlementProgress(uint32 indexed day, uint256 processed, uint256 count);

    function pendingDay() external view returns (uint32) {
        return _pending.day;
    }

    function pendingCursor() external view returns (uint16) {
        return _pending.cursor;
    }

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
        require(address(tickr_).code.length > 0 && reporter_ != address(0), "Invalid token/publisher");
        tickr = tickr_;
        reporter = reporter_;
        emit ReporterSet(reporter_);
    }

    event ETHFunded(address indexed source, uint256 amount);
    receive() external payable { emit ETHFunded(msg.sender, msg.value); }

    function bind(IDrop drop_) external onlyOwner {
        if (address(drop) != address(0)) revert Locked();
        require(
            address(drop_).code.length > 0 && drop_.supply() > 0 && drop_.supply() <= type(uint16).max,
            "Invalid NFT contract"
        );
        drop = drop_;
        emit Bound(address(drop_));
    }

    function bindMarketOracle(IMarketOracle oracle) external onlyOwner {
        if (address(marketOracle) != address(0) || ITickr(address(tickr)).liveAt() != 0) revert Locked();
        if (address(drop) == address(0)) revert Locked();
        if (address(oracle).code.length == 0) revert UnverifiedMarketData();
        marketOracle = oracle;
        emit MarketOracleBound(address(oracle));
        _transferOwnership(address(0));
    }

    /// @param day    session date as days since 1970-01-01 (New York calendar date)
    /// @param ids    slot ids of positive movers, by gain desc then id asc
    /// @param gains  % change in units of 0.0001% (12.5% = 125000), all > 0
    function settle(uint32 day, uint16[] calldata ids, uint32[] calldata gains) external nonReentrant {
        if (_pending.day != 0) revert Locked();
        // Anyone may relay data; only the immutable oracle commitment authorizes it.
        if (address(marketOracle) == address(0)) revert UnverifiedMarketData();
        _checkDay(day);
        (bytes32 commitment,,, uint64 snapshotAt) = marketOracle.session(day);
        if (
            commitment == bytes32(0)
                || commitment != keccak256(abi.encode(block.chainid, address(this), day, ids, gains))
        ) revert UnverifiedMarketData();
        uint256 n = ids.length;
        uint32 total = RoundValidation.validate(ids, gains, drop.supply());
        _pending = Pending({
            day: day,
            total: uint32(total),
            count: uint16(n),
            cursor: 0,
            paid: 0,
            snapshotAt: snapshotAt,
            startBlock: uint64(_blockNo()),
            ethPot: address(this).balance - owed,
            tknPot: tickr.balanceOf(address(this)),
            ethOut: 0,
            tknOut: 0,
            commitment: commitment
        });
        _payBatch(ids, gains);
    }

    /// @notice Continue the same committed round, at most 64 slots per transaction.
    function continueSettlement(uint16[] calldata ids, uint32[] calldata gains) external nonReentrant {
        Pending storage p = _pending;
        if (p.day == 0 || p.commitment != keccak256(abi.encode(block.chainid, address(this), p.day, ids, gains))) {
            revert BadInput();
        }
        _payBatch(ids, gains);
    }

    function _payBatch(uint16[] calldata ids, uint32[] calldata gains) private {
        Pending storage p = _pending;
        uint256 end = uint256(p.cursor) + PAYOUT_BATCH;
        if (end > p.count) end = p.count;
        uint256 used;
        for (uint256 i; i < p.cursor; ++i) {
            uint256 weight = gains[i];
            if (weight > FULL - used) weight = FULL - used;
            used += weight;
        }
        for (uint256 i = p.cursor; i < end; ++i) {
            uint256 weight = gains[i];
            if (weight > FULL - used) weight = FULL - used;
            used += weight;
            address holder = drop.holderAt(ids[i], uint48(p.snapshotAt - 1));
            if (holder == address(0) || ITickr(address(tickr)).balanceAt(holder, uint48(p.snapshotAt - 1)) < MIN_HOLD) {
                continue;
            }
            uint256 e = p.ethPot * weight / p.total;
            uint256 t = p.tknPot * weight / p.total;
            if (t != 0) tickr.safeTransfer(holder, t);
            if (e != 0) _push(holder, e);
            p.ethOut += e;
            p.tknOut += t;
            ++p.paid;
            emit Paid(p.day, ids[i], holder, gains[i], e, t);
        }
        p.cursor = uint16(end);
        emit SettlementProgress(p.day, end, p.count);
        if (end == p.count) {
            roundStartBlock[rounds.length] = p.startBlock;
            rounds.push(
                Round({
                    day: p.day,
                    gainers: p.count,
                    paid: p.paid,
                    weight: p.total,
                    blockNo: uint64(_blockNo()),
                    eth: uint128(p.ethOut),
                    tkn: uint128(p.tknOut)
                })
            );
            lastDay = p.day;
            emit Settled(p.day, p.count, p.paid, p.total, p.ethOut, p.tknOut);
            delete _pending;
        }
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

    /// @notice Earliest timestamp `day` can be settled (next weekday's 09:30 New York), 0 if never.
    function settleableAt(uint32 day) public view returns (uint256) {
        uint256 live = ITickr(address(tickr)).liveAt();
        if (live == 0 || day <= lastDay || address(marketOracle) == address(0)) return 0;
        (bytes32 commitment, uint64 openedAt, uint64 closedAt, uint64 nextOpen) = marketOracle.session(day);
        if (commitment == bytes32(0) || openedAt < live || closedAt <= openedAt || nextOpen <= closedAt) return 0;
        // The adapter must attest exchange holidays, early closes and the next real open.
        if (openedAt != nyTime(day, OPEN) || closedAt / 1 days != openedAt / 1 days) return 0;
        return nextOpen;
    }

    /// @notice UTC timestamp of New York wall-clock time `clock` on `day` (days since epoch).
    function nyTime(uint256 day, uint256 clock) public pure returns (uint256) {
        return day * 1 days + clock + (_dst(day) ? 4 hours : 5 hours);
    }

    // US rule: second Sunday of March through the day before the first Sunday of November.
    // Market hours never touch the 02:00 switch, so a date-level check is exact.
    function _dst(uint256 day) private pure returns (bool) {
        uint256 y = _year(day);
        uint256 mar1 = _epochDay(y, 3, 1);
        uint256 nov1 = _epochDay(y, 11, 1);
        uint256 start = mar1 + (7 - (mar1 + 4) % 7) % 7 + 7;
        uint256 end = nov1 + (7 - (nov1 + 4) % 7) % 7;
        return day >= start && day < end;
    }

    // Hinnant's civil calendar algorithms, restricted to dates after 1970.
    function _year(uint256 day) private pure returns (uint256 y) {
        uint256 z = day + 719_468;
        uint256 era = z / 146_097;
        uint256 doe = z - era * 146_097;
        uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        y = yoe + era * 400;
        if (mp >= 10) ++y; // January, February
    }

    function _epochDay(uint256 y, uint256 m, uint256 d) private pure returns (uint256) {
        if (m <= 2) --y;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1;
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146_097 + doe - 719_468;
    }

    // -------------------------------------------------------------- internals

    function _checkDay(uint32 day) private view {
        if (ITickr(address(tickr)).liveAt() == 0) revert NotLive();
        uint256 at = settleableAt(day);
        if (at == 0) revert BadDay(day);
        if (block.timestamp < at) revert TooEarly(at);
        if (marketOracle.nextSession(lastDay) != day) revert BadDay(day);
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
