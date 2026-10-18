// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {MockLiquidityRouter} from "./MockLiquidity.sol";

contract ReenterMintReceiver {
    TickerDrop public target;
    bool public attempted;
    bool public succeeded;

    function setTarget(TickerDrop nft) external {
        target = nft;
    }

    receive() external payable {
        if (attempted) return;
        attempted = true;
        uint256[] memory ids = new uint256[](1);
        ids[0] = 2;
        (succeeded,) = address(target).call{value: 0.005 ether}(abi.encodeCall(target.mint, (ids, bytes5(0))));
    }
}

contract ReenterBookSeller {
    TickerDrop public immutable target;
    bool public attempted;
    bool public succeeded;

    constructor(TickerDrop nft) {
        target = nft;
    }

    receive() external payable {
        if (attempted) return;
        attempted = true;
        (succeeded,) = address(target).call{value: 0.005 ether}(abi.encodeCall(target.buy, (2)));
    }
}

contract ReentrancyAttacksTest is Test {
    receive() external payable {}
    Tickr token;
    TickerDrop nft;
    address alice = address(101);
    address carol = address(102);

    function setUp() public {
        token = new Tickr();
        nft = new TickerDrop(IERC20(address(token)), payable(address(999)), hex"414141000042424200004343430000");
        token.liquidityVault().configure(address(nft), new MockLiquidityRouter());
        for (uint256 i = 1; i <= 3; i++) {
            nft.setCompany(i, "Company", 100);
        }
        token.transfer(address(nft), nft.supply() * nft.DROP());
        token.approve(address(nft), nft.supply() * nft.INVITE_REWARD());
        nft.fundReferral(nft.supply() * nft.INVITE_REWARD());
        nft.openMint();
        vm.deal(alice, 1 ether);
        vm.deal(carol, 1 ether);
    }

    function _ids(uint256 id) private pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function test_maliciousMintFeeReceiverCannotMintAgainDuringPayment() public {
        ReenterMintReceiver attack = new ReenterMintReceiver();
        vm.deal(address(attack), 1 ether);
        Tickr attackToken = new Tickr();
        vm.prank(address(attack));
        TickerDrop attacked = new TickerDrop(IERC20(address(attackToken)), payable(address(999)), hex"41414100004242420000");
        attackToken.liquidityVault().configure(address(attacked), new MockLiquidityRouter());
        attack.setTarget(attacked);
        assertEq(attacked.mintRecipient(), payable(address(attack)));
        vm.prank(address(attack));
        attacked.setCompany(1, "Alpha", 100);
        vm.prank(address(attack));
        attacked.setCompany(2, "Beta", 100);
        attackToken.transfer(address(attacked), attacked.supply() * attacked.DROP());
        attackToken.approve(address(attacked), attacked.supply() * attacked.INVITE_REWARD());
        attacked.fundReferral(attacked.supply() * attacked.INVITE_REWARD());
        vm.prank(address(attack));
        attacked.openMint();
        vm.prank(alice);
        attacked.mint{value: 0.005 ether}(_ids(1), bytes5(0));
        assertTrue(attack.attempted());
        assertFalse(attack.succeeded());
        assertEq(attacked.minted(), 1);
        assertEq(attacked.ownerOf(1), alice);
        assertEq(attacked.holderOf(2), address(0));
        assertEq(attackToken.balanceOf(alice), attacked.DROP());
    }

    function test_sellerCannotReenterAnotherValidBookPurchase() public {
        ReenterBookSeller seller = new ReenterBookSeller(nft);
        vm.deal(address(seller), 1 ether);
        vm.prank(address(seller));
        nft.mint{value: 0.005 ether}(_ids(1), bytes5(0));
        vm.prank(address(seller));
        nft.list(1, 0.01 ether);
        vm.prank(carol);
        nft.mint{value: 0.005 ether}(_ids(2), bytes5(0));
        vm.prank(carol);
        nft.list(2, 0.005 ether);
        vm.prank(alice);
        nft.buy{value: 0.01 ether}(1);
        assertTrue(seller.attempted());
        assertFalse(seller.succeeded());
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(2), carol);
        assertEq(address(999).balance, 0.0003 ether);
    }
}
