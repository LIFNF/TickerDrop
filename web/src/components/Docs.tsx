import { addr, chain, explorer } from "../chain/config";
import type { State } from "../lib/data";
import { eth, tkn } from "../lib/format";
import { tx } from "../lib/copy";

const repository = "https://github.com/LIFNF/TickerDrop";

const contracts = [
  ["TICKR", addr.tickr, "Fixed-supply token and transfer fees"],
  ["TickerDrop", addr.drop, "NFT mint, invitations and order book"],
  ["GainPool", addr.pool, "Trading-fee pool and settlement"],
  ["LiquidityVault", addr.liquidityVault, "Locked TICKR and LP position"],
  ["QuorumMarketOracle", addr.marketOracle, "Two-of-three signed market reports"],
] as const;

export function Docs({ state, onClose }: { state: State; onClose(): void }) {
  return (
    <main className="docs-screen" id="docs">
      <div className="docs-wrap">
        <div className="docs-heading">
          <div>
            <span className="docs-eyebrow">{tx("PROTOCOL / 01")}</span>
            <h1>{tx("Documentation")}</h1>
            <p>{tx("A concise guide to the live contracts, mint rules, market and settlement.")}</p>
          </div>
          <button className="docs-close" onClick={onClose} aria-label={tx("Close")}>×</button>
        </div>

        <div className="docs-status">
          <span className="docs-led" aria-hidden="true" />
          <strong>{chain.name}</strong>
          <span>{state.ready ? tx("On-chain data synced") : tx("Syncing on-chain data")}</span>
          <span className="docs-status-end">{tx("Minted")} {state.ready ? state.minted.toLocaleString() : "—"} / 3,172</span>
        </div>

        <div className="docs-grid">
          <section className="docs-card docs-primary">
            <span className="docs-num">01 / {tx("MINT")}</span>
            <h2>{tx("One company. One NFT.")}</h2>
            <p>{tx("The 3,172 NFT IDs follow the collection's market-cap ranking. Each ID can be minted once and includes 100,000 TICKR.")}</p>
            <div className="docs-rows">
              <div><span>{tx("IDs 1–100")}</span><strong>0.005 ETH</strong></div>
              <div><span>{tx("IDs 101–3172")}</span><strong>0.001 ETH</strong></div>
              <div><span>{tx("Mint payment")}</span><strong>{tx("Mint proceeds: 0.1 locked liquidity · 0.9 treasury")}</strong></div>
            </div>
          </section>

          <section className="docs-card">
            <span className="docs-num">02 / {tx("ACCESS")}</span>
            <h2>{tx("Invitations")}</h2>
            <p>{tx("The first 50 distinct wallets to complete a mint need no code and receive a five-character code. Connecting a wallet reserves nothing. Later wallets need a code; each code admits three wallets.")}</p>
            <p>{tx("The inviter receives 15,000 TICKR per NFT minted by a referral from a separate reward reserve. The minter still receives 100,000 TICKR.")}</p>
          </section>

          <section className="docs-card">
            <span className="docs-num">03 / {tx("MARKET")}</span>
            <h2>{tx("Trade and list")}</h2>
            <p>{tx("An NFT may be listed in the on-chain order book as soon as it is minted. A completed sale sends 3% of its ETH price to GainPool. Ordinary TICKR transfers, including trades, also send 3% in TICKR to the pool.")}</p>
            <p>{tx("Mint payments and secondary-market fees are separate flows.")}</p>
          </section>

          <section className="docs-card">
            <span className="docs-num">04 / {tx("SETTLEMENT")}</span>
            <h2>{tx("Market-data settlement")}</h2>
            <p>{tx("Market reports require signatures from at least two of three configured signers. Anyone can relay a valid report and advance settlement; the contracts cannot fetch external stock prices by themselves.")}</p>
            <p>{state.liveAt===0?tx("Trading has not started. No settlement is available yet."):tx("Settlement requires signed market data and a relayer transaction.")}</p>
            <p>{tx("Eligibility uses the recorded snapshot: the matching NFT and at least 1 TICKR must be held in the same wallet. Unallocated fees carry forward.")}</p>
          </section>
        </div>

        <section className="docs-card docs-ledger">
          <div className="docs-section-head"><div><span className="docs-num">05 / {tx("ON-CHAIN")}</span><h2>{tx("Contract registry")}</h2></div><span className="docs-chain-id">CHAIN ID 4663</span></div>
          <div className="docs-contracts">
            {contracts.map(([name, address, description]) => (
              <a key={name} href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer" className="docs-contract">
                <span className="docs-contract-name">{name}<small>{tx(description)}</small></span>
                <code>{address}</code><span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </section>

        <section className="docs-card docs-live">
          <div><span className="docs-num">06 / {tx("LIVE STATE")}</span><h2>{tx("Pool and liquidity")}</h2></div>
          <div className="docs-live-grid">
            <div><small>{tx("ETH in gain pool")}</small><strong>{state.ready ? `${eth(state.pot.eth)} ETH` : "—"}</strong></div>
            <div><small>{tx("TICKR in gain pool")}</small><strong>{state.ready ? tkn(state.pot.tkn) : "—"}</strong></div>
            <div><small>{tx("ETH added to locked liquidity")}</small><strong>{state.liquidity.ready ? `${eth(state.liquidity.addedETH)} ETH` : "—"}</strong></div>
            <div><small>{tx("TICKR held in liquidity vault")}</small><strong>{state.liquidity.ready ? tkn(state.liquidity.heldTICKR) : "—"}</strong></div>
          </div>
        </section>

        <div className="docs-footer">
          <span>{tx("Contract state and transactions are public on the chain explorer. GitHub repository access may require authorization.")}</span>
          <a href={repository} target="_blank" rel="noopener noreferrer">GITHUB ↗</a>
        </div>
      </div>
    </main>
  );
}
