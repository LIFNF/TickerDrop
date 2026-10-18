// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

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
    function addLiquidityETH(address token, uint256 desired, uint256 minToken, uint256 minETH, address to, uint256 deadline)
        external payable returns (uint256 tokenUsed, uint256 ethUsed, uint256 liquidity);
}
interface IUniswapV2Factory {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}
interface IV2Pair is IERC20 {
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}

/// @notice V2: every successful mint adds liquidity and irreversibly locks its LP at address(0).
/// The 90% ETH budget is not a promise that the AMM can consume every wei at every market price.
/// Unused ETH/TICKR stay in this contract, have no withdrawal path, and may fund future mint additions.
contract LiquidityVault is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant VERSION = 2;
    uint256 public constant RESERVE = 635_220_000 ether;
    uint256 public constant LIQUIDITY_BPS = 9_000;
    uint256 public constant RECIPIENT_BPS = 1_000;
    uint256 public constant SLIPPAGE_BPS = 100;
    address public constant LP_BURN = address(0);
    address public constant MAINNET_ROUTER = 0x89e5DB8B5aA49aA85AC63f691524311AEB649eba;
    address public constant MAINNET_FACTORY = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    address public constant MAINNET_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    bytes32 public constant MAINNET_ROUTER_HASH = 0xbd55ea26b2f8d42a8ff151511cef92a326a9817686899fe96a8a8f81ee7fc55e;
    IVaultToken public immutable token;
    address public drop;
    IUniswapV2Router public router;
    IV2Pair public pair;
    address public factory;
    address public wrappedNative;
    uint256 public mintBudget;
    uint256 public accountedMintETH;
    uint256 public spentTokens;
    uint256 public addedETH;
    uint256 public totalLpBurned;

    event Configured(address indexed drop, address indexed router, address indexed pair);
    event LiquidityAddedAndBurned(uint256 tokenUsed, uint256 ethUsed, uint256 lpBurned, address indexed pair, address indexed sink);
    event UnusedBudgetLocked(uint256 ethBalance, uint256 tokenBalance);
    error Forbidden();
    error InvalidConfiguration();
    error InvalidMintPayment();
    error InventoryLow();
    error LiquidityFailed();
    error Expired();

    constructor(IVaultToken token_) { token = token_; }
    receive() external payable { if (msg.sender != address(router)) revert Forbidden(); }

    function configure(address drop_, IUniswapV2Router router_) external {
        if (msg.sender != token.owner()) revert Forbidden();
        if (drop != address(0) || drop_.code.length == 0 || address(router_).code.length == 0
            || IVaultDrop(drop_).tickr() != address(token)) revert InvalidConfiguration();
        address f = router_.factory();
        address w = router_.WETH();
        if (f.code.length == 0 || w.code.length == 0) revert InvalidConfiguration();
        if (block.chainid == 4663 && (address(router_) != MAINNET_ROUTER || f != MAINNET_FACTORY
            || w != MAINNET_WETH || address(router_).codehash != MAINNET_ROUTER_HASH)) revert InvalidConfiguration();
        address p = IUniswapV2Factory(f).getPair(address(token), w);
        if (p == address(0)) p = IUniswapV2Factory(f).createPair(address(token), w);
        if (p.code.length == 0 || IV2Pair(p).factory() != f) revert InvalidConfiguration();
        address a = IV2Pair(p).token0(); address b = IV2Pair(p).token1();
        if (!((a == address(token) && b == w) || (b == address(token) && a == w))) revert InvalidConfiguration();
        uint256 supply = IVaultDrop(drop_).supply();
        if (supply == 0 || supply > 4_800) revert InvalidConfiguration();
        uint256 premier = Math.min(supply, 100);
        mintBudget = premier * 0.005 ether + (supply - premier) * 0.001 ether;
        drop = drop_; router = router_; pair = IV2Pair(p); factory = f; wrappedNative = w;
        emit Configured(drop_, address(router_), p);
    }

    /// @return tokenDesired Bounded token spend, ethDesired Balanced ETH spend, ethBudget 90% budget plus locked remainder.
    function previewMint(uint256 cost) public view returns (uint256 tokenDesired, uint256 ethDesired, uint256 ethBudget) {
        if (drop == address(0) || cost == 0 || accountedMintETH + cost > mintBudget) revert InvalidMintPayment();
        uint256 entitlement = Math.mulDiv(RESERVE, accountedMintETH + cost, mintBudget);
        if (entitlement <= spentTokens) revert InventoryLow();
        tokenDesired = Math.min(entitlement - spentTokens, token.balanceOf(address(this)));
        ethBudget = address(this).balance + cost * LIQUIDITY_BPS / 10_000;
        ethDesired = ethBudget;
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 rt = pair.token0() == address(token) ? r0 : r1;
        uint256 re = pair.token0() == address(token) ? r1 : r0;
        if ((rt == 0) != (re == 0)) revert LiquidityFailed();
        if (rt != 0) {
            uint256 tokensForETH = Math.mulDiv(ethBudget, rt, re);
            if (tokensForETH <= tokenDesired) tokenDesired = tokensForETH;
            else ethDesired = Math.mulDiv(tokenDesired, re, rt);
        }
        if (tokenDesired == 0 || ethDesired == 0) revert InventoryLow();
    }

    function depositMint(uint256 cost) external payable nonReentrant {
        _deposit(cost, 1, type(uint256).max, block.timestamp);
    }
    function depositMint(uint256 cost, uint256 minLP, uint256 maxTokens, uint256 deadline) external payable nonReentrant {
        _deposit(cost, minLP, maxTokens, deadline);
    }
    function _deposit(uint256 cost, uint256 minLP, uint256 maxTokens, uint256 deadline) private {
        if (msg.sender != drop) revert Forbidden();
        if (deadline < block.timestamp || deadline > block.timestamp + 15 minutes) revert Expired();
        if (cost == 0 || msg.value != cost * LIQUIDITY_BPS / 10_000) revert InvalidMintPayment();
        // previewMint excludes the current payment, which has already arrived in this call.
        uint256 beforeETH = address(this).balance - msg.value;
        uint256 entitlement = Math.mulDiv(RESERVE, accountedMintETH + cost, mintBudget);
        if (accountedMintETH + cost > mintBudget || entitlement <= spentTokens) revert InvalidMintPayment();
        uint256 desired = Math.min(entitlement - spentTokens, token.balanceOf(address(this)));
        uint256 ethDesired = beforeETH + msg.value;
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 rt = pair.token0() == address(token) ? r0 : r1;
        uint256 re = pair.token0() == address(token) ? r1 : r0;
        if ((rt == 0) != (re == 0)) revert LiquidityFailed();
        if (rt != 0) {
            uint256 required = Math.mulDiv(ethDesired, rt, re);
            if (required <= desired) desired = required;
            else ethDesired = Math.mulDiv(desired, re, rt);
        }
        if (desired == 0 || ethDesired == 0 || desired > maxTokens) revert InventoryLow();
        uint256 tokensBefore = token.balanceOf(address(this));
        uint256 lpBefore = pair.balanceOf(address(this));
        IERC20(address(token)).forceApprove(address(router), desired);
        (uint256 usedT, uint256 usedE, uint256 lp) = router.addLiquidityETH{value:ethDesired}(
            address(token), desired, desired * 99 / 100, ethDesired * 99 / 100, address(this), deadline
        );
        IERC20(address(token)).forceApprove(address(router), 0);
        uint256 receivedLP = pair.balanceOf(address(this)) - lpBefore;
        if (usedT > desired || usedT < desired * 99 / 100 || usedE > ethDesired || usedE < ethDesired * 99 / 100
            || usedT == 0 || usedE == 0 || lp == 0 || receivedLP != lp || lp < minLP
            || tokensBefore - token.balanceOf(address(this)) != usedT
            || beforeETH + msg.value - address(this).balance != usedE) revert LiquidityFailed();
        uint256 burnAmount = pair.balanceOf(address(this));
        uint256 sinkBefore = pair.balanceOf(LP_BURN);
        IERC20(address(pair)).safeTransfer(LP_BURN, burnAmount);
        if (pair.balanceOf(address(this)) != 0 || pair.balanceOf(LP_BURN) != sinkBefore + burnAmount) revert LiquidityFailed();
        accountedMintETH += cost; spentTokens += usedT; addedETH += usedE; totalLpBurned += burnAmount;
        emit LiquidityAddedAndBurned(usedT, usedE, burnAmount, address(pair), LP_BURN);
        emit UnusedBudgetLocked(address(this).balance, token.balanceOf(address(this)));
        if (token.owner() == address(0) && token.liveAt() == 0) token.goLive();
    }
}
