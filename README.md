# TickerDrop V2

3,172 company NFTs on Robinhood Chain (4663). The website defaults to English, followed by Spanish, Traditional Chinese and Japanese.

## Contracts and economics

- TickerDrop: paid ERC-721 mint, wallet invitations and an internal NFT order book. IDs 1–100 cost 0.005 ETH; the remainder cost 0.001 ETH. Each NFT includes 100,000 TICKR.
- The first 50 distinct wallets successfully mint without an invitation and receive a five-character alphanumeric code. Connecting a wallet reserves nothing. Later new wallets require another wallet's code; each code admits three distinct wallets. Referrers receive 15,000 TICKR per referred NFT from the separate reward reserve.
- Each mint allocates 90% of ETH to liquidity and pays 10% to the fixed deployment recipient. Initial liquidity uses a proportional TICKR reserve allocation; subsequent additions match current pool reserves. Unused ETH/TICKR stay locked with no withdrawal path. Actual additions and remaining budget are distinct.
- LiquidityVault mints liquidity through the verified Uniswap V2 Router. All received LP shares are transferred to address(0), irreversibly locking redemption rights. A failed DEX call or failed LP lock reverts the entire mint. The reserve is 635.22M TICKR; mint rewards and maximum referrals are separately funded with 317.2M and 47.58M TICKR.
- TICKR has a fixed 1B supply. Ordinary transfers after launch pay 3% to GainPool, including wallet transfers and unregistered pools. NFT book fills pay 3%. NFT ownership transfers through the internal book.
- Token, NFT and pool ownership are relinquished during initialization. First successful mint adds liquidity and automatically starts trading. An empty pair cannot start trading. No owner is needed for minting or settlement.
- Company names and snapshot market caps remain in versioned site data. Immutable on-chain tickers preserve the ID mapping. Static market caps are not live quote values.

## Automatic settlement

The automated-market-settlement workflow captures the regular close, runs automatic TradingView/Nasdaq checks, creates a 2-of-3 signature quorum and publishes at the next exchange open. The relayer then processes contract-enforced payouts in bounded batches, resuming after interruptions. No daily human signature is needed.

The signing tasks are project-operated, not independent providers. HTTP quote truth and availability are external trust assumptions. See [market-data operations](docs/MARKET_DATA.md) for exact validation tolerances, dependencies and failure behavior. The reference snapshot workflow cannot create settlement reports. The website displays verified allocations only after checking the oracle commitment.

Positive daily changes are ranked descending, with NFT-ID tie-breaking, until cumulative weight reaches 100%. The boundary takes the remaining weight; a positive total below 100% is allocated pro rata. Missing data is never replaced with zero. All-red days roll over. Unminted NFTs and holders below one TICKR retain their allocation in the pool. Eligibility uses ownership and token balances strictly before the next session's opening. Failed ETH pushes become claimable credit.

## Deploy and test

Run forge test, npm run test:data, the automatic-e2e integration test and browser checks before release. The optional LIQUIDITY_FORK_RPC enables real Robinhood Uniswap integration tests without broadcasting transactions.

script/Deploy.s.sol takes three public QUOTE_SIGNER addresses and an optional DEPLOYER_PRIVATE_KEY environment variable for signing. Never commit credentials. Deployment creates the verified V2 pair, funds rewards and locked reserves, binds the oracle and relinquishes ownership. Only publish active addresses after every deployment receipt and binding is checked. A pending website configuration intentionally disables minting.

GitHub Actions uses encrypted AUTO_SIGNER_KEY_1, AUTO_SIGNER_KEY_2, AUTO_SIGNER_KEY_3 and RELAYER_KEY secrets. The relayer needs ETH for Gas. Public reports contain signatures, not private keys. GitHub scheduling and public quote endpoints have no availability guarantee; a successful idle run is not proof of a production payout.

Frontend releases contain only checked static artifacts. Operational private data, local test fixtures, wallet files, broadcast caches and credentials are ignored by Git and excluded from deployment. Old on-chain contracts cannot be deleted; a new release removes their active website configuration rather than changing old bytecode.
