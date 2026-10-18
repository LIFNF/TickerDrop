// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {QuorumMarketOracle} from "../src/QuorumMarketOracle.sol";

contract QuorumMarketOracleTest is Test {
    uint32 constant DAY = 20375;
    uint256 constant KEY_A = 101;
    uint256 constant KEY_B = 202;
    uint256 constant KEY_C = 303;
    QuorumMarketOracle oracle;

    function tickr() external view returns (address) { return address(this); }
    function drop() external view returns (address) { return address(this); }
    function supply() external pure returns (uint256) { return 3172; }
    function liveAt() external pure returns (uint64) { return 1; }
    function nyTime(uint256 day, uint256 clock) external pure returns (uint256) {
        return day * 1 days + clock + 4 hours;
    }
    function _open(uint32 day) private pure returns (uint64) {
        return uint64(uint256(day) * 1 days + 13 hours + 30 minutes);
    }
    function _close(uint32 day) private pure returns (uint64) {
        return uint64(uint256(day) * 1 days + 20 hours);
    }

    function setUp() public {
        address[] memory signers = new address[](3);
        signers[0] = vm.addr(KEY_A);
        signers[1] = vm.addr(KEY_B);
        signers[2] = vm.addr(KEY_C);
        oracle = new QuorumMarketOracle(address(this), signers, 2);
        vm.warp(uint256(DAY + 3) * 1 days);
    }

    function _report() private pure returns (uint16[] memory ids, uint32[] memory gains) {
        ids = new uint16[](1);
        gains = new uint32[](1);
        ids[0] = 1;
        gains[0] = 10000;
    }

    function _sign(uint256 key, bytes32 digest) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _two(bytes32 digest) private returns (bytes[] memory signatures) {
        signatures = new bytes[](2);
        if (vm.addr(KEY_A) < vm.addr(KEY_B)) {
            signatures[0] = _sign(KEY_A, digest);
            signatures[1] = _sign(KEY_B, digest);
        } else {
            signatures[0] = _sign(KEY_B, digest);
            signatures[1] = _sign(KEY_A, digest);
        }
    }

    function _digest(uint16[] memory ids, uint32[] memory gains) private view returns (bytes32) {
        return oracle.reportDigest(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("quotes"));
    }

    function _publish(uint16[] memory ids, uint32[] memory gains, bytes[] memory signatures) private {
        oracle.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("quotes"), signatures);
    }

    function test_permissionlessRelayWithTwoIndependentSignatures() public {
        (uint16[] memory ids, uint32[] memory gains) = _report();
        bytes[] memory signatures = _two(_digest(ids, gains));
        vm.prank(address(999));
        oracle.publish(DAY, ids, gains, _open(DAY), _close(DAY), _open(DAY + 1), keccak256("quotes"), signatures);
        (bytes32 commitment,,,) = oracle.session(DAY);
        assertEq(commitment, keccak256(abi.encode(block.chainid, address(this), DAY, ids, gains)));
    }

    function test_singleSignerCannotChooseResult() public {
        (uint16[] memory ids, uint32[] memory gains) = _report();
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _sign(KEY_A, _digest(ids, gains));
        vm.expectRevert(QuorumMarketOracle.InvalidPublication.selector);
        _publish(ids, gains, signatures);
    }

    function test_duplicateSignerCannotSatisfyThreshold() public {
        (uint16[] memory ids, uint32[] memory gains) = _report();
        bytes[] memory signatures = new bytes[](2);
        signatures[0] = _sign(KEY_A, _digest(ids, gains));
        signatures[1] = signatures[0];
        vm.expectRevert(QuorumMarketOracle.InvalidQuorum.selector);
        _publish(ids, gains, signatures);
    }

    function test_changedResultsInvalidateSignatures() public {
        (uint16[] memory ids, uint32[] memory gains) = _report();
        bytes[] memory signatures = _two(_digest(ids, gains));
        gains[0] += 1;
        vm.expectRevert();
        _publish(ids, gains, signatures);
        assertEq(oracle.lastPublishedDay(), 0);
    }

    function test_noDuplicateSignerInConstructor() public {
        address[] memory signers = new address[](2);
        signers[0] = vm.addr(KEY_A);
        signers[1] = signers[0];
        vm.expectRevert(QuorumMarketOracle.InvalidQuorum.selector);
        new QuorumMarketOracle(address(this), signers, 2);
    }
}
