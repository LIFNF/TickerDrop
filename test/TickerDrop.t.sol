// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {GainPool, IDrop} from "../src/GainPool.sol";

contract Rejector {
    receive() external payable {
        revert();
    }
}

contract TickerDropTest is Test {
    Tickr tkr;
    GainPool pool;
    TickerDrop nft;

    address dev = address(this);
    address reporter = makeAddr("reporter");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address pair = makeAddr("pair");
    address payable lp = payable(0x175d6A654568009273Fd08f1a29BE998b8BCB0dd);

    // 2025-10-14 (Tue), as days since epoch
    uint32 constant TUE = 20375;

    function setUp() public {
        vm.warp(uint256(TUE) * 1 days - 3 days);
        bytes memory table = vm.parseBytes(vm.readFile("data/tickers.hex"));

        tkr = new Tickr();
        pool = new GainPool(IERC20(address(tkr)), reporter);
        nft = new TickerDrop(IERC20(address(tkr)), payable(address(pool)), table);
        pool.bind(IDrop(address(nft)));
        tkr.setPool(address(pool));
        tkr.setPair(pair, true);
        tkr.transfer(address(nft), nft.supply() * nft.DROP());
        nft.openMint();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(pair, 0);
    }

    function _ids(uint256 a) internal pure returns (uint256[] memory r) {
        r = new uint256[](1);
        r[0] = a;
    }

    function _ids(uint256 a, uint256 b) internal pure returns (uint256[] memory r) {
        r = new uint256[](2);
        (r[0], r[1]) = (a, b);
    }

    function _mint(address who, uint256 id) internal {
        uint256 cost = nft.price(id);
        vm.prank(who);
        nft.mint{value: cost}(_ids(id));
    }

    function _round(uint16[] memory ids, uint32[] memory gains) internal {
        vm.prank(reporter);
        pool.settle(TUE, ids, gains);
    }

    function _live() internal {
        tkr.goLive();
        vm.warp(uint256(TUE) * 1 days + 21 hours + 5 minutes);
    }

    // ------------------------------------------------------------------ mint

    function test_table() public view {
        assertEq(nft.supply(), 3172);
        assertEq(nft.symbolOf(1), "NVDA");
        assertEq(nft.symbolOf(2), "AAPL");
    }

    function test_mintPricing() public {
        uint256 before = lp.balance;
        vm.prank(alice);
        nft.mint{value: 0.006 ether}(_ids(1, 101));
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(101), alice);
        assertEq(lp.balance - before, 0.006 ether);
        assertEq(tkr.balanceOf(alice), 200_000 ether);
        assertEq(nft.minted(), 2);
    }

    function test_mintWrongValue() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.WrongValue.selector, 0.005 ether));
        nft.mint{value: 0.001 ether}(_ids(1));
    }

    function test_mintTwice() public {
        _mint(alice, 7);
        vm.prank(bob);
        vm.expectRevert();
        nft.mint{value: 0.001 ether}(_ids(7));
    }

    function test_lpFreeMint() public {
        vm.prank(lp);
        nft.mint(_ids(1, 2));
        assertEq(nft.ownerOf(2), lp);
        assertEq(tkr.balanceOf(lp), 200_000 ether);
    }

    function test_closedMint() public {
        nft.closeMint();
        vm.prank(alice);
        vm.expectRevert(TickerDrop.BadPhase.selector);
        nft.mint{value: 0.001 ether}(_ids(500));
        nft.sweep();
        assertEq(tkr.balanceOf(address(nft)), 0);
    }

    function test_tokenURI() public {
        _mint(alice, 1);
        string memory uri = nft.tokenURI(1);
        assertGt(bytes(uri).length, 1000);
    }

    // --------------------------------------------------------------- market

    function test_bookSale() public {
        _mint(alice, 200);
        vm.prank(alice);
        nft.list(200, 1 ether);

        uint256 a0 = alice.balance;
        vm.prank(bob);
        nft.buy{value: 1 ether}(200);

        assertEq(nft.ownerOf(200), bob);
        assertEq(address(pool).balance, 0.03 ether);
        assertEq(alice.balance - a0, 0.97 ether);
        (address s,) = nft.asks(200);
        assertEq(s, address(0));
    }

    function test_transferKillsAsk() public {
        _mint(alice, 200);
        vm.startPrank(alice);
        nft.list(200, 1 ether);
        nft.transferFrom(alice, carol, 200);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(TickerDrop.NotListed.selector);
        nft.buy{value: 1 ether}(200);
    }

    function test_operatorsBlocked() public {
        _mint(alice, 200);
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.OperatorBlocked.selector, bob));
        nft.setApprovalForAll(bob, true);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.OperatorBlocked.selector, bob));
        nft.approve(bob, 200);
        vm.stopPrank();
    }

    function test_royaltyInfo() public view {
        (address r, uint256 amt) = nft.royaltyInfo(5, 1 ether);
        assertEq(r, address(pool));
        assertEq(amt, 0.03 ether);
    }

    // ---------------------------------------------------------------- token

    function test_pairLockedBeforeLive() public {
        tkr.transfer(alice, 1000 ether);
        vm.prank(alice);
        vm.expectRevert(Tickr.NotLive.selector);
        tkr.transfer(pair, 100 ether);
    }

    function test_tradeFee() public {
        tkr.goLive();
        tkr.transfer(alice, 1000 ether);
        vm.prank(alice);
        tkr.transfer(pair, 1000 ether);
        assertEq(tkr.balanceOf(pair), 970 ether);
        assertEq(tkr.balanceOf(address(pool)), 30 ether);

        vm.prank(pair);
        tkr.transfer(bob, 100 ether);
        assertEq(tkr.balanceOf(bob), 97 ether);

        vm.prank(bob);
        tkr.transfer(carol, 50 ether);
        assertEq(tkr.balanceOf(carol), 50 ether);
    }

    // --------------------------------------------------------------- payout

    function _fund(uint256 eth, uint256 tkn) internal {
        vm.deal(address(pool), eth);
        tkr.transfer(address(pool), tkn);
    }

    function test_cutoffAtFull() public {
        _mint(alice, 10);
        _mint(bob, 20);
        _mint(carol, 30);
        _live();
        _fund(1 ether, 1000 ether);

        // 60% + 30% + 25% -> 60 / 30 / 10 (clipped)
        uint16[] memory ids = new uint16[](3);
        uint32[] memory g = new uint32[](3);
        (ids[0], ids[1], ids[2]) = (20, 10, 30);
        (g[0], g[1], g[2]) = (600_000, 300_000, 250_000);

        uint256 b0 = bob.balance;
        uint256 a0 = alice.balance;
        uint256 c0 = carol.balance;
        _round(ids, g);

        assertEq(bob.balance - b0, 0.6 ether);
        assertEq(alice.balance - a0, 0.3 ether);
        assertEq(carol.balance - c0, 0.1 ether);
        assertEq(tkr.balanceOf(bob), 100_000 ether + 600 ether);
        assertEq(address(pool).balance, 0);
    }

    function test_nothingBelowCut() public {
        _mint(alice, 10);
        _mint(bob, 20);
        _live();
        _fund(1 ether, 0);

        uint16[] memory ids = new uint16[](2);
        uint32[] memory g = new uint32[](2);
        (ids[0], ids[1]) = (10, 20);
        (g[0], g[1]) = (1_000_000, 50_000);

        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.PastCap.selector, 1));
        pool.settle(TUE, ids, g);
    }

    function test_proRataUnderFull() public {
        _mint(alice, 10);
        _mint(bob, 20);
        _live();
        _fund(1 ether, 0);

        // 3% and 1% -> 75 / 25
        uint16[] memory ids = new uint16[](2);
        uint32[] memory g = new uint32[](2);
        (ids[0], ids[1]) = (10, 20);
        (g[0], g[1]) = (30_000, 10_000);

        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        _round(ids, g);
        assertEq(alice.balance - a0, 0.75 ether);
        assertEq(bob.balance - b0, 0.25 ether);
    }

    function test_redDayRollsOver() public {
        _live();
        _fund(1 ether, 500 ether);
        _round(new uint16[](0), new uint32[](0));
        (uint256 e, uint256 t) = pool.pot();
        assertEq(e, 1 ether);
        assertEq(t, 500 ether);
        assertEq(pool.lastDay(), TUE);
    }

    function test_needsOneTickr() public {
        _mint(alice, 10);
        _mint(bob, 20);
        vm.startPrank(bob);
        tkr.transfer(carol, tkr.balanceOf(bob) - 0.5 ether);
        vm.stopPrank();
        _live();
        _fund(1 ether, 0);

        uint16[] memory ids = new uint16[](2);
        uint32[] memory g = new uint32[](2);
        (ids[0], ids[1]) = (20, 10);
        (g[0], g[1]) = (400_000, 100_000);

        uint256 b0 = bob.balance;
        uint256 a0 = alice.balance;
        _round(ids, g);
        assertEq(bob.balance, b0);
        assertEq(alice.balance - a0, 0.2 ether);
        (uint256 e,) = pool.pot();
        assertEq(e, 0.8 ether);
    }

    function test_unmintedRollsOver() public {
        _mint(alice, 10);
        _live();
        _fund(1 ether, 0);

        uint16[] memory ids = new uint16[](2);
        uint32[] memory g = new uint32[](2);
        (ids[0], ids[1]) = (99, 10);
        (g[0], g[1]) = (900_000, 100_000);

        uint256 a0 = alice.balance;
        _round(ids, g);
        assertEq(alice.balance - a0, 0.1 ether);
        (uint256 e,) = pool.pot();
        assertEq(e, 0.9 ether);
    }

    function test_rejectsBadOrderAndDupes() public {
        _live();
        uint16[] memory ids = new uint16[](2);
        uint32[] memory g = new uint32[](2);

        (ids[0], ids[1]) = (1, 2);
        (g[0], g[1]) = (100, 200);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadOrder.selector, 1));
        pool.settle(TUE, ids, g);

        (ids[0], ids[1]) = (5, 5);
        (g[0], g[1]) = (200, 100);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadId.selector, 5));
        pool.settle(TUE, ids, g);
    }

    function test_dayRules() public {
        uint16[] memory none = new uint16[](0);
        uint32[] memory nog = new uint32[](0);

        vm.prank(reporter);
        vm.expectRevert(GainPool.NotLive.selector);
        pool.settle(TUE, none, nog);

        _live();

        vm.prank(alice);
        vm.expectRevert(GainPool.NotReporter.selector);
        pool.settle(TUE, none, nog);

        // Saturday
        vm.warp(uint256(TUE + 4) * 1 days + 22 hours);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE + 4));
        pool.settle(TUE + 4, none, nog);

        // Wednesday, before 21:00 UTC
        vm.warp(uint256(TUE + 1) * 1 days + 20 hours);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.TooEarly.selector, uint256(TUE + 1) * 1 days + 21 hours));
        pool.settle(TUE + 1, none, nog);

        vm.warp(uint256(TUE + 1) * 1 days + 21 hours);
        vm.prank(reporter);
        pool.settle(TUE + 1, none, nog);

        // can't go back
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE));
        pool.settle(TUE, none, nog);
    }

    function test_sessionBeforeLiveSkipped() public {
        vm.warp(uint256(TUE) * 1 days + 22 hours);
        tkr.goLive();
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE));
        pool.settle(TUE, new uint16[](0), new uint32[](0));
    }

    function test_rejectingHolderGetsCredit() public {
        Rejector r = new Rejector();
        vm.deal(address(r), 1 ether);
        vm.prank(address(r));
        nft.mint{value: 0.001 ether}(_ids(300));
        _live();
        _fund(1 ether, 0);

        uint16[] memory ids = new uint16[](1);
        uint32[] memory g = new uint32[](1);
        (ids[0], g[0]) = (300, 50_000);
        _round(ids, g);

        assertEq(pool.credit(address(r)), 1 ether);
        assertEq(pool.owed(), 1 ether);
        (uint256 e,) = pool.pot();
        assertEq(e, 0);
    }

    function test_wideRoundGas() public {
        uint256 n = 200;
        uint16[] memory ids = new uint16[](n);
        uint32[] memory g = new uint32[](n);
        for (uint256 i; i < n; ++i) {
            address h = address(uint160(0x1000 + i));
            vm.deal(h, 1 ether);
            _mint(h, 101 + i);
            (ids[i], g[i]) = (uint16(101 + i), uint32(4000 - i));
        }
        _live();
        _fund(10 ether, 1_000_000 ether);
        uint256 g0 = gasleft();
        _round(ids, g);
        emit log_named_uint("gas/200", g0 - gasleft());
        (,, uint16 paid,,,,) = pool.rounds(0);
        assertEq(paid, n);
    }

    function testFuzz_neverOverpays(uint32 a, uint32 b, uint32 c, uint96 eth) public {
        a = uint32(bound(a, 3, 3_000_000));
        b = uint32(bound(b, 2, a - 1));
        c = uint32(bound(c, 1, b - 1));
        eth = uint96(bound(eth, 0, 1000 ether));
        _mint(alice, 10);
        _mint(bob, 20);
        _mint(carol, 30);
        _live();
        _fund(eth, 0);

        uint256 used;
        uint256 n;
        uint32[3] memory all = [a, b, c];
        for (; n < 3 && used < 1_000_000; ++n) {
            used += all[n];
        }
        uint16[] memory ids = new uint16[](n);
        uint32[] memory g = new uint32[](n);
        uint16[3] memory slot = [uint16(10), 20, 30];
        for (uint256 i; i < n; ++i) {
            (ids[i], g[i]) = (slot[i], all[i]);
        }
        _round(ids, g);
        (uint256 left,) = pool.pot();
        assertLe(left, 3);
        assertEq(address(pool).balance, left);
    }
}
