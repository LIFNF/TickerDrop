// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {LiquidityVault} from "../src/LiquidityVault.sol";
import {MockLiquidityRouter} from "./MockLiquidity.sol";

contract LiquidityVaultTest is Test {
    receive() external payable {}
    Tickr token;
    TickerDrop drop;
    LiquidityVault vault;
    MockLiquidityRouter router;

    function setUp() public {
        token = new Tickr();
        vault = token.liquidityVault();
        drop = new TickerDrop(IERC20(address(token)), payable(address(this)), hex"41414100004242420000");
        router = new MockLiquidityRouter();
        vault.configure(address(drop), router);
        drop.setCompany(1, "Alpha", 100);
        drop.setCompany(2, "Beta", 100);
        token.transfer(address(drop), 2 * drop.DROP());
        token.approve(address(drop), 2 * drop.INVITE_REWARD());
        drop.fundReferral(2 * drop.INVITE_REWARD());
        drop.openMint();
        vm.deal(address(this), 1 ether);
    }

    function _mint(uint256 id) private {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        drop.mint{value: 0.005 ether}(ids, bytes5(0));
    }

    function test_allReserveLockedAndMintSplitsTenNinety() public {
        assertEq(token.balanceOf(address(vault)), 635_220_000 ether);
        assertEq(token.balanceOf(address(this)), 364_780_000 ether - 230_000 ether);
        uint256 before = address(this).balance;
        _mint(1);
        assertEq(router.ethAdded(), 0.0005 ether);
        assertEq(vault.addedETH(), 0.0005 ether);
        assertEq(router.tokenAdded(), 317_610_000 ether);
        assertEq(router.lpBalance(address(vault)), 1);
        assertEq(address(this).balance, before - 0.0005 ether);
        _mint(2);
        assertEq(router.ethAdded(), 0.001 ether);
        assertEq(vault.addedETH(), 0.001 ether);
        assertEq(router.tokenAdded(), 635_220_000 ether);
        assertEq(token.balanceOf(address(vault)), 0);
        assertEq(router.lpBalance(address(vault)), 2);
        (bool canWithdraw,) = address(vault).call(abi.encodeWithSignature("withdraw(address,uint256)", address(this), 1));
        assertFalse(canWithdraw);
    }

    function test_routerFailureQueuesLiquidityWithoutBlockingMint() public {
        router.setReject(true);
        _mint(1);
        assertEq(vault.pendingETH(), 0.0005 ether);
        assertEq(vault.addedETH(), 0);
        assertEq(vault.pendingTokens(), 317_610_000 ether);
        assertEq(drop.minted(), 1);
        router.setReject(false);
        vm.prank(address(777));
        vault.processLiquidity();
        assertEq(vault.pendingETH(), 0);
        assertEq(vault.addedETH(), 0.0005 ether);
        assertEq(vault.pendingTokens(), 0);
        assertEq(router.lpBalance(address(vault)), 1);
    }

    function test_onlyBoundDropCanAllocateReserve() public {
        vm.deal(address(777), 1 ether);
        vm.prank(address(777));
        vm.expectRevert(LiquidityVault.Forbidden.selector);
        vault.depositMint{value: 0.0005 ether}(0.005 ether);
    }
}
