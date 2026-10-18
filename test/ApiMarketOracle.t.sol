// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {ApiMarketOracle} from "../src/ApiMarketOracle.sol";
import {RoundValidation} from "../src/RoundValidation.sol";

contract ApiMarketOracleTest is Test {
    uint32 constant DAY = 20375;
    ApiMarketOracle cache;

    function tickr() external view returns (address) {
        return address(this);
    }

    function drop() external view returns (address) {
        return address(this);
    }

    function supply() external pure returns (uint256) {
        return 3172;
    }

    function liveAt() external pure returns (uint64) {
        return 1;
    }

    function nyTime(uint256 day, uint256 clock) external pure returns (uint256) {
        return day * 1 days + clock + 4 hours;
    }

    function _open(uint32 day) internal pure returns (uint64) {
        return uint64(uint256(day) * 1 days + 13 hours + 30 minutes);
    }

    function _close(uint32 day) internal pure returns (uint64) {
        return uint64(uint256(day) * 1 days + 20 hours);
    }

    function setUp() public {
        vm.warp(uint256(DAY + 3) * 1 days);
        cache = new ApiMarketOracle(address(this), address(this));
    }

    function _one() internal pure returns (uint16[] memory ids, uint32[] memory gains) {
        ids = new uint16[](1);
        gains = new uint32[](1);
        ids[0] = 1;
        gains[0] = 10000;
    }

    function publish() internal {
        (uint16[] memory ids, uint32[] memory gains) = _one();
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("API response"));
    }

    function test_publishedCommitmentBindsChainPoolDayAndResults() public {
        publish();
        (bytes32 digest, uint64 opened, uint64 closed, uint64 next) = cache.session(DAY);
        (uint16[] memory ids, uint32[] memory gains) = _one();
        assertEq(digest, keccak256(abi.encode(block.chainid, address(this), DAY, ids, gains)));
        assertEq(opened, _open(DAY));
        assertEq(closed, _close(DAY));
        assertEq(next, _open(DAY + 1));
    }

    function test_cannotRewritePublishedQuotes() public {
        publish();
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        publish();
    }

    function test_onlyAutomatedPublisherCanPublish() public {
        vm.prank(address(123));
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        publish();
    }

    function test_cannotPublishBeforeNextOpen() public {
        vm.warp(_open(DAY + 1) - 1);
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        publish();
    }

    function test_missingSessionIsUnavailable() public view {
        (bytes32 digest, uint64 opened,,) = cache.session(DAY);
        assertEq(digest, 0);
        assertEq(opened, 0);
    }

    function test_publicationFormsAnUnskippableQueue() public {
        publish();
        cache.publish(
            DAY + 1,
            new uint16[](0),
            new uint32[](0),
            _open(DAY + 1),
            _close(DAY + 1),
            _open(DAY + 2),
            keccak256("next")
        );
        assertEq(cache.nextSession(0), DAY);
        assertEq(cache.nextSession(DAY), DAY + 1);
        assertEq(cache.nextSession(DAY + 1), 0);
    }

    function test_cannotSkipTheRecordedNextOpening() public {
        publish();
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        cache.publish(
            DAY + 2,
            new uint16[](0),
            new uint32[](0),
            _open(DAY + 2),
            _close(DAY + 2),
            _open(DAY + 3),
            keccak256("skipped")
        );
    }

    function test_duplicatePublicationCannotPoisonQueue() public {
        uint16[] memory ids = new uint16[](2);
        uint32[] memory gains = new uint32[](2);
        ids[0] = 1;
        ids[1] = 1;
        gains[0] = 10000;
        gains[1] = 9000;
        vm.expectRevert(abi.encodeWithSelector(RoundValidation.BadId.selector, 1));
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("duplicate"));
        assertEq(cache.firstDay(), 0);
        assertEq(cache.lastPublishedDay(), 0);
        assertEq(cache.nextSession(0), 0);
        publish();
        assertEq(cache.firstDay(), DAY);
    }

    function test_unsortedZeroAndPastCapResultsNeverCommit() public {
        uint16[] memory ids = new uint16[](2);
        uint32[] memory gains = new uint32[](2);
        ids[0] = 1;
        ids[1] = 2;
        gains[0] = 1;
        gains[1] = 2;
        vm.expectRevert(abi.encodeWithSelector(RoundValidation.BadOrder.selector, 1));
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("order"));
        gains[0] = 1000000;
        gains[1] = 1;
        vm.expectRevert(abi.encodeWithSelector(RoundValidation.PastCap.selector, 1));
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("cap"));
        gains[0] = 0;
        gains[1] = 0;
        vm.expectRevert(RoundValidation.BadInput.selector);
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("zero"));
        assertEq(cache.firstDay(), 0);
    }

    function test_badCalendarNeverLocksFirstDay() public {
        (uint16[] memory ids, uint32[] memory gains) = _one();
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        cache.publish(DAY, ids, gains, _open(DAY) + 1, _close(DAY), _open(DAY + 1), keccak256("bad open"));
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY) + 1, _open(DAY + 1), keccak256("late close"));
        vm.expectRevert(ApiMarketOracle.InvalidPublication.selector);
        cache.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1) + 1, keccak256("bad next"));
        assertEq(cache.firstDay(), 0);
        publish();
    }
}
