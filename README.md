# TickerDrop

纳斯达克 3172 只普通股 / ADR，按市值排名编号，一只股票一张卡。Robinhood Chain（4663）。

```
src/Tickr.sol        TICKR，1B 固定总量，交易对买卖 3% 进 GainPool
src/TickerDrop.sol   ERC721，铸造 / 内置交易簿 / 链上 SVG，成交 3% 进 GainPool
src/GainPool.sol     收费 + 每个交易日收盘结算
keeper/settle.mjs    收盘后抓取涨幅，提交 settle()
tools/snapshot.mjs   生成股票表（data/tickers.*）
web/                 前端
```

## 规则（合约强制）

- `#1–#100` 0.005 ETH，其余 0.001 ETH；`0x175d…B0dd` 白名单 0 ETH。铸造款由合约直接转入该地址。
- 每张铸造到账 100,000 TICKR。铸造派发共 317.2M，剩余 682.8M 留在部署地址用于建池。
- TICKR 交易对买卖、NFT 交易簿成交、ERC-2981 版税，均为 3%，全部进入 GainPool。
- 每个美股交易日收盘后：正涨幅按降序累加权重，到 100% 截止，跨线者取余量；不足 100% 按涨幅占比分全池。
- 0% / 负涨幅不分；当日无正涨幅不分，滚存。
- 卡未铸造、或持有人 TICKR < 1，该份额滚存。
- TICKR 手续费以 TICKR 发，ETH 手续费以 ETH 发（发送失败转为 `credit`，`claim()` 领取）。
- `goLive()` 之后的第一个收盘才开始结算；周末、未收盘、重复日期一律 revert。
- NFT 只允许白名单 operator 授权，第三方市场无法绕开 3%。

## 部署

```bash
npm i
forge test

# REPORTER = 每日提交结算的地址（keeper 私钥对应的地址）
REPORTER=0x... forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --private-key $PK
```

脚本会部署三个合约、互相绑定、把 317.2M TICKR 转入 NFT 合约、开启铸造，并把地址写入 `web/src/chain/deployed.json`。提交这个文件，网站和 keeper 都读它。

上线顺序：

1. 部署后先算出 TICKR/WETH 交易对地址，`Tickr.setPair(pair, true)`。在 `goLive()` 之前任何人都无法往这个池子里加流动性或交易。
2. 铸造结束：`TickerDrop.closeMint()`，`sweep()` 收回未铸造部分的 TICKR。
3. 用 LP 地址里的 ETH + 部署地址的 TICKR 建池（V2 类 AMM；V3 不支持转账扣费代币的卖出）。
4. `Tickr.goLive()`。下一个美东收盘开始第一次结算。
5. 配置完成后可 `renounceOwnership()`。

## 每日结算

GitHub Actions `settle` 在每个工作日 20:06 / 21:06 UTC 触发（覆盖夏令时与冬令时），脚本自己判断是否已收盘、是否已结算、是否节假日。

仓库 Settings → Secrets → Actions：

- `REPORTER_KEY` reporter 私钥（只需少量 ETH 付 gas）
- `RPC_URL` 可选，默认公共节点

每次结算的原始数据（全部股票涨幅 + 提交内容）作为 artifact 保存 90 天，可对照链上 `Paid` 事件复核。也可以在任意服务器上跑：

```bash
REPORTER_KEY=0x... node keeper/settle.mjs
```

## 前端

```bash
cd web && npm i && npm run dev
```

push 到 `main` 自动发布到 GitHub Pages。
