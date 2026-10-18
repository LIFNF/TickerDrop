// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LiquidityVault, IVaultToken, IUniswapV2Router, IUniswapV2Factory} from "./LiquidityVault.sol";

/// @title Tickr
/// @notice 1B fixed supply. All ordinary transfers after launch pay 3% into the GainPool.
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

interface ILaunchPool {
    function drop() external view returns (address);
    function marketOracle() external view returns (address);
}

contract Tickr is ERC20, Ownable {
    using Checkpoints for Checkpoints.Trace208;
    mapping(address => Checkpoints.Trace208) private _balances;
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint256 public constant LOCKED_LIQUIDITY = 635_220_000 ether;
    uint256 public constant FEE_BPS = 300;

    address public pool;
    LiquidityVault public immutable liquidityVault;
    uint64 public liveAt;

    mapping(address => bool) public isPair;
    mapping(address => bool) public exempt;
    address[] private _temporaryExemptions;
    uint256 public pairCount;

    event PoolSet(address pool);
    event PairSet(address indexed pair, bool on);
    event ExemptSet(address indexed account, bool on);
    event Live(uint64 at);

    error NotLive();
    error Locked();
    error ZeroAddress();

    constructor() ERC20("TickerDrop", "Tickr") Ownable(msg.sender) {
        liquidityVault = new LiquidityVault(IVaultToken(address(this)));
        exempt[msg.sender] = true;
        exempt[address(liquidityVault)] = true;
        _temporaryExemptions.push(msg.sender);
        _mint(address(liquidityVault), LOCKED_LIQUIDITY);
        _mint(msg.sender, SUPPLY - LOCKED_LIQUIDITY);
    }

    function setPool(address pool_) external onlyOwner {
        if (pool != address(0)) revert Locked();
        if (pool_.code.length == 0) revert ZeroAddress();
        pool = pool_;
        exempt[pool_] = true;
        emit PoolSet(pool_);
    }

    function setPair(address pair, bool on) external onlyOwner {
        if (liveAt != 0) revert Locked();
        if (pair == address(0)) revert ZeroAddress();
        if (on != isPair[pair]) {
            if (on) ++pairCount;
            else --pairCount;
        }
        isPair[pair] = on;
        emit PairSet(pair, on);
    }

    function setExempt(address account, bool on) external onlyOwner {
        if (liveAt != 0) revert Locked();
        if (on && !exempt[account]) _temporaryExemptions.push(account);
        exempt[account] = on;
        emit ExemptSet(account, on);
    }

    /// @notice Call once liquidity is in. Opens pair trading and starts the daily settlement clock.
    function goLive() external {
        if (liveAt != 0) revert Locked();
        if (pool == address(0)) revert ZeroAddress();
        if (ILaunchPool(pool).drop() == address(0) || ILaunchPool(pool).marketOracle() == address(0)
            || liquidityVault.drop() != ILaunchPool(pool).drop()) revert Locked();
        IUniswapV2Router router = liquidityVault.router();
        address pair = IUniswapV2Factory(router.factory()).getPair(address(this), router.WETH());
        if (pair.code.length != 0 && !isPair[pair]) {
            isPair[pair] = true;
            ++pairCount;
            emit PairSet(pair, true);
        }
        if (pairCount == 0) revert Locked();
        for (uint256 i; i < _temporaryExemptions.length; ++i) {
            exempt[_temporaryExemptions[i]] = false;
        }
        exempt[pool] = true;
        exempt[ILaunchPool(pool).drop()] = true;
        exempt[address(liquidityVault)] = true;
        liveAt = uint64(block.timestamp);
        emit Live(liveAt);
        if (owner() != address(0)) _transferOwnership(address(0));
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && !exempt[from] && !exempt[to]) {
            if (liveAt == 0) {
                if (isPair[from] || isPair[to]) revert NotLive();
            } else {
                uint256 fee = value * FEE_BPS / 10_000;
                if (fee != 0) {
                    super._update(from, pool, fee);
                    value -= fee;
                }
            }
        }
        super._update(from, to, value);
        _checkpoint(from);
        _checkpoint(to);
        if (pool != address(0)) _checkpoint(pool);
    }

    function balanceAt(address account, uint48 timestamp) external view returns (uint256) {
        require(timestamp < block.timestamp, "Snapshot not final");
        return _balances[account].upperLookup(timestamp);
    }

    function _checkpoint(address account) private {
        if (account != address(0)) _balances[account].push(uint48(block.timestamp), uint208(balanceOf(account)));
    }
}
