# Market-data operations

The deployed oracle requires two distinct authorized signatures. A wallet address is not a running quote service. No signed reports have been published at the time of this repair. Until a valid report exists, the website displays a pending state and excludes historical screener captures from its verified feed.

## Pipeline

1. `keeper/snapshot.mjs` captures provisional Nasdaq screener data with its actual collection timestamp. Missing quotes fail validation; they are never replaced with zero. These captures alone are not certified closing prices.
2. `keeper/prepare.mjs` requests signatures through `keeper/attest.mjs`. Independently operated services must obtain and verify official close, prior close, listing identity, corporate actions, and exchange calendar themselves. They must not sign candidate data merely because it was submitted.
3. `keeper/settle.mjs` simulates oracle publication, then may relay the signed report and complete the pool's bounded settlement batches. Contract validation remains authoritative.
4. `tools/feed.mjs` publishes only the latest record matching the oracle commitment and calendar. `data/verified-sessions.json` is polled by the website; the browser independently checks the allocation against the oracle. A failed check clears the displayed allocation.

## Required configuration

- GitHub repository variable `QUOTE_ATTESTOR_URLS`: comma-separated HTTPS endpoints on at least two distinct hosts, operated by the holders of configured signing addresses.
- GitHub Actions secret `RELAYER_KEY`: a gas-paying relayer key. It cannot bypass the signature quorum. Configure it through GitHub's secret interface, never in source or chat.
- The three authorized signing keys stay in the respective independent service infrastructure. Do not add them to this repository or the frontend.

Each attestation endpoint receives a JSON POST with `chainId`, `oracle`, `day`, `quotesHash`, `digest`, and `snapshot`. After independently validating the complete snapshot and oracle domain, it returns `{day, quotesHash, signature}`. `signature` is a 65-byte EIP-712 signature matching the oracle's `reportDigest`. The client recovers and checks the signer against the deployed oracle and deduplicates signers. Redirects and URL credentials are rejected.

The website does not receive privileged credentials. Scheduled workflows only expose the relayer key to the settlement step. Logs redact sensitive provider errors.

## Trading and settlement

Before `Tickr.liveAt` is set, no session may settle. Sessions that opened before token trading started are excluded. A report can be published no earlier than its attested next market open. Automatic scheduling still requires off-chain services, available RPC endpoints and a funded relayer; contracts cannot fetch HTTP data or initiate their own transactions.

No claim of end-to-end operational settlement should be made until independent services are configured and an eligible live session completes a real on-chain publication and payout. A successful workflow that reports trading has not started is a safe idle run, not a payout.
