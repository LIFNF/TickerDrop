// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV2Router} from "../src/LiquidityVault.sol";

contract MockWETH {}

contract MockFactory {
    address public pair;
    function getPair(address, address) external view returns (address) { return pair; }
    function createPair(address a, address b) external returns (address) {
        require(pair == address(0));
        pair = address(new MockPair(a, b));
        return pair;
    }
}

contract MockPair {
    address public immutable factory = msg.sender;
    address public immutable token0;
    address public immutable token1;
    mapping(address => uint256) public balanceOf;
    uint112 private r0;
    uint112 private r1;
    constructor(address a, address b) { token0 = a; token1 = b; }
    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, uint32(block.timestamp)); }
    function setReserves(uint112 tokens, uint112 eth) external { r0 = tokens; r1 = eth; }
    function add(address to, uint256 tokens, uint256 eth) external {
        r0 += uint112(tokens); r1 += uint112(eth); balanceOf[to] += 1;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
}

contract MockLiquidityRouter is IUniswapV2Router {
    address public immutable override WETH;
    address public immutable override factory;
    bool public reject;
    uint256 public tokenAdded;
    uint256 public ethAdded;
    function lpBalance(address account) external view returns (uint256) {
        address p = MockFactory(factory).pair();
        return p == address(0) ? 0 : MockPair(p).balanceOf(account);
    }

    constructor() {
        WETH = address(new MockWETH());
        factory = address(new MockFactory());
    }

    function setReject(bool on) external { reject = on; }

    function addLiquidityETH(
        address token, uint256 desired, uint256, uint256, address to, uint256
    ) external payable override returns (uint256, uint256, uint256) {
        if (reject) revert("Rejected");
        address p = MockFactory(factory).pair();
        require(IERC20(token).transferFrom(msg.sender, p, desired), "Transfer failed");
        tokenAdded += desired;
        ethAdded += msg.value;
        MockPair(p).add(to, desired, msg.value);
        return (desired, msg.value, 1);
    }
}
