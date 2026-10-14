// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Tickr
/// @notice 1B fixed supply. Buys and sells against registered pairs pay 3% into the GainPool.
contract Tickr is ERC20, Ownable {
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint256 public constant FEE_BPS = 300;

    address public pool;
    uint64 public liveAt;

    mapping(address => bool) public isPair;
    mapping(address => bool) public exempt;

    event PoolSet(address pool);
    event PairSet(address indexed pair, bool on);
    event ExemptSet(address indexed account, bool on);
    event Live(uint64 at);

    error NotLive();
    error Locked();
    error ZeroAddress();

    constructor() ERC20("TickerDrop", "Tickr") Ownable(msg.sender) {
        exempt[msg.sender] = true;
        _mint(msg.sender, SUPPLY);
    }

    function setPool(address pool_) external onlyOwner {
        if (pool != address(0)) revert Locked();
        if (pool_ == address(0)) revert ZeroAddress();
        pool = pool_;
        exempt[pool_] = true;
        emit PoolSet(pool_);
    }

    function setPair(address pair, bool on) external onlyOwner {
        if (pair == address(0)) revert ZeroAddress();
        isPair[pair] = on;
        emit PairSet(pair, on);
    }

    function setExempt(address account, bool on) external onlyOwner {
        exempt[account] = on;
        emit ExemptSet(account, on);
    }

    /// @notice Call once liquidity is in. Opens pair trading and starts the daily settlement clock.
    function goLive() external onlyOwner {
        if (liveAt != 0) revert Locked();
        if (pool == address(0)) revert ZeroAddress();
        liveAt = uint64(block.timestamp);
        emit Live(liveAt);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && (isPair[from] || isPair[to]) && !exempt[from] && !exempt[to]) {
            if (liveAt == 0) revert NotLive();
            uint256 fee = value * FEE_BPS / 10_000;
            if (fee != 0) {
                super._update(from, pool, fee);
                value -= fee;
            }
        }
        super._update(from, to, value);
    }
}
