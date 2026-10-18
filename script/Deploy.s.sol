// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {GainPool, IDrop} from "../src/GainPool.sol";
import {QuorumMarketOracle} from "../src/QuorumMarketOracle.sol";
import {IUniswapV2Router} from "../src/LiquidityVault.sol";

/// forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --private-key $PK
///   QUOTE_SIGNER_1/2/3   independent market-data attestation addresses (2 of 3 required)
contract Deploy is Script {
    struct CompanyInput {
        uint256 cap;
        uint256 id;
        string n;
        string s;
    }

    function run() external {
        bytes memory table = vm.parseBytes(vm.readFile("data/tickers.hex"));
        address[] memory quoteSigners = new address[](3);
        quoteSigners[0] = vm.envAddress("QUOTE_SIGNER_1");
        quoteSigners[1] = vm.envAddress("QUOTE_SIGNER_2");
        quoteSigners[2] = vm.envAddress("QUOTE_SIGNER_3");
        require(
            quoteSigners[0] != address(0) && quoteSigners[1] != address(0) && quoteSigners[2] != address(0)
                && quoteSigners[0] != quoteSigners[1] && quoteSigners[0] != quoteSigners[2]
                && quoteSigners[1] != quoteSigners[2],
            "Quote signers must be distinct"
        );
        CompanyInput[] memory companies = abi.decode(vm.parseJson(vm.readFile("data/tickers.json")), (CompanyInput[]));
        require(companies.length == table.length / 5, "Metadata count mismatch");
        for (uint256 i; i < companies.length; ++i) {
            require(companies[i].id == i + 1 && companies[i].cap <= type(uint128).max, "Invalid company metadata");
        }
        address router = vm.envOr("V2_ROUTER", address(0x89e5DB8B5aA49aA85AC63f691524311AEB649eba));
        require(router.code.length != 0, "V2 router unavailable");
        require(IUniswapV2Router(router).WETH().code.length != 0, "Router WETH unavailable");
        require(IUniswapV2Router(router).factory().code.length != 0, "Router factory unavailable");

        vm.startBroadcast();

        Tickr tkr = new Tickr();
        GainPool pool = new GainPool(IERC20(address(tkr)), quoteSigners[0]);
        TickerDrop nft = new TickerDrop(IERC20(address(tkr)), payable(address(pool)), table);
        tkr.liquidityVault().configure(address(nft), IUniswapV2Router(router));

        pool.bind(IDrop(address(nft)));
        tkr.setPool(address(pool));
        QuorumMarketOracle oracle = new QuorumMarketOracle(address(pool), quoteSigners, 2);
        pool.bindMarketOracle(oracle);
        // Names and market caps remain in the versioned website dataset. The compact ticker table
        // alone is immutable on-chain; verify that the two datasets map to the same NFT ids.
        for (uint256 i; i < companies.length; ++i) {
            require(keccak256(bytes(companies[i].s)) == keccak256(bytes(nft.symbolOf(i + 1))), "Ticker mismatch");
        }
        require(tkr.transfer(address(nft), nft.supply() * nft.DROP()), "Drop funding failed");
        uint256 rewardBudget = nft.supply() * nft.INVITE_REWARD();
        require(tkr.approve(address(nft), rewardBudget), "Reward approval failed");
        nft.fundReferral(rewardBudget);
        tkr.renounceOwnership();
        nft.openMint();

        vm.stopBroadcast();

        console2.log("Tickr     ", address(tkr));
        console2.log("GainPool  ", address(pool));
        console2.log("TickerDrop", address(nft));
        console2.log("supply    ", nft.supply());
        console2.log("Quote quorum", address(oracle));
    }
}
