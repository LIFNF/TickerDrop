// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Immutable data, prefixed with STOP so its bytes cannot execute.
contract CompanyData {
    constructor(bytes memory data) {
        bytes memory runtime = abi.encodePacked(hex"00", data);
        assembly ("memory-safe") {
            return(add(runtime, 32), mload(runtime))
        }
    }
}
