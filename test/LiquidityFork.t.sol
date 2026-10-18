// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {LiquidityVault, IUniswapV2Router} from "../src/LiquidityVault.sol";
import {GainPool, IDrop} from "../src/GainPool.sol";
import {QuorumMarketOracle} from "../src/QuorumMarketOracle.sol";

interface ISwapRouter {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 minOut, address[] calldata path, address to, uint256 deadline) external payable;
}

/// @notice Opt-in integration test: uses the deployed Robinhood Uniswap V2 contracts, without broadcasting.
contract LiquidityForkTest is Test {
    receive() external payable {}

    function test_realRouterTwoMintsBurnLP() public {
        _run(false);
    }

    function test_realTradeChangesRatioThenMintStillSucceeds() public {
        _run(true);
    }

    function _run(bool trade) private {
        string memory rpc = vm.envOr("LIQUIDITY_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) { vm.skip(true); return; }
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 4663);
        Tickr token = new Tickr();
        LiquidityVault vault = token.liquidityVault();
        GainPool pool = new GainPool(IERC20(address(token)), address(101));
        TickerDrop nft = new TickerDrop(IERC20(address(token)), payable(address(pool)), hex"41414100004242420000");
        vault.configure(address(nft), IUniswapV2Router(vault.MAINNET_ROUTER()));
        pool.bind(IDrop(address(nft)));
        address[] memory signers = new address[](3);
        signers[0] = address(101); signers[1] = address(102); signers[2] = address(103);
        pool.bindMarketOracle(new QuorumMarketOracle(address(pool), signers, 2));
        token.setPool(address(pool));
        token.transfer(address(nft), 2 * nft.DROP());
        token.approve(address(nft), 2 * nft.INVITE_REWARD());
        nft.fundReferral(2 * nft.INVITE_REWARD());
        token.renounceOwnership();
        nft.openMint();
        vm.deal(address(this), 1 ether);
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        nft.mint{value: 0.005 ether}(ids, bytes5(0));
        assertGt(token.liveAt(), 0);
        assertEq(token.owner(), address(0));
        assertEq(nft.owner(), address(0));
        if (trade) {
            address[] memory path = new address[](2);
            path[0] = vault.wrappedNative(); path[1] = address(token);
            ISwapRouter(address(vault.router())).swapExactETHForTokensSupportingFeeOnTransferTokens{value:0.001 ether}(
                1, path, address(777), block.timestamp
            );
            assertGt(token.balanceOf(address(777)), 0);
            assertGt(token.balanceOf(address(pool)), 0);
        }
        ids[0] = 2;
        nft.mint{value: 0.005 ether}(ids, bytes5(0));
        assertEq(nft.minted(), 2);
        assertEq(vault.accountedMintETH(), 0.01 ether);
        if (!trade) assertApproxEqAbs(vault.addedETH(), 0.009 ether, 10);
        assertApproxEqAbs(vault.addedETH() + address(vault).balance, 0.009 ether, 10);
        assertEq(vault.pair().balanceOf(address(vault)), 0);
        assertGt(vault.totalLpBurned(), 0);
        assertGe(vault.pair().balanceOf(address(0)), vault.totalLpBurned());
    }
}
