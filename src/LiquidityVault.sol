// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVaultToken is IERC20 {
    function owner() external view returns (address);
    function liveAt() external view returns (uint64);
    function goLive() external;
}

interface IVaultDrop {
    function tickr() external view returns (address);
    function supply() external view returns (uint256);
}

interface IUniswapV2Router {
    function WETH() external view returns (address);
    function factory() external view returns (address);
    function addLiquidityETH(
        address token, uint256 tokenDesired, uint256 tokenMin, uint256 ethMin,
        address to, uint256 deadline
    ) external payable returns (uint256 tokenUsed, uint256 ethUsed, uint256 liquidity);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

/// @notice Permanently holds the non-drop TICKR supply and all LP shares.
/// Mint payments accrue at a fixed 10% ETH / proportional TICKR allocation.
/// A failed or unfavorably priced add-liquidity call leaves the allocation queued.
contract LiquidityVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant RESERVE = 635_220_000 ether;
    uint256 public constant LIQUIDITY_BPS = 1_000;
    uint256 private constant BPS = 10_000;
    address private constant MAINNET_ROUTER = 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba;

    IVaultToken public immutable token;
    address public drop;
    IUniswapV2Router public router;
    uint256 public mintBudget;
    uint256 public accountedMintETH;
    uint256 public pendingTokens;
    uint256 public pendingETH;
    uint256 public addedETH;

    event Configured(address indexed drop, address indexed router);
    event LiquidityQueued(uint256 tokenAmount, uint256 ethAmount);
    event LiquidityAdded(uint256 tokenAmount, uint256 ethAmount, uint256 lpAmount);
    error Forbidden();
    error InvalidConfiguration();
    error InvalidMintPayment();

    constructor(IVaultToken token_) {
        token = token_;
    }

    receive() external payable {
        if (msg.sender != address(router)) revert Forbidden();
    }

    function configure(address drop_, IUniswapV2Router router_) external {
        if (msg.sender != token.owner()) revert Forbidden();
        if (drop != address(0) || address(router) != address(0) || drop_.code.length == 0
            || address(router_).code.length == 0 || IVaultDrop(drop_).tickr() != address(token)
            || router_.WETH().code.length == 0 || router_.factory().code.length == 0
            || (block.chainid == 4663 && address(router_) != MAINNET_ROUTER)) revert InvalidConfiguration();
        uint256 supply = IVaultDrop(drop_).supply();
        if (supply == 0 || supply > 4_800) revert InvalidConfiguration();
        uint256 premier = supply < 100 ? supply : 100;
        mintBudget = premier * 0.005 ether + (supply - premier) * 0.001 ether;
        drop = drop_;
        router = router_;
        emit Configured(drop_, address(router_));
    }

    function depositMint(uint256 cost) external payable nonReentrant {
        if (msg.sender != drop || mintBudget == 0) revert Forbidden();
        if (cost == 0 || accountedMintETH + cost > mintBudget || msg.value != cost * LIQUIDITY_BPS / BPS) {
            revert InvalidMintPayment();
        }
        uint256 oldAccounted = accountedMintETH;
        accountedMintETH += cost;
        uint256 tokens = RESERVE * accountedMintETH / mintBudget - RESERVE * oldAccounted / mintBudget;
        pendingTokens += tokens;
        pendingETH += msg.value;
        emit LiquidityQueued(tokens, msg.value);
        _process();
    }

    function processLiquidity() external nonReentrant {
        _process();
    }

    function _process() private {
        uint256 tokens = pendingTokens;
        uint256 ethAmount = pendingETH;
        if (tokens == 0 || ethAmount == 0) return;
        uint256 minTokens = tokens * 99 / 100;
        uint256 minETH = ethAmount * 99 / 100;
        IERC20(address(token)).forceApprove(address(router), tokens);
        try router.addLiquidityETH{value: ethAmount, gas: 2_000_000}(
            address(token), tokens, minTokens, minETH, address(this), block.timestamp
        ) returns (uint256 usedTokens, uint256 usedETH, uint256 lp) {
            if (usedTokens > tokens || usedETH > ethAmount || usedTokens < minTokens || usedETH < minETH || lp == 0) {
                revert InvalidConfiguration();
            }
            pendingTokens = tokens - usedTokens;
            pendingETH = ethAmount - usedETH;
            addedETH += usedETH;
            emit LiquidityAdded(usedTokens, usedETH, lp);
        } catch {
            // Reverted router calls restore asset movements; the allocation stays queued.
        }
        IERC20(address(token)).forceApprove(address(router), 0);
        if (token.owner() == address(0) && token.liveAt() == 0) {
            try token.goLive() {} catch {}
        }
    }
}
