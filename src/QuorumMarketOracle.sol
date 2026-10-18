// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IMarketOracle} from "./IMarketOracle.sol";
import {RoundValidation} from "./RoundValidation.sol";

interface IQuorumPool {
    function tickr() external view returns (address);
    function drop() external view returns (address);
    function nyTime(uint256 day, uint256 clock) external view returns (uint256);
}

interface IQuorumDrop {
    function supply() external view returns (uint256);
}

interface IQuorumToken {
    function liveAt() external view returns (uint64);
}

/// @notice Permissionless relay of results attested by a fixed quorum of independent price reviewers.
/// @dev Signatures prove agreement by the configured signers, not the truth of an external HTTP quote.
contract QuorumMarketOracle is IMarketOracle, EIP712 {
    bytes32 private constant REPORT_TYPEHASH = keccak256(
        "MarketReport(uint32 day,bytes32 resultsHash,uint64 openedAt,uint64 closedAt,uint64 nextOpen,bytes32 quotesHash)"
    );

    address public immutable pool;
    uint8 public immutable threshold;
    mapping(address => bool) public isSigner;
    address[] public signers;

    struct Session {
        bytes32 commitment;
        uint64 openedAt;
        uint64 closedAt;
        uint64 nextOpen;
    }
    mapping(uint32 => Session) private _sessions;
    mapping(uint32 => uint32) private _following;
    uint32 public firstDay;
    uint32 public lastPublishedDay;

    event Published(uint32 indexed day, bytes32 commitment, bytes32 quotesHash);
    error InvalidPublication();
    error InvalidQuorum();

    constructor(address pool_, address[] memory signers_, uint8 threshold_) EIP712("TickerDrop Market", "1") {
        if (pool_.code.length == 0 || signers_.length < 2 || signers_.length > 9 || threshold_ < 2
            || threshold_ > signers_.length) revert InvalidQuorum();
        pool = pool_;
        threshold = threshold_;
        for (uint256 i; i < signers_.length; ++i) {
            address signer = signers_[i];
            if (signer == address(0) || isSigner[signer]) revert InvalidQuorum();
            isSigner[signer] = true;
            signers.push(signer);
        }
    }

    function reportDigest(
        uint32 day,
        uint16[] calldata ids,
        uint32[] calldata gains,
        uint64 openedAt,
        uint64 closedAt,
        uint64 nextOpen,
        bytes32 quotesHash
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            REPORT_TYPEHASH, day, keccak256(abi.encode(ids, gains)), openedAt, closedAt, nextOpen, quotesHash
        ));
        return _hashTypedDataV4(structHash);
    }

    function publish(
        uint32 day,
        uint16[] calldata ids,
        uint32[] calldata gains,
        uint64 openedAt,
        uint64 closedAt,
        uint64 nextOpen,
        bytes32 quotesHash,
        bytes[] calldata signatures
    ) external {
        if (day == 0 || day <= lastPublishedDay || _sessions[day].commitment != 0
            || ids.length != gains.length || openedAt >= closedAt || closedAt >= nextOpen
            || block.timestamp < nextOpen || quotesHash == 0 || signatures.length < threshold
            || IQuorumToken(IQuorumPool(pool).tickr()).liveAt() == 0
            || openedAt < IQuorumToken(IQuorumPool(pool).tickr()).liveAt()) revert InvalidPublication();

        IQuorumPool target = IQuorumPool(pool);
        uint256 nextDay = uint256(nextOpen) / 1 days;
        uint256 weekday = (uint256(day) + 4) % 7;
        uint256 nextWeekday = (nextDay + 4) % 7;
        if (weekday == 0 || weekday == 6 || nextWeekday == 0 || nextWeekday == 6
            || openedAt != target.nyTime(day, 9 hours + 30 minutes)
            || closedAt > target.nyTime(day, 16 hours)
            || nextOpen != target.nyTime(nextDay, 9 hours + 30 minutes)) revert InvalidPublication();
        RoundValidation.validate(ids, gains, IQuorumDrop(target.drop()).supply());

        bytes32 digest = reportDigest(day, ids, gains, openedAt, closedAt, nextOpen, quotesHash);
        address previous;
        for (uint256 i; i < signatures.length; ++i) {
            address recovered = ECDSA.recover(digest, signatures[i]);
            if (!isSigner[recovered] || recovered <= previous) revert InvalidQuorum();
            previous = recovered;
        }

        if (lastPublishedDay == 0) firstDay = day;
        else {
            if (openedAt != _sessions[lastPublishedDay].nextOpen) revert InvalidPublication();
            _following[lastPublishedDay] = day;
        }
        lastPublishedDay = day;
        bytes32 commitment = keccak256(abi.encode(block.chainid, pool, day, ids, gains));
        _sessions[day] = Session(commitment, openedAt, closedAt, nextOpen);
        emit Published(day, commitment, quotesHash);
    }

    function session(uint32 day) external view returns (bytes32, uint64, uint64, uint64) {
        Session memory s = _sessions[day];
        return (s.commitment, s.openedAt, s.closedAt, s.nextOpen);
    }

    function nextSession(uint32 previousDay) external view returns (uint32) {
        return previousDay == 0 ? firstDay : _following[previousDay];
    }
}
