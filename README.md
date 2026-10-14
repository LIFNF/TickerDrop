# TickerDrop

3,172 Nasdaq common shares and ADRs, ranked by market cap. One listing, one card. Robinhood Chain (4663).

```
src/Tickr.sol        TICKR, fixed 1B supply, 3% on pair buys/sells to GainPool
src/TickerDrop.sol   ERC721: mint, built-in order book, on-chain SVG; 3% of every fill to GainPool
src/GainPool.sol     fee pool + per-session settlement
keeper/snapshot.mjs  records each final close to data/sessions/
keeper/settle.mjs    at the next open, posts settle() for every recorded session
tools/snapshot.mjs   builds the ticker table (data/tickers.*)
web/                 site
```

## Rules (enforced on-chain)

- `#1–#100` 0.005 ETH, the rest 0.001 ETH. `0x175d…B0dd` is whitelisted at 0 ETH. Mint ETH is forwarded by the contract straight to that address.
- Every mint drops 100,000 TICKR. The mint drop totals 317.2M; the remaining 682.8M stays with the deployer for liquidity.
- TICKR pair buys/sells, NFT book fills and ERC-2981 royalties are all 3%, all into GainPool.
- Each session is scored on its final close and settled no earlier than 09:30 New York on the next weekday (DST handled on-chain). Positive movers are stacked by gain, descending, until the weight hits 100%. The one that crosses takes the remainder. If the positives sum to under 100%, they split the whole pool pro rata.
- Flat and red closes get nothing. A session with no gainers pays nothing and rolls over.
- Unminted slots and holders with < 1 TICKR forfeit their cut to the next session.
- TICKR fees pay out in TICKR, ETH fees in ETH. Failed ETH pushes become `credit`, withdrawn via `claim()`.
- The first scored session is the first full close after `goLive()`. Weekend days, repeated days and calls before the next open revert. Weekends and holidays settle nothing, so the pool keeps stacking into the next payout.
- NFT approvals are limited to allowlisted operators, so third-party venues can't skip the 3%.

## Deploy

```bash
npm i
forge test

# REPORTER = address that posts the daily result (the keeper key's address)
REPORTER=0x... forge script script/Deploy.s.sol --rpc-url robinhood --broadcast --private-key $PK
```

The script deploys and wires all three contracts, moves 317.2M TICKR into the NFT contract, opens the mint, and writes the addresses to `web/src/chain/deployed.json`. Commit that file; the site and the keeper both read it.

Launch order:

1. Compute the TICKR/WETH pair address and call `Tickr.setPair(pair, true)` before the mint opens. Until `goLive()`, nobody can add liquidity to or trade on it.
2. When the mint ends: `TickerDrop.closeMint()`, then `sweep()` to pull back the unminted drop.
3. Seed the pool with the ETH in the LP address plus the deployer's TICKR (V2-style AMM; V3 can't sell fee-on-transfer tokens).
4. `Tickr.goLive()`. The next full session is the first one scored, paid at the following open.
5. Once configured, `renounceOwnership()` if you want.

## Daily settlement

Two workflows, both on weekdays and both doubled for EDT/EST:

- `snapshot` runs at 20:08 / 21:08 UTC. Once Nasdaq marks the session closed, it writes every listing's final change to `data/sessions/YYYY-MM-DD.json` and commits it. Holidays and half-filled feeds are refused.
- `settle` runs at 13:31 / 14:31 UTC. Once the market is open, it posts every recorded session the pool hasn't settled yet, oldest first. A Friday close is paid Monday; a holiday adds nothing and the fees carry over.

The committed session files are the audit trail: anyone can rerun `keeper/round.mjs` on them and compare with the on-chain `Paid` events.

Repo Settings → Secrets → Actions:

- `REPORTER_KEY` reporter private key (needs a little ETH for gas)
- `RPC_URL` optional, defaults to the public endpoint

Both scripts also run on any server:

```bash
node keeper/snapshot.mjs
REPORTER_KEY=0x... node keeper/settle.mjs
```

## Site

```bash
cd web && npm i && npm run dev
```

Pushes to `main` publish to GitHub Pages.
