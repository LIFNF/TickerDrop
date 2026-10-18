// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Tickr} from "../src/Tickr.sol";
import {TickerDrop} from "../src/TickerDrop.sol";
import {GainPool, IDrop} from "../src/GainPool.sol";

import {IMarketOracle} from "../src/IMarketOracle.sol";
import {MockLiquidityRouter} from "./MockLiquidity.sol";

// TEST ONLY: never use this oracle in deployment.
contract TestMarketOracle is IMarketOracle {
    mapping(uint32 => bytes32) public roots;
    uint32 private expectedDay;

    function nextSession(uint32) external view returns (uint32) {
        return expectedDay == 0 ? 20375 : expectedDay;
    }
    GainPool immutable p;

    constructor(GainPool pool_) {
        p = pool_;
    }

    function session(uint32 day) external view returns (bytes32, uint64, uint64, uint64) {
        uint256 wd = (uint256(day) + 4) % 7;
        if (wd == 0 || wd == 6 || day == 20454) return (bytes32(0), 0, 0, 0); // New Year's Day
        uint256 next = uint256(day) + (wd == 5 ? 3 : 1);
        if (next == 20454) next++;
        return (
            roots[day] == 0 ? bytes32(uint256(1)) : roots[day],
            uint64(p.nyTime(day, 9.5 hours)),
            uint64(p.nyTime(day, 16 hours)),
            uint64(p.nyTime(next, 9.5 hours))
        );
    }
}

contract Rejector {
    receive() external payable {
        revert();
    }
}

