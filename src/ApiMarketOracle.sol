// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {IMarketOracle} from "./IMarketOracle.sol";
import {RoundValidation} from "./RoundValidation.sol";

interface IApiPool {
    function tickr() external view returns (address);
    function drop() external view returns (address);
    function nyTime(uint256 day, uint256 clock) external view returns (uint256);
}

interface IApiDrop {
    function supply() external view returns (uint256);
}

interface IApiToken {
    function liveAt() external view returns (uint64);
}

/// @notice API-backed settlement cache. Trusts the immutable publishing server;
/// does not claim that HTTP market data is cryptographically authenticated.
contract ApiMarketOracle is IMarketOracle {
    address public immutable publisher;
    address public immutable pool;

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
    event Published(uint32 indexed day, bytes32 commitment, bytes32 sourceHash);
    error InvalidPublication();

    constructor(address publisher_, address pool_) {
        require(publisher_ != address(0) && pool_.code.length > 0, "Invalid publisher/pool");
        publisher = publisher_;
        pool = pool_;
    }

    function publish(
        uint32 day,
        uint16[] calldata ids,
        uint32[] calldata gains,
        uint64 openedAt,
        uint64 closedAt,
        uint64 nextOpen,
        bytes32 sourceHash
    ) external {
        uint64 launch = IApiToken(IApiPool(pool).tickr()).liveAt();
        if (
            msg.sender != publisher || day == 0 || day <= lastPublishedDay || _sessions[day].commitment != 0
                || ids.length != gains.length || openedAt >= closedAt || closedAt >= nextOpen
                || block.timestamp < nextOpen || sourceHash == 0 || launch == 0 || openedAt < launch
        ) revert InvalidPublication();
        IApiPool target = IApiPool(pool);
        uint256 nextDay = uint256(nextOpen) / 1 days;
        uint256 weekday = (uint256(day) + 4) % 7;
        uint256 nextWeekday = (nextDay + 4) % 7;
        if (
            weekday == 0 || weekday == 6 || nextWeekday == 0 || nextWeekday == 6
                || openedAt != target.nyTime(day, 9 hours + 30 minutes) || closedAt > target.nyTime(day, 16 hours)
                || nextOpen != target.nyTime(nextDay, 9 hours + 30 minutes)
        ) revert InvalidPublication();
        RoundValidation.validate(ids, gains, IApiDrop(target.drop()).supply());
        if (lastPublishedDay == 0) {
            firstDay = day;
        } else {
            if (openedAt != _sessions[lastPublishedDay].nextOpen) revert InvalidPublication();
            _following[lastPublishedDay] = day;
        }
        lastPublishedDay = day;
        bytes32 commitment = keccak256(abi.encode(block.chainid, pool, day, ids, gains));
        _sessions[day] = Session(commitment, openedAt, closedAt, nextOpen);
        emit Published(day, commitment, sourceHash);
    }

    function session(uint32 day) external view returns (bytes32, uint64, uint64, uint64) {
        Session memory s = _sessions[day];
        return (s.commitment, s.openedAt, s.closedAt, s.nextOpen);
    }

    function nextSession(uint32 previousDay) external view returns (uint32) {
        return previousDay == 0 ? firstDay : _following[previousDay];
    }
}
