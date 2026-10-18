// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {Tickr} from "../src/Tickr.sol";
import {MockLiquidityRouter} from "./MockLiquidity.sol";
import {GainPool, IDrop} from "../src/GainPool.sol";
import {QuorumMarketOracle} from "../src/QuorumMarketOracle.sol";

contract InvitesTest is Test {
    TickerDrop nft;
    Tickr token;

    function setUp() public {
        token = new Tickr();
        bytes memory table;
        for (uint256 i; i < 60; ++i) table = bytes.concat(table, hex"4141410000");
        nft = new TickerDrop(IERC20(address(token)), payable(address(this)), table);
        token.liquidityVault().configure(address(nft), new MockLiquidityRouter());
        GainPool pool = new GainPool(IERC20(address(token)), address(101));
        pool.bind(IDrop(address(nft)));
        address[] memory signers = new address[](3);
        signers[0] = address(101); signers[1] = address(102); signers[2] = address(103);
        pool.bindMarketOracle(new QuorumMarketOracle(address(pool), signers, 2));
        token.setPool(address(pool));
        for (uint256 i = 1; i <= 60; ++i) nft.setCompany(i, "Company", 100);
        token.transfer(address(nft), nft.supply() * nft.DROP());
        token.approve(address(nft), nft.supply() * nft.INVITE_REWARD());
        nft.fundReferral(nft.supply() * nft.INVITE_REWARD());
        token.renounceOwnership();
        nft.openMint();
        vm.deal(address(this), 1 ether);
    }

    function _ids(uint256 id) private pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function _mint(address wallet, uint256 id, bytes5 code) private {
        vm.deal(wallet, 1 ether);
        vm.prank(wallet);
        nft.mint{value: 0.005 ether}(_ids(id), code);
    }

    function _fillDirect(uint256 count) private {
        for (uint256 i = 1; i <= count; ++i) _mint(address(uint160(0x1000 + i)), i, bytes5(0));
    }

    function test_connectionDoesNotReserveSlotButSuccessfulMintDoes() public {
        address wallet = address(101);
        bytes5 preview = nft.previewInvite(wallet);
        assertTrue(preview != bytes5(0));
        assertEq(nft.seedCount(), 0);
        assertEq(nft.registeredCount(), 0);
        _mint(wallet, 1, bytes5(0));
        assertEq(nft.seedCount(), 1);
        assertEq(nft.inviteOf(wallet), preview);
        assertEq(nft.inviteOwner(preview), wallet);
    }

    function test_failedMintDoesNotUseSlot() public {
        address wallet = address(101);
        vm.deal(wallet, 1 ether);
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.WrongValue.selector, 0.005 ether));
        nft.mint{value: 1}(_ids(1), bytes5(0));
        assertEq(nft.seedCount(), 0);
        assertEq(nft.inviteOf(wallet), bytes5(0));
    }

    function test_fiftiethConfirmedWalletTakesLastSlot() public {
        _fillDirect(49);
        address last = address(777);
        bytes5 preview = nft.previewInvite(last);
        _mint(last, 50, bytes5(0));
        assertEq(nft.seedCount(), 50);
        assertEq(nft.inviteOf(last), preview);
        assertEq(nft.previewInvite(address(778)), bytes5(0));
        vm.deal(address(778), 1 ether);
        vm.prank(address(778));
        vm.expectRevert(TickerDrop.InvalidInvite.selector);
        nft.mint{value: 0.005 ether}(_ids(51), bytes5(0));
        _mint(address(778), 51, preview);
        assertEq(nft.seedCount(), 50);
        assertEq(nft.redeemedInvite(address(778)), preview);
        assertEq(nft.inviteUses(preview), 1);
    }

    function test_batchUsesOneWalletSlot() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        nft.mint{value: 0.01 ether}(ids, bytes5(0));
        assertEq(nft.seedCount(), 1);
        assertEq(nft.minted(), 2);
        assertTrue(nft.inviteOf(address(this)) != bytes5(0));
    }

    function test_referralPaysExtraAndOnlyFirstMintConsumesPlace() public {
        _fillDirect(50);
        address inviter = address(uint160(0x1001));
        bytes5 code = nft.inviteOf(inviter);
        uint256 reserve = nft.referralReserve();
        _mint(address(999), 51, code);
        _mint(address(999), 52, bytes5(0));
        assertEq(token.balanceOf(address(999)), 200_000 ether);
        assertEq(nft.referralEarned(inviter), 30_000 ether);
        assertEq(nft.inviteUses(code), 1);
        assertEq(nft.referralReserve(), reserve - 30_000 ether);
    }

    function test_threeDifferentWalletsPerCode() public {
        _fillDirect(50);
        bytes5 code = nft.inviteOf(address(uint160(0x1001)));
        _mint(address(501), 51, code);
        _mint(address(502), 52, code);
        _mint(address(503), 53, code);
        vm.deal(address(504), 1 ether);
        vm.prank(address(504));
        vm.expectRevert(TickerDrop.InviteExhausted.selector);
        nft.mint{value: 0.005 ether}(_ids(54), code);
        assertEq(nft.inviteUses(code), 3);
    }

    function testFuzz_codeIsFiveUppercaseAlphanumeric(address wallet) public {
        vm.assume(wallet != address(0));
        bytes5 code = nft.previewInvite(wallet);
        for (uint256 i; i < 5; ++i) {
            uint8 c = uint8(code[i]);
            assertTrue((c >= 48 && c <= 57) || (c >= 65 && c <= 90));
        }
    }

    receive() external payable {}
}
