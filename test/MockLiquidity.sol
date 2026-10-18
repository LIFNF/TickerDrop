// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Router} from "../src/LiquidityVault.sol";

contract MockWETH {}

contract MockFactory {
    address public pair;
    constructor(address pair_) { pair = pair_; }
    function getPair(address, address) external view returns (address) { return pair; }
}

contract MockLiquidityRouter is IUniswapV2Router {
    address public immutable override WETH;
    address public immutable override factory;
    bool public reject;
    uint256 public tokenAdded;
    uint256 public ethAdded;
    mapping(address => uint256) public lpBalance;

    constructor() {
        WETH = address(new MockWETH());
        factory = address(new MockFactory(address(this)));
    }

    function setReject(bool on) external { reject = on; }

    function addLiquidityETH(
        address token, uint256 desired, uint256, uint256, address to, uint256
    ) external payable override returns (uint256, uint256, uint256) {
        if (reject) revert("Rejected");
        require(IERC20(token).transferFrom(msg.sender, address(this), desired), "Transfer failed");
        tokenAdded += desired;
        ethAdded += msg.value;
        lpBalance[to] += 1;
        return (desired, msg.value, 1);
    }
}
