// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Tickr} from "../src/Tickr.sol";
import {IUniswapV2Router, IUniswapV2Factory} from "../src/LiquidityVault.sol";

/// @notice Run only after verifying the pair and adding liquidity.
/// TICKR=<address> forge script script/Finalize.s.sol --rpc-url robinhood --broadcast
contract Finalize is Script {
    function run() external {
        Tickr token = Tickr(vm.envAddress("TICKR"));
        IUniswapV2Router router = token.liquidityVault().router();
        address pair = IUniswapV2Factory(router.factory()).getPair(address(token), router.WETH());
        require(pair.code.length != 0, "Pair is not deployed");
        require(token.liveAt() == 0, "Already live");

        vm.startBroadcast();
        token.goLive();
        vm.stopBroadcast();

        require(token.owner() == address(0), "Owner not relinquished");
        console2.log("TICKR live and owner relinquished", address(token));
    }
}
