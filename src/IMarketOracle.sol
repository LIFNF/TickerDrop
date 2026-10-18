// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Session data published by the project's automated third-party API collector.
/// This interface does not promise cryptographic proof of an HTTP data source.
/// The publisher's trust assumptions are documented in ApiMarketOracle.
interface IMarketOracle {
    function nextSession(uint32 previousDay) external view returns (uint32);
    function session(uint32 day)
        external
        view
        returns (bytes32 commitment, uint64 openedAt, uint64 closedAt, uint64 nextOpen);
}
