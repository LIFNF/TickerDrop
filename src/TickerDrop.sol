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
import {CompanyData} from "./CompanyData.sol";
import {LiquidityVault} from "./LiquidityVault.sol";

interface ILiquidityToken {
    function liquidityVault() external view returns (address);
}

/// @title TickerDrop
/// @notice One token per Nasdaq listing, id = market cap rank at snapshot.
///         Secondary sales clear through the built-in book at a 3% fee to the GainPool.
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

contract TickerDrop is ERC721, ERC2981, Ownable, ReentrancyGuard {
    using Checkpoints for Checkpoints.Trace208;
    mapping(uint256 => Checkpoints.Trace208) private _holders;
    bool private _bookTransfer;

    struct Company {
        string name;
        uint128 marketCap;
    }
    mapping(uint256 => Company) private _companies;
    mapping(uint256 => address) private _companyChunks;
    uint256 public constant COMPANY_CHUNK = 64;
    uint256 public metadataCount;
    event CompanySet(uint256 indexed id, string name, uint128 marketCap);
    event CompanyChunkSet(uint256 indexed firstId, uint256 count, bytes32 dataHash);
    error BookOnly();
    using SafeERC20 for IERC20;
    using Strings for uint256;

    address payable public immutable mintRecipient;
    LiquidityVault public immutable liquidityVault;

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

    mapping(address => bytes5) public inviteOf;
    mapping(bytes5 => address) public inviteOwner;
    mapping(bytes5 => uint8) public inviteUses;
    mapping(address => bytes5) public redeemedInvite;
    mapping(address => bool) public registeredWallet;
    uint256 public registeredCount;
    uint256 public seedCount;
    uint256 public constant SEED_LIMIT = 50;
    uint256 public constant INVITE_REWARD = DROP * 15 / 100;
    uint256 public referralReserve;
    uint256 public referralPaid;
    mapping(address => uint256) public referralEarned;
    uint256 private constant INVITE_SPACE = 36 ** 5;
    event InviteRegistered(address indexed wallet, bytes5 indexed code);
    event InviteRedeemed(address indexed wallet, bytes5 indexed code, uint8 uses);
    event WalletRegistered(address indexed wallet, uint256 registrationNumber);
    event ReferralFunded(address indexed funder, uint256 amount);
    event ReferralPaid(address indexed inviter, address indexed minter, bytes5 indexed code, uint256 amount);
    error InvalidInvite();
    error InviteExhausted();
    error InviteCollision();
    error ReferralPoolLow();

    mapping(uint256 => uint256) private _bits;
    mapping(uint256 => Ask) public asks;
    mapping(address => bool) public operatorOk;

    event PhaseSet(Phase phase);
    event Minted(address indexed to, uint256 count, uint256 paid);
    event Listed(uint256 indexed id, address indexed seller, uint256 price);
    event Unlisted(uint256 indexed id);
    event Sold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
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
        for (uint256 offset; offset < table.length; offset += 5) {
            if (table[offset] == 0) revert BadTable();
            bool padding;
            for (uint256 i; i < 5; ++i) {
                uint8 c = uint8(table[offset + i]);
                if (c == 0) {
                    padding = true;
                } else if (padding || !((c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c == 46 || c == 45)) {
                    revert BadTable();
                }
            }
        }

        bytes memory code = abi.encodePacked(hex"61", uint16(table.length + 1), hex"80600a3d393df300", table);
        address t;
        assembly {
            t := create(0, add(code, 0x20), mload(code))
        }
        if (t == address(0)) revert BadTable();

        tickr = tickr_;
        pool = pool_;
        mintRecipient = payable(msg.sender);
        liquidityVault = LiquidityVault(payable(ILiquidityToken(address(tickr_)).liquidityVault()));
        supply = table.length / 5;
        _table = t;

        _setDefaultRoyalty(pool_, FEE_BPS);
    }

    // ------------------------------------------------------------------ mint

    function price(uint256 id) public pure returns (uint256) {
        return id <= TOP ? TOP_PRICE : PRICE;
    }

    function quote(address, uint256[] calldata ids) external pure returns (uint256 cost) {
        for (uint256 i; i < ids.length; ++i) {
            cost += price(ids[i]);
        }
    }

    function previewInvite(address wallet) public view returns (bytes5) {
        if (wallet == address(0)) revert InvalidInvite();
        if (inviteOf[wallet] != bytes5(0)) return inviteOf[wallet];
        if (seedCount >= SEED_LIMIT || registeredWallet[wallet]) return bytes5(0);
        uint256 seed = uint256(keccak256(abi.encode(block.chainid, address(this), wallet))) % INVITE_SPACE;
        for (uint256 attempt; attempt < 32; ++attempt) {
            bytes5 code = _inviteCode((seed + attempt) % INVITE_SPACE);
            if (inviteOwner[code] == address(0)) return code;
        }
        revert InviteCollision();
    }

    function _inviteCode(uint256 value) private pure returns (bytes5) {
        bytes memory alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        bytes memory code = new bytes(5);
        for (uint256 i = 5; i > 0; --i) {
            code[i - 1] = alphabet[value % 36];
            value /= 36;
        }
        return bytes5(code);
    }

    function _registerWallet(address wallet, bool seedWallet) private {
        if (registeredWallet[wallet]) return;
        bytes5 code = seedWallet ? previewInvite(wallet) : bytes5(0);
        registeredWallet[wallet] = true;
        emit WalletRegistered(wallet, ++registeredCount);
        if (seedWallet) {
            ++seedCount;
            inviteOf[wallet] = code;
            inviteOwner[code] = wallet;
            emit InviteRegistered(wallet, code);
        }
    }

    function fundReferral(uint256 amount) external nonReentrant {
        if (phase == Phase.Done) revert BadPhase();
        if (amount == 0) revert BadCount();
        uint256 beforeBalance = tickr.balanceOf(address(this));
        tickr.safeTransferFrom(msg.sender, address(this), amount);
        if (tickr.balanceOf(address(this)) - beforeBalance != amount) revert ReferralPoolLow();
        referralReserve += amount;
        emit ReferralFunded(msg.sender, amount);
    }

    function mint(uint256[] calldata ids, bytes5 invitation) external payable nonReentrant {
        if (phase != Phase.Open) revert BadPhase();
        uint256 n = ids.length;
        if (n == 0 || n > MAX_PER_TX) revert BadCount();
        address inviter;
        bytes5 prior = redeemedInvite[msg.sender];
        bool seedWallet = !registeredWallet[msg.sender] && seedCount < SEED_LIMIT;
        if (seedWallet || inviteOf[msg.sender] != bytes5(0)) {
            if (invitation != bytes5(0)) revert InvalidInvite();
        } else {
            bytes5 linked = prior == bytes5(0) ? invitation : prior;
            if (linked == bytes5(0) || (invitation != bytes5(0) && invitation != linked)) revert InvalidInvite();
            inviter = inviteOwner[linked];
            if (inviter == address(0) || inviter == msg.sender) revert InvalidInvite();
            if (prior == bytes5(0)) {
                if (inviteUses[linked] >= 3) revert InviteExhausted();
                redeemedInvite[msg.sender] = linked;
                uint8 used = ++inviteUses[linked];
                emit InviteRedeemed(msg.sender, linked, used);
            }
        }
        uint256 reward = inviter == address(0) ? 0 : INVITE_REWARD * n;
        if (reward > referralReserve || tickr.balanceOf(address(this)) < (supply - minted) * DROP + referralReserve) {
            revert ReferralPoolLow();
        }
        _registerWallet(msg.sender, seedWallet);

        uint256 cost;
        for (uint256 i; i < n; ++i) {
            uint256 id = ids[i];
            if (id == 0 || id > supply) revert BadId(id);
            cost += price(id);
            _bits[id >> 8] |= 1 << (id & 0xff);
            _mint(msg.sender, id);
        }
        if (msg.value != cost) revert WrongValue(cost);

        minted += n;
        tickr.safeTransfer(msg.sender, DROP * n);
        if (reward != 0) {
            referralReserve -= reward;
            referralPaid += reward;
            referralEarned[inviter] += reward;
            tickr.safeTransfer(inviter, reward);
            emit ReferralPaid(inviter, msg.sender, redeemedInvite[msg.sender], reward);
        }

        if (cost != 0) {
            uint256 liquidityETH = cost * liquidityVault.LIQUIDITY_BPS() / 10_000;
            liquidityVault.depositMint{value: liquidityETH}(cost);
            (bool ok,) = mintRecipient.call{value: cost - liquidityETH}("");
            if (!ok) revert PayFailed();
        }
        emit Minted(msg.sender, n, cost);

        if (minted == supply) {
            phase = Phase.Done;
            emit PhaseSet(Phase.Done);
        }
    }

    function setCompany(uint256 id, string calldata name, uint128 marketCap) external onlyOwner {
        if (phase != Phase.Idle) revert BadPhase();
        _setCompany(id, name, marketCap);
    }

    function setCompanies(uint256[] calldata ids, string[] calldata names, uint128[] calldata caps) external onlyOwner {
        if (phase != Phase.Idle) revert BadPhase();
        if (ids.length == 0 || ids.length > 32 || ids.length != names.length || ids.length != caps.length) {
            revert BadCount();
        }
        for (uint256 i; i < ids.length; ++i) {
            _setCompany(ids[i], names[i], caps[i]);
        }
    }

    function _setCompany(uint256 id, string calldata name, uint128 marketCap) private {
        if (id == 0 || id > supply || bytes(name).length == 0 || bytes(name).length > 160) revert BadId(id);
        for (uint256 i; i < bytes(name).length; ++i) {
            require(uint8(bytes(name)[i]) >= 32, "Control character");
        }
        if (bytes(_companies[id].name).length == 0 && _companyChunks[(id - 1) / COMPANY_CHUNK] == address(0)) {
            metadataCount++;
        }
        _companies[id] = Company(name, marketCap);
        emit CompanySet(id, name, marketCap);
    }

    /// @notice Initialize the next aligned group as immutable code data.
    /// Layout: uint16 big-endian offsets (count + 1), then uint128 cap + name per company.
    function setCompanyChunk(bytes calldata data) external onlyOwner {
        if (phase != Phase.Idle) revert BadPhase();
        uint256 start = metadataCount;
        if (start >= supply || start % COMPANY_CHUNK != 0) revert BadCount();
        uint256 count = supply - start;
        if (count > COMPANY_CHUNK) count = COMPANY_CHUNK;
        uint256 header = (count + 1) * 2;
        if (data.length < header || data.length > 24_000 || _offset(data, 0) != header) revert BadCount();
        uint256 offset = header;
        for (uint256 i; i < count; ++i) {
            uint256 end = _offset(data, (i + 1) * 2);
            if (end < offset + 17 || end > data.length || end - offset > 176) revert BadCount();
            uint256 id = start + i + 1;
            // A sparse earlier setCompany must not be silently replaced or counted twice.
            if (bytes(_companies[id].name).length != 0) revert BadId(id);
            // Bounds above cover the complete name; avoid a repeated calldata bounds check per byte.
            bool control;
            assembly ("memory-safe") {
                let nameEnd := add(data.offset, end)
                for { let p := add(data.offset, add(offset, 16)) } lt(p, nameEnd) { p := add(p, 1) } {
                    if lt(byte(0, calldataload(p)), 32) {
                        control := 1
                        break
                    }
                }
            }
            require(!control, "Control character");
            offset = end;
        }
        if (offset != data.length) revert BadCount();
        _companyChunks[start / COMPANY_CHUNK] = address(new CompanyData(data));
        metadataCount = start + count;
        emit CompanyChunkSet(start + 1, count, keccak256(data));
    }

    function _offset(bytes calldata data, uint256 position) private pure returns (uint256) {
        return (uint256(uint8(data[position])) << 8) | uint8(data[position + 1]);
    }

    function companies(uint256 id) public view returns (string memory name, uint128 marketCap) {
        Company memory c = _company(id);
        return (c.name, c.marketCap);
    }

    function _company(uint256 id) private view returns (Company memory c) {
        c = _companies[id];
        if (bytes(c.name).length != 0 || id == 0 || id > supply) return c;
        address blob = _companyChunks[(id - 1) / COMPANY_CHUNK];
        if (blob == address(0)) return c;
        uint256 position = 1 + ((id - 1) % COMPANY_CHUNK) * 2;
        uint256 offset;
        uint256 end;
        assembly ("memory-safe") {
            let scratch := mload(0x40)
            extcodecopy(blob, scratch, position, 4)
            offset := shr(240, mload(scratch))
            end := and(shr(224, mload(scratch)), 0xffff)
            extcodecopy(blob, scratch, add(1, offset), 16)
            mstore(add(c, 32), shr(128, mload(scratch)))
        }
        bytes memory name = new bytes(end - offset - 16);
        assembly ("memory-safe") {
            extcodecopy(blob, add(name, 32), add(17, offset), mload(name))
        }
        c.name = string(name);
    }

    function openMint() external onlyOwner {
        if (phase != Phase.Idle) revert BadPhase();
        if (referralReserve != supply * INVITE_REWARD
            || tickr.balanceOf(address(this)) < supply * DROP + referralReserve) revert BadPhase();
        phase = Phase.Open;
        emit PhaseSet(Phase.Open);
        _transferOwnership(address(0));
    }

    /// @notice Anyone may release unused referral tokens after the collection sells out.
    function sweep() external {
        if (phase != Phase.Done) revert BadPhase();
        referralReserve = 0;
        tickr.safeTransfer(mintRecipient, tickr.balanceOf(address(this)));
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

        _bookTransfer = true;
        _transfer(a.seller, msg.sender, id);
        _bookTransfer = false;

        uint256 fee = msg.value * FEE_BPS / 10_000;
        _pay(pool, fee);
        _pay(payable(a.seller), msg.value - fee);

        emit Sold(id, a.seller, msg.sender, msg.value, fee);
    }

    function setOperator(address operator, bool on) external onlyOwner {
        if (on) revert BookOnly();
        operatorOk[operator] = false;
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
        if (_ownerOf(id) != address(0) && !_bookTransfer) revert BookOnly();
        from = super._update(to, id, auth);
        _holders[id].push(uint48(block.timestamp), uint208(uint160(to)));
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

    function holderAt(uint256 id, uint48 timestamp) external view returns (address) {
        require(timestamp < block.timestamp, "Snapshot not final");
        return address(uint160(_holders[id].upperLookup(timestamp)));
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
        Company memory company = _company(id);
        string memory sym = symbolOf(id);
        string memory tier = id <= TOP ? "TOP100" : "CORE";
        string memory companyAttributes = bytes(company.name).length == 0 ? "" : string.concat(
            ',{"trait_type":"Company","value":"', _escape(company.name, false),
            '"},{"trait_type":"Market cap at collection snapshot","value":',
            uint256(company.marketCap).toString(), "}"
        );
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
            '"}', companyAttributes, "]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _art(uint256 id, string memory sym) private view returns (string memory) {
        Company memory company = _company(id);
        string memory color = id <= TOP ? "#bddc89" : "#83b9d9";
        return string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 192'>",
            "<rect width='360' height='192' fill='#0b0f16'/><path d='M0 1H359V191H1V0' fill='none' stroke='#293541'/>",
            "<rect x='20' y='20' width='40' height='40' fill='#17221e' stroke='",
            color,
            "'/>",
            "<g font-family='monospace'><text x='40' y='48' text-anchor='middle' font-size='24' fill='",
            color,
            "'>",
            _escape(string(abi.encodePacked(bytes(sym)[0])), true),
            "</text>",
            "<text x='76' y='49' font-size='26' fill='#edf2f7'>",
            _escape(sym, true),
            "</text>",
            "<text x='338' y='42' text-anchor='end' font-size='15' fill='#8291a7'>#",
            id.toString(),
            "</text>",
            "<text x='20' y='90' font-size='11' fill='#a2adbd' textLength='310' lengthAdjust='spacingAndGlyphs'>",
            bytes(company.name).length == 0 ? "NASDAQ / VERIFIED TICKER" : _escape(company.name, true),
            "</text>",
            "<path d='M20 108H340' stroke='#253140'/><text x='20' y='133' font-size='10' fill='#7f8da1'>",
            bytes(company.name).length == 0 ? "COLLECTION RANK" : "MARKET CAP / DATASET",
            "</text><text x='20' y='157' font-size='17' fill='#d7e3ee'>",
            bytes(company.name).length == 0 ? string.concat("#", id.toString()) : string.concat("$", uint256(company.marketCap).toString()),
            "</text>",
            "<text x='338' y='157' text-anchor='end' font-size='14' fill='",
            color,
            "'>",
            id <= TOP ? "0.005 ETH" : "0.001 ETH",
            "</text>",
            "<text x='20' y='179' font-size='9' fill='",
            color,
            "'>NASDAQ / 1 OF 1 / +100000 TICKR</text></g></svg>"
        );
    }

    function _escape(string memory text, bool xml) private pure returns (string memory out) {
        bytes memory b = bytes(text);
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            if (xml && c == "&") out = string.concat(out, "&amp;");
            else if (xml && c == "<") out = string.concat(out, "&lt;");
            else if (xml && c == ">") out = string.concat(out, "&gt;");
            else if (!xml && (c == '"' || c == "\\")) out = string.concat(out, "\\", string(abi.encodePacked(c)));
            else out = string.concat(out, string(abi.encodePacked(c)));
        }
    }

    function supportsInterface(bytes4 id) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(id);
    }
}
