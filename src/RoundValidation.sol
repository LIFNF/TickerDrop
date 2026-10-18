// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Publication and settlement must accept exactly the same payout vectors.
library RoundValidation {
    error BadInput();
    error BadId(uint256 id);
    error BadOrder(uint256 index);
    error PastCap(uint256 index);

    function validate(uint16[] calldata ids, uint32[] calldata gains, uint256 supply)
        internal
        pure
        returns (uint32 total)
    {
        uint256 n = ids.length;
        if (gains.length != n || n > supply) revert BadInput();
        uint256[] memory seen = new uint256[]((supply >> 8) + 1);
        for (uint256 i; i < n; ++i) {
            uint256 id = ids[i];
            uint256 gain = gains[i];
            if (id == 0 || id > supply) revert BadId(id);
            if (gain == 0) revert BadInput();
            if (i != 0 && (gain > gains[i - 1] || (gain == gains[i - 1] && id <= ids[i - 1]))) {
                revert BadOrder(i);
            }
            uint256 bit = 1 << (id & 0xff);
            if (seen[id >> 8] & bit != 0) revert BadId(id);
            seen[id >> 8] |= bit;
            if (total >= 1_000_000) revert PastCap(i);
            uint256 remaining = 1_000_000 - total;
            total += uint32(gain > remaining ? remaining : gain);
        }
    }
}
