// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IProbeBook {
    function buy(uint256 id) external payable;
    function list(uint256 id, uint96 price) external;
}

/// @dev Test-only receiver. Never used by the application or production deployment.
contract TestnetAdversary {
    address public immutable owner;
    IProbeBook public immutable book;
    uint256 public immutable bait;
    uint256 public immutable baitPrice;
    bool public attempted;
    bool public succeeded;
    bytes4 public failure;

    constructor(IProbeBook target, uint256 baitId, uint256 price) payable {
        owner = msg.sender;
        book = target;
        bait = baitId;
        baitPrice = price;
    }

    function acquireAndList(uint256 id, uint96 price) external {
        require(msg.sender == owner, "Test owner only");
        book.buy{value: price}(id);
        book.list(id, price);
    }

    receive() external payable {
        if (attempted) return;
        attempted = true;
        (bool ok, bytes memory result) = address(book).call{value: baitPrice}(abi.encodeCall(book.buy, (bait)));
        succeeded = ok;
        if (result.length >= 4) failure = bytes4(result);
    }

    function recover() external {
        require(msg.sender == owner, "Test owner only");
        (bool ok,) = owner.call{value: address(this).balance}("");
        require(ok);
    }
}
