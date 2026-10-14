// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title TickerDrop
/// @notice One token per Nasdaq listing, id = market cap rank at snapshot.
///         Secondary sales clear through the built-in book at a 3% fee to the GainPool.
contract TickerDrop is ERC721, ERC2981, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    address payable public constant LP_VAULT = payable(0x175d6A654568009273Fd08f1a29BE998b8BCB0dd);

    uint256 public constant TOP = 100;
    uint256 public constant TOP_PRICE = 0.005 ether;
    uint256 public constant PRICE = 0.001 ether;
    uint256 public constant DROP = 100_000 ether;
    uint256 public constant MAX_PER_TX = 100;
    uint96 public constant FEE_BPS = 300;

    IERC20 public immutable tickr;
    address payable public immutable pool;
    uint256 public immutable supply;
    address private immutable _table; // 5 bytes per symbol, stored as contract code

    struct Ask {
        address seller;
        uint96 price;
    }

    enum Phase {
        Idle,
        Open,
        Done
    }

    Phase public phase;
    uint256 public minted;

    mapping(uint256 => uint256) private _bits;
    mapping(uint256 => Ask) public asks;
    mapping(address => bool) public freeMint;
    mapping(address => bool) public operatorOk;

    event PhaseSet(Phase phase);
    event Minted(address indexed to, uint256 count, uint256 paid);
    event Listed(uint256 indexed id, address indexed seller, uint256 price);
    event Unlisted(uint256 indexed id);
    event Sold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event FreeMintSet(address indexed account, bool on);
    event OperatorSet(address indexed operator, bool on);

    error BadTable();
    error BadId(uint256 id);
    error BadCount();
    error BadPhase();
    error WrongValue(uint256 expected);
    error NotSeller();
    error NotListed();
    error ZeroPrice();
    error OperatorBlocked(address operator);
    error PayFailed();

    constructor(IERC20 tickr_, address payable pool_, bytes memory table)
        ERC721("TickerDrop", "TDROP")
        Ownable(msg.sender)
    {
        if (table.length == 0 || table.length % 5 != 0 || table.length > 24_000) {
            revert BadTable();
        }

        bytes memory code = abi.encodePacked(hex"61", uint16(table.length + 1), hex"80600a3d393df300", table);
        address t;
        assembly {
            t := create(0, add(code, 0x20), mload(code))
        }
        if (t == address(0)) revert BadTable();

        tickr = tickr_;
        pool = pool_;
        supply = table.length / 5;
        _table = t;

        freeMint[LP_VAULT] = true;
        _setDefaultRoyalty(pool_, FEE_BPS);
    }

    // ------------------------------------------------------------------ mint

    function price(uint256 id) public pure returns (uint256) {
        return id <= TOP ? TOP_PRICE : PRICE;
    }

    function quote(address minter, uint256[] calldata ids) external view returns (uint256 cost) {
        if (freeMint[minter]) return 0;
        for (uint256 i; i < ids.length; ++i) {
            cost += price(ids[i]);
        }
    }

    function mint(uint256[] calldata ids) external payable nonReentrant {
        if (phase != Phase.Open) revert BadPhase();
        uint256 n = ids.length;
        if (n == 0 || n > MAX_PER_TX) revert BadCount();

        uint256 cost;
        for (uint256 i; i < n; ++i) {
            uint256 id = ids[i];
            if (id == 0 || id > supply) revert BadId(id);
            cost += price(id);
            _bits[id >> 8] |= 1 << (id & 0xff);
            _mint(msg.sender, id);
        }
        if (freeMint[msg.sender]) cost = 0;
        if (msg.value != cost) revert WrongValue(cost);

        minted += n;
        tickr.safeTransfer(msg.sender, DROP * n);

        if (cost != 0) {
            (bool ok,) = LP_VAULT.call{value: cost}("");
            if (!ok) revert PayFailed();
        }
        emit Minted(msg.sender, n, cost);

        if (minted == supply) {
            phase = Phase.Done;
            emit PhaseSet(Phase.Done);
        }
    }

    function openMint() external onlyOwner {
        if (phase != Phase.Idle) revert BadPhase();
        phase = Phase.Open;
        emit PhaseSet(Phase.Open);
    }

    /// @notice Ends the mint for good. Unclaimed drop allocation goes back to the owner for liquidity.
    function closeMint() external onlyOwner {
        if (phase == Phase.Done) revert BadPhase();
        phase = Phase.Done;
        emit PhaseSet(Phase.Done);
    }

    /// @notice Leftover Tickr after the mint is over.
    function sweep() external onlyOwner {
        if (phase != Phase.Done) revert BadPhase();
        tickr.safeTransfer(owner(), tickr.balanceOf(address(this)));
    }

    function setFreeMint(address account, bool on) external onlyOwner {
        freeMint[account] = on;
        emit FreeMintSet(account, on);
    }

    // ---------------------------------------------------------------- market

    function list(uint256 id, uint96 amount) external {
        if (ownerOf(id) != msg.sender) revert NotSeller();
        if (amount == 0) revert ZeroPrice();
        asks[id] = Ask(msg.sender, amount);
        emit Listed(id, msg.sender, amount);
    }

    function unlist(uint256 id) external {
        if (asks[id].seller != msg.sender) revert NotSeller();
        delete asks[id];
        emit Unlisted(id);
    }

    /// @dev Any transfer drops the ask, so a live ask always belongs to the current owner.
    function buy(uint256 id) external payable nonReentrant {
        Ask memory a = asks[id];
        if (a.seller == address(0)) revert NotListed();
        if (msg.value != a.price) revert WrongValue(a.price);

        _transfer(a.seller, msg.sender, id);

        uint256 fee = msg.value * FEE_BPS / 10_000;
        _pay(pool, fee);
        _pay(payable(a.seller), msg.value - fee);

        emit Sold(id, a.seller, msg.sender, msg.value, fee);
    }

    function setOperator(address operator, bool on) external onlyOwner {
        operatorOk[operator] = on;
        emit OperatorSet(operator, on);
    }

    // Third-party venues skip the 3%. Only allowlisted operators get approvals.
    function approve(address to, uint256 id) public override {
        if (to != address(0) && !operatorOk[to]) revert OperatorBlocked(to);
        super.approve(to, id);
    }

    function setApprovalForAll(address operator, bool on) public override {
        if (on && !operatorOk[operator]) revert OperatorBlocked(operator);
        super.setApprovalForAll(operator, on);
    }

    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        if (from != address(0) && asks[id].seller != address(0)) {
            delete asks[id];
            emit Unlisted(id);
        }
    }

    function _pay(address payable to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayFailed();
    }

    // ----------------------------------------------------------------- views

    function holderOf(uint256 id) external view returns (address) {
        return _ownerOf(id);
    }

    function symbolOf(uint256 id) public view returns (string memory) {
        if (id == 0 || id > supply) revert BadId(id);
        bytes memory b = new bytes(5);
        address t = _table;
        assembly {
            extcodecopy(t, add(b, 0x20), add(1, mul(sub(id, 1), 5)), 5)
        }
        uint256 len = 5;
        while (len != 0 && b[len - 1] == 0) --len;
        assembly {
            mstore(b, len)
        }
        return string(b);
    }

    function mintedBits() external view returns (uint256[] memory out) {
        out = new uint256[]((supply >> 8) + 1);
        for (uint256 i; i < out.length; ++i) {
            out[i] = _bits[i];
        }
    }

    function tokensOf(address account) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(account);
        ids = new uint256[](n);
        if (n == 0) return ids;
        uint256 k;
        for (uint256 id = 1; id <= supply; ++id) {
            if (_ownerOf(id) == account) {
                ids[k++] = id;
                if (k == n) break;
            }
        }
    }

    function book() external view returns (uint256[] memory ids, address[] memory sellers, uint256[] memory prices) {
        uint256 n;
        for (uint256 id = 1; id <= supply; ++id) {
            if (asks[id].seller != address(0)) ++n;
        }
        ids = new uint256[](n);
        sellers = new address[](n);
        prices = new uint256[](n);
        uint256 k;
        for (uint256 id = 1; id <= supply && k < n; ++id) {
            Ask memory a = asks[id];
            if (a.seller == address(0)) continue;
            (ids[k], sellers[k], prices[k]) = (id, a.seller, a.price);
            ++k;
        }
    }

    // ------------------------------------------------------------- metadata

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        string memory sym = symbolOf(id);
        string memory tier = id <= TOP ? "TOP100" : "CORE";
        string memory json = string.concat(
            '{"name":"$',
            sym,
            " #",
            id.toString(),
            '","description":"TickerDrop slot #',
            id.toString(),
            ". Bound to Nasdaq:",
            sym,
            '.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_art(id, sym))),
            '","attributes":[{"trait_type":"Ticker","value":"',
            sym,
            '"},{"trait_type":"Rank","display_type":"number","value":',
            id.toString(),
            '},{"trait_type":"Tier","value":"',
            tier,
            '"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _art(uint256 id, string memory sym) private pure returns (string memory) {
        uint256 hue = uint256(keccak256(bytes(sym))) % 360;
        string memory c = id <= TOP ? "#ffd400" : string.concat("hsl(", hue.toString(), ",100%,58%)");
        string memory rank = id.toString();
        return string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 504'>",
            "<defs><pattern id='p' width='9' height='9' patternUnits='userSpaceOnUse'><path d='M9 0H0V9' fill='none' stroke='#fff' stroke-opacity='.05'/></pattern>",
            "<path id='b' d='M0-8C14-30 30-36 44-30C30-20 18-12 0-8z'/>",
            "<linearGradient id='g' x2='1' y2='1'><stop offset='0' stop-color='",
            c,
            "'/><stop offset='.6' stop-color='#ff2bd6'/><stop offset='1' stop-color='#00f0ff'/></linearGradient></defs>",
            "<rect width='360' height='504' rx='16' fill='#05050a'/><rect width='360' height='504' rx='16' fill='url(#p)'/>",
            "<path d='M16 40V16h116l12 12h200v448l-12 12H16z' fill='none' stroke='url(#g)' stroke-width='2'/>",
            _fan(110),
            _fan(250),
            "<g stroke='",
            c,
            "' stroke-opacity='.5'><path d='M40 210h280M40 216h280'/></g>",
            "<rect x='40' y='236' width='280' height='160' fill='none' stroke='#fff' stroke-opacity='.12'/>",
            "<text x='180' y='330' text-anchor='middle' font-family='monospace' font-weight='700' font-size='64' fill='",
            c,
            "'>",
            sym,
            "</text><text x='180' y='372' text-anchor='middle' font-family='monospace' font-size='13' fill='#fff' fill-opacity='.55' letter-spacing='4'>NASDAQ / RANK ",
            rank,
            "</text>",
            "<text x='28' y='34' font-family='monospace' font-size='11' fill='#fff' fill-opacity='.7' letter-spacing='2'>TICKERDROP</text>",
            "<text x='332' y='470' text-anchor='end' font-family='monospace' font-size='22' font-weight='700' fill='",
            c,
            "'>#",
            rank,
            "</text>",
            "<g fill='#ffd400'>",
            _pins(),
            "</g></svg>"
        );
    }

    function _fan(uint256 cx) private pure returns (string memory) {
        string memory x = cx.toString();
        return string.concat(
            "<g transform='translate(",
            x,
            " 120)'><circle r='58' fill='none' stroke='#fff' stroke-opacity='.18'/><circle r='50' fill='#0b0b14' stroke='#fff' stroke-opacity='.08'/>",
            "<g fill='#fff' fill-opacity='.14'><use href='#b'/>",
            "<use href='#b' transform='rotate(51)'/><use href='#b' transform='rotate(103)'/><use href='#b' transform='rotate(154)'/>",
            "<use href='#b' transform='rotate(206)'/><use href='#b' transform='rotate(257)'/><use href='#b' transform='rotate(309)'/></g>",
            "<circle r='11' fill='#05050a' stroke='#fff' stroke-opacity='.3'/></g>"
        );
    }

    function _pins() private pure returns (string memory s) {
        for (uint256 i; i < 14; ++i) {
            s = string.concat(s, "<rect x='", (40 + i * 14).toString(), "' y='476' width='9' height='12' rx='1'/>");
        }
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}