contract TickerDropTest is Test {
    receive() external payable {}
    TestMarketOracle oracle;
    Tickr tkr;
    GainPool pool;
    TickerDrop nft;

    bytes5 rootInvite;
    bytes5 fallbackInvite;
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
        tkr.liquidityVault().configure(address(nft), new MockLiquidityRouter());
        pool.bind(IDrop(address(nft)));
        oracle = new TestMarketOracle(pool);
        pool.bindMarketOracle(oracle);
        tkr.setPool(address(pool));
        tkr.setPair(pair, true);
        tkr.transfer(address(nft), nft.supply() * nft.DROP());
        uint256 referralFunding = nft.supply() * nft.INVITE_REWARD();
        tkr.approve(address(nft), referralFunding);
        nft.fundReferral(referralFunding);
        for (uint256 id = 1; id <= nft.supply(); ++id) {
            nft.setCompany(id, "Test Company", 1_000_000);
        }
        nft.openMint();
        // Test-only spending balance for ordinary-transfer scenarios; production deploy keeps no remainder.
        deal(address(tkr), address(this), 2_000_000 ether);

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
        // Large settlement fixtures can transfer a minted NFT after the direct-mint quota closes.
        if (nft.registeredWallet(who) || nft.seedCount() < 50) {
            vm.prank(who);
            nft.mint{value: cost}(_ids(id), bytes5(0));
        } else {
            vm.deal(address(this), address(this).balance + cost);
            nft.mint{value: cost}(_ids(id), bytes5(0));
            nft.list(id, 1);
            vm.prank(who);
            nft.buy{value: 1}(id);
            tkr.transfer(who, nft.DROP());
        }
    }

    function _round(uint16[] memory ids, uint32[] memory gains) internal {
        vm.prank(reporter);
        _verifiedSettle(TUE, ids, gains);
    }

    function _verifiedSettle(uint32 day, uint16[] memory ids, uint32[] memory gains) internal {
        // Test fixture authentication; production uses a real verified market adapter.
        vm.store(
            address(oracle),
            keccak256(abi.encode(day, uint256(0))),
            keccak256(abi.encode(block.chainid, address(pool), day, ids, gains))
        );
        vm.store(address(oracle), bytes32(uint256(1)), bytes32(uint256(day)));
        pool.settle(day, ids, gains);
        while (pool.pendingDay() != 0) pool.continueSettlement(ids, gains);
    }

    function _startTrading() internal {
        if (tkr.liquidityVault().totalLpBurned() == 0) {
            vm.deal(address(0xB007), 1 ether);
            _mint(address(0xB007), 3172);
        }
        tkr.goLive();
    }

    function test_emptyPairCannotStartTrading() public {
        vm.expectRevert(Tickr.Locked.selector);
        tkr.goLive();
    }

    function _live() internal {
        _startTrading();
        // Wednesday 09:30 New York (EDT)
        vm.warp(uint256(TUE + 1) * 1 days + 13 hours + 30 minutes);
    }

    // ------------------------------------------------------------------ mint

    function test_table() public view {
        assertEq(nft.supply(), 3172);
        assertEq(nft.symbolOf(1), "NVDA");
        assertEq(nft.symbolOf(2), "AAPL");
    }

    function test_mintPricing() public {
        uint256 before = dev.balance;
        vm.prank(alice);
        nft.mint{value: 0.006 ether}(_ids(1, 101), rootInvite);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.ownerOf(101), alice);
        assertEq(dev.balance - before, 0.0006 ether);
        assertEq(tkr.balanceOf(alice), 200_000 ether);
        assertEq(nft.minted(), 2);
    }

    function test_mintWrongValue() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.WrongValue.selector, 0.005 ether));
        nft.mint{value: 0.001 ether}(_ids(1), rootInvite);
    }

    function test_mintTwice() public {
        _mint(alice, 7);
        vm.prank(bob);
        vm.expectRevert();
        nft.mint{value: 0.001 ether}(_ids(7), rootInvite);
    }

    function test_noFreeMintAndFeesReachDeployer() public {
        assertEq(nft.mintRecipient(), payable(dev));
        vm.prank(lp);
        vm.expectRevert(abi.encodeWithSelector(TickerDrop.WrongValue.selector, 0.01 ether));
        nft.mint(_ids(1, 2), rootInvite);
        vm.deal(lp, 1 ether);
        uint256 before = dev.balance;
        vm.prank(lp);
        nft.mint{value: 0.01 ether}(_ids(1, 2), rootInvite);
        assertEq(dev.balance - before, 0.001 ether);
        assertEq(nft.ownerOf(2), lp);
        assertEq(tkr.balanceOf(lp), 200_000 ether);
    }

    function test_mintCannotBeClosedOrSweptBeforeSellout() public {
        assertEq(nft.owner(), address(0));
        vm.expectRevert(TickerDrop.BadPhase.selector);
        nft.sweep();
        vm.prank(alice);
        nft.mint{value: 0.001 ether}(_ids(500), rootInvite);
        assertEq(nft.ownerOf(500), alice);
    }

    function test_ownerCannotWithdrawUnmintedTokens() public {
        vm.expectRevert(TickerDrop.BadPhase.selector);
        nft.sweep();
        assertEq(tkr.balanceOf(address(nft)), nft.supply() * (nft.DROP() + nft.INVITE_REWARD()));
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

    function test_mintListsImmediatelyAndRecordsMarketAndPoolFunding() public {
        _mint(alice, 200);
        assertEq(tkr.liveAt(), 0); // NFT book is usable before token trading starts.
        vm.prank(alice);
        nft.list(200, 1 ether);
        (uint256[] memory ids, address[] memory sellers, uint256[] memory prices) = nft.book();
        assertEq(ids.length, 1);
        assertEq(ids[0], 200);
        assertEq(sellers[0], alice);
        assertEq(prices[0], 1 ether);

        vm.recordLogs();
        vm.prank(bob);
        nft.buy{value: 1 ether}(200);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool funded;
        bool sold;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(pool)
                && logs[i].topics[0] == keccak256("ETHFunded(address,uint256)")) funded = true;
            if (logs[i].emitter == address(nft)
                && logs[i].topics[0] == keccak256("Sold(uint256,address,address,uint256,uint256)")) sold = true;
        }
        assertTrue(funded);
        assertTrue(sold);
        (uint256 ethPot,) = pool.pot();
        assertEq(ethPot, 0.03 ether);
        assertEq(nft.ownerOf(200), bob);
        (ids,,) = nft.book();
        assertEq(ids.length, 0);
    }

    function test_ownersRelinquishedBeforeMintAndTradingStartsAutomatically() public {
        assertEq(nft.owner(), address(0));
        assertEq(pool.owner(), address(0));
        tkr.renounceOwnership();
        assertEq(tkr.owner(), address(0));
        assertEq(tkr.liveAt(), 0);
        _mint(alice, 200);
        assertGt(tkr.liveAt(), 0);
        vm.prank(alice);
        nft.list(200, 0.1 ether);
        vm.prank(bob);
        nft.buy{value: 0.1 ether}(200);
        assertEq(nft.ownerOf(200), bob);
    }

    function test_directTransferBlockedAndListingPreserved() public {
        _mint(alice, 200);
        vm.startPrank(alice);
        nft.list(200, 1 ether);
        vm.expectRevert();
        nft.transferFrom(alice, carol, 200);
        vm.stopPrank();
        vm.prank(bob);
        // A rejected direct transfer must preserve the valid listing.
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
        _startTrading();
        tkr.transfer(alice, 1000 ether);
        assertEq(tkr.balanceOf(alice), 970 ether);
        vm.prank(alice);
        tkr.transfer(pair, 970 ether);
        assertEq(tkr.balanceOf(pair), 940.9 ether);
        assertEq(tkr.balanceOf(address(pool)), 59.1 ether);

        vm.prank(pair);
        tkr.transfer(bob, 100 ether);
        assertEq(tkr.balanceOf(bob), 97 ether);

        vm.prank(bob);
        tkr.transfer(carol, 50 ether);
        assertEq(tkr.balanceOf(carol), 48.5 ether);
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
        _verifiedSettle(TUE, ids, g);
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
        _verifiedSettle(TUE, ids, g);

        (ids[0], ids[1]) = (5, 5);
        (g[0], g[1]) = (200, 100);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadId.selector, 5));
        _verifiedSettle(TUE, ids, g);
    }

    function test_dayRules() public {
        uint16[] memory none = new uint16[](0);
        uint32[] memory nog = new uint32[](0);

        vm.prank(reporter);
        vm.expectRevert(GainPool.NotLive.selector);
        _verifiedSettle(TUE, none, nog);

        _live();

        // Tuesday's close is not final until Wednesday's open
        vm.warp(uint256(TUE + 1) * 1 days + 13 hours + 29 minutes);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.TooEarly.selector, uint256(TUE + 1) * 1 days + 13.5 hours));
        _verifiedSettle(TUE, none, nog);

        // Saturday
        vm.warp(uint256(TUE + 6) * 1 days);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE + 4));
        _verifiedSettle(TUE + 4, none, nog);

        // Wednesday's session, settled Thursday at the open
        vm.warp(uint256(TUE + 2) * 1 days + 13.5 hours);
        vm.prank(reporter);
        _verifiedSettle(TUE + 1, none, nog);

        // can't go back
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE));
        _verifiedSettle(TUE, none, nog);
    }

    function test_sessionBeforeLiveSkipped() public {
        vm.warp(uint256(TUE) * 1 days + 20 hours); // 16:00 EDT
        _startTrading();
        vm.warp(uint256(TUE + 1) * 1 days + 14 hours);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE));
        _verifiedSettle(TUE, new uint16[](0), new uint32[](0));
    }

    function test_openClock() public {
        _startTrading();
        // Fri 2025-10-17 (EDT) -> Mon 13:30 UTC
        assertEq(pool.settleableAt(20378), 20381 * 1 days + 13.5 hours);
        // Fri 2025-10-31 -> Mon 2025-11-03, DST ended Sunday -> 14:30 UTC
        assertEq(pool.settleableAt(20392), 20395 * 1 days + 14.5 hours);
        // Thu 2026-03-05 (EST) -> Fri 14:30 UTC
        assertEq(pool.settleableAt(20517), 20518 * 1 days + 14.5 hours);
        // Fri 2026-03-06 -> Mon 2026-03-09, DST began Sunday -> 13:30 UTC
        assertEq(pool.settleableAt(20518), 20521 * 1 days + 13.5 hours);
        // Wed 2025-12-31 -> Thu 2026-01-01, across the year
        assertEq(pool.settleableAt(20453), 20455 * 1 days + 14.5 hours);
        // close times
        assertEq(pool.nyTime(TUE, 16 hours), uint256(TUE) * 1 days + 20 hours);
        assertEq(pool.nyTime(20517, 16 hours), 20517 * 1 days + 21 hours);
    }

    function test_weekendFeesRollIntoMonday() public {
        uint32 fri = 20378;
        _mint(alice, 10);
        _startTrading();
        vm.deal(address(pool), 1 ether);
        // weekend fees land before Monday's open
        vm.warp(uint256(fri + 2) * 1 days);
        vm.deal(address(pool), 1.5 ether);

        uint16[] memory ids = new uint16[](1);
        uint32[] memory g = new uint32[](1);
        (ids[0], g[0]) = (10, 50_000);

        vm.warp(uint256(fri + 3) * 1 days + 13.5 hours - 1);
        vm.prank(reporter);
        vm.expectRevert(abi.encodeWithSelector(GainPool.TooEarly.selector, uint256(fri + 3) * 1 days + 13.5 hours));
        _verifiedSettle(fri, ids, g);

        vm.warp(uint256(fri + 3) * 1 days + 13.5 hours);
        uint256 a0 = alice.balance;
        vm.prank(reporter);
        _verifiedSettle(fri, ids, g);
        assertEq(alice.balance - a0, 1.5 ether);
    }

    function test_rejectingHolderGetsCredit() public {
        Rejector r = new Rejector();
        vm.deal(address(r), 1 ether);
        vm.prank(address(r));
        nft.mint{value: 0.001 ether}(_ids(300), rootInvite);
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
        _mint(address(this), 301); // a seed wallet supplies post-quota book transfers
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

    function test_snapshotKeepsOpeningHolderAfterLaterSale() public {
        _mint(alice, 10);
        _live();
        vm.warp(block.timestamp + 60);
        vm.prank(alice);
        nft.list(10, 1 ether);
        vm.prank(bob);
        nft.buy{value: 1 ether}(10);
        _fund(1 ether, 0);
        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        uint16[] memory ids = new uint16[](1);
        uint32[] memory g = new uint32[](1);
        (ids[0], g[0]) = (10, 10_000);
        _round(ids, g);
        assertEq(alice.balance - a0, 1 ether);
        assertEq(bob.balance, b0);
        assertEq(nft.ownerOf(10), bob);
    }

    function test_openingTimestampTransferCannotRewriteSnapshot() public {
        _mint(alice, 10);
        _live();
        uint256 aliceTokens = tkr.balanceOf(alice);
        vm.prank(alice);
        tkr.transfer(carol, aliceTokens);
        _fund(1 ether, 0);
        uint256 a0 = alice.balance;
        uint16[] memory ids = new uint16[](1);
        uint32[] memory g = new uint32[](1);
        (ids[0], g[0]) = (10, 10_000);
        _round(ids, g);
        assertEq(alice.balance - a0, 1 ether);
    }

    function test_fundingAfterOpenDoesNotCreateEligibility() public {
        _mint(alice, 10);
        uint256 aliceTokens = tkr.balanceOf(alice);
        vm.prank(alice);
        tkr.transfer(carol, aliceTokens);
        _live();
        tkr.transfer(alice, 100 ether);
        _fund(1 ether, 0);
        uint256 a0 = alice.balance;
        uint16[] memory ids = new uint16[](1);
        uint32[] memory g = new uint32[](1);
        (ids[0], g[0]) = (10, 10_000);
        _round(ids, g);
        assertEq(alice.balance, a0);
        assertEq(address(pool).balance, 1 ether);
    }

    function test_middayLaunchSkipsPartialSession() public {
        vm.warp(pool.nyTime(TUE, 12 hours));
        _startTrading();
        assertEq(pool.settleableAt(TUE), 0);
        assertGt(pool.settleableAt(TUE + 1), 0);
    }

    function test_holidayHasNoSession() public {
        _startTrading();
        assertEq(pool.settleableAt(20454), 0);
        assertEq(pool.settleableAt(20453), pool.nyTime(20455, 9.5 hours));
    }

    function test_unverifiedAndOmittedDataCannotSettle() public {
        _live();
        uint16[] memory ids = new uint16[](1);
        uint32[] memory g = new uint32[](1);
        (ids[0], g[0]) = (10, 10_000);
        vm.expectRevert(GainPool.UnverifiedMarketData.selector);
        pool.settle(TUE, ids, g);
        bytes32 root = keccak256(abi.encode(block.chainid, address(pool), TUE, ids, g));
        vm.store(address(oracle), keccak256(abi.encode(TUE, uint256(0))), root);
        vm.expectRevert(GainPool.UnverifiedMarketData.selector);
        pool.settle(TUE, new uint16[](0), new uint32[](0));
        g[0]++;
        vm.expectRevert(GainPool.UnverifiedMarketData.selector);
        pool.settle(TUE, ids, g);
    }

    function test_oracleCannotBeReplaced() public {
        vm.expectRevert();
        pool.bindMarketOracle(oracle);
    }

    function test_taxConfigurationFrozenAfterLaunch() public {
        _live();
        assertEq(tkr.owner(), address(0));
        assertEq(pool.owner(), address(0));
        assertEq(nft.owner(), address(0));
        vm.expectRevert();
        tkr.setPair(pair, false);
        vm.expectRevert();
        tkr.setExempt(alice, true);
    }

    function test_companyMetadataFrozenAtMintOpen() public {
        vm.expectRevert();
        nft.setCompany(1, "Changed name", 999);
        (string memory name, uint128 cap) = nft.companies(1);
        assertEq(name, "Test Company");
        assertEq(cap, 1_000_000);
    }

    function test_cannotAuthorizeBypassOperator() public {
        vm.expectRevert();
        nft.setOperator(bob, true);
    }

    struct MetadataInput {
        uint256 cap;
        uint256 id;
        string n;
        string s;
    }

    function test_deploymentDatasetDecodedWithoutFieldMixups() public view {
        MetadataInput[] memory rows = abi.decode(vm.parseJson(vm.readFile("data/tickers.json")), (MetadataInput[]));
        assertEq(rows.length, nft.supply());
        assertEq(rows[0].id, 1);
        assertEq(rows[0].s, "NVDA");
        assertGt(bytes(rows[0].n).length, 0);
        assertGt(rows[0].cap, 1e12);
        assertEq(rows[rows.length - 1].id, rows.length);
    }

    function test_cannotSettlePastAnEarlierQueuedDay() public {
        _live();
        uint16[] memory ids = new uint16[](0);
        uint32[] memory gains = new uint32[](0);
        vm.store(
            address(oracle),
            keccak256(abi.encode(TUE, uint256(0))),
            keccak256(abi.encode(block.chainid, address(pool), TUE, ids, gains))
        );
        vm.store(address(oracle), bytes32(uint256(1)), bytes32(uint256(TUE - 1)));
        vm.expectRevert(abi.encodeWithSelector(GainPool.BadDay.selector, TUE));
        pool.settle(TUE, ids, gains);
    }

    function test_launchClearsTemporaryTaxExemptions() public {
        tkr.setExempt(alice, true);
        tkr.transfer(alice, 1000 ether);
        _live();
        assertFalse(tkr.exempt(alice));
        assertFalse(tkr.exempt(address(this)));
        assertTrue(tkr.exempt(address(pool)));
        vm.prank(alice);
        tkr.transfer(pair, 1000 ether);
        assertEq(tkr.balanceOf(pair), 970 ether);
    }

    function test_openMintNeedsFundingButNotCompanyMetadata() public {
        TickerDrop fresh = new TickerDrop(IERC20(address(tkr)), payable(address(pool)), hex"41414100004242420000");
        vm.expectRevert(TickerDrop.BadPhase.selector);
        fresh.openMint();
        assertEq(fresh.metadataCount(), 0);
        vm.expectRevert(TickerDrop.BadPhase.selector);
        fresh.openMint();
        deal(address(tkr), address(fresh), 2 * (fresh.DROP() + fresh.INVITE_REWARD()));
        tkr.approve(address(fresh), 2 * fresh.INVITE_REWARD());
        fresh.fundReferral(2 * fresh.INVITE_REWARD());
        fresh.openMint();
        assertEq(fresh.metadataCount(), 0);
        vm.expectRevert();
        fresh.setCompany(1, "Changed", 100);
    }

    function test_noCompanyDataStillMintsWithOnChainTickerMetadata() public {
        Tickr token = new Tickr();
        TickerDrop fresh = new TickerDrop(IERC20(address(token)), payable(address(pool)), hex"4141410000");
        token.liquidityVault().configure(address(fresh), new MockLiquidityRouter());
        token.transfer(address(fresh), fresh.DROP());
        token.approve(address(fresh), fresh.INVITE_REWARD());
        fresh.fundReferral(fresh.INVITE_REWARD());
        fresh.openMint();
        vm.prank(alice);
        fresh.mint{value: fresh.TOP_PRICE()}(_ids(1), bytes5(0));
        assertEq(fresh.symbolOf(1), "AAA");
        assertGt(bytes(fresh.tokenURI(1)).length, 100);
    }

    function test_largeRoundResumesWithoutChangingBudgetOrRecipients() public {
        uint16[] memory ids = new uint16[](140);
        uint32[] memory gains = new uint32[](140);
        for (uint256 i; i < 140; ++i) {
            _mint(alice, 101 + i);
            ids[i] = uint16(101 + i);
            gains[i] = 1000;
        }
        _live();
        _fund(140 ether, 0);
        vm.store(
            address(oracle),
            keccak256(abi.encode(TUE, uint256(0))),
            keccak256(abi.encode(block.chainid, address(pool), TUE, ids, gains))
        );
        uint256 before = alice.balance;
        pool.settle(TUE, ids, gains);
        assertEq(pool.pendingCursor(), 64);
        assertEq(pool.pendingDay(), TUE);
        assertEq(pool.lastDay(), 0);
        assertEq(alice.balance - before, 64 ether);
        vm.expectRevert(GainPool.Locked.selector);
        pool.settle(TUE, ids, gains);
        gains[0]++;
        vm.expectRevert(GainPool.BadInput.selector);
        pool.continueSettlement(ids, gains);
        gains[0]--;
        // New deposits between batches belong to a subsequent round.
        vm.deal(address(pool), address(pool).balance + 100 ether);
        vm.warp(block.timestamp + 1);
        uint256 tokens = tkr.balanceOf(alice);
        vm.prank(alice);
        tkr.transfer(bob, tokens);
        pool.continueSettlement(ids, gains);
        assertEq(pool.pendingCursor(), 128);
        pool.continueSettlement(ids, gains);
        assertEq(pool.pendingDay(), 0);
        assertEq(pool.lastDay(), TUE);
        assertEq(alice.balance - before, 140 ether);
        assertEq(address(pool).balance, 100 ether);
        (,, uint16 paid,,,,) = pool.rounds(0);
        assertEq(paid, 140);
    }

    function test_fullCollectionRoundCompletesInBoundedBatches() public {
        _mint(alice, 1);
        _live();
        _fund(3172 ether, 0);
        uint16[] memory ids = new uint16[](3172);
        uint32[] memory gains = new uint32[](3172);
        for (uint256 i; i < ids.length; ++i) {
            ids[i] = uint16(i + 1);
            gains[i] = 1;
        }
        vm.store(
            address(oracle),
            keccak256(abi.encode(TUE, uint256(0))),
            keccak256(abi.encode(block.chainid, address(pool), TUE, ids, gains))
        );
        uint256 a0 = alice.balance;
        pool.settle(TUE, ids, gains);
        uint256 batches = 1;
        while (pool.pendingDay() != 0) {
            uint256 cursor = pool.pendingCursor();
            pool.continueSettlement(ids, gains);
            if (pool.pendingDay() != 0) assertEq(pool.pendingCursor() - cursor, 64);
            batches++;
        }
        assertEq(batches, 50);
        assertEq(alice.balance - a0, 1 ether);
        assertEq(address(pool).balance, 3171 ether);
        (, uint16 gainers, uint16 paid,,,,) = pool.rounds(0);
        assertEq(gainers, 3172);
        assertEq(paid, 1);
    }
}
