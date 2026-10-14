// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {GainPool, IDrop} from "../src/GainPool.sol";

/// forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --private-key $PK
///   REPORTER   address allowed to post daily results (default: deployer)
///   OPEN_MINT  1 to open the mint in the same run (default: 1)
contract Deploy is Script {
    function run() external {
        bytes memory table = vm.parseBytes(vm.readFile("data/tickers.hex"));
        address reporter = vm.envOr("REPORTER", msg.sender);
        bool open = vm.envOr("OPEN_MINT", uint256(1)) == 1;

        vm.startBroadcast();

        Tickr tkr = new Tickr();
        GainPool pool = new GainPool(IERC20(address(tkr)), reporter);
        TickerDrop nft = new TickerDrop(IERC20(address(tkr)), payable(address(pool)), table);

        pool.bind(IDrop(address(nft)));
        tkr.setPool(address(pool));
        tkr.transfer(address(nft), nft.supply() * nft.DROP());
        if (open) nft.openMint();

        vm.stopBroadcast();

        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "tickr", address(tkr));
        vm.serializeAddress(o, "pool", address(pool));
        string memory json = vm.serializeAddress(o, "drop", address(nft));
        vm.writeJson(json, "web/src/chain/deployed.json");

        console2.log("Tickr     ", address(tkr));
        console2.log("GainPool  ", address(pool));
        console2.log("TickerDrop", address(nft));
        console2.log("supply    ", nft.supply());
        console2.log("liquidity ", tkr.balanceOf(msg.sender) / 1 ether);
    }
}
