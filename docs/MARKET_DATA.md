# Automatic market settlement — V2

No daily wallet confirmation is required. The automated-market-settlement workflow captures a closing report, runs source reviews using three dedicated signing accounts, finalizes a two-signature quorum, and relays due publication and settlement transactions using a separate gas account. It retries every twenty minutes during weekday operating hours, covering both New York daylight-saving offsets.

## Sources and trust

TradingView's delayed public screener is the primary ranking source. Collection membership, symbol, exchange, currency and stock type are validated. Pagination continues through the allocation boundary and its ties. A matching universe smaller than the collection is rejected. Nasdaq's screener checks for omitted higher gainers, and individual Nasdaq quotes corroborate every recipient's trade date, price and percentage change. The permitted differences are 0.1% of price and 0.02 percentage points of daily change.

The checks and keys are operated by the project, not independent third-party oracle operators. Signatures are NOT issued by either data provider and do not cryptographically prove the truth of HTTP prices. Multiple keys retain common GitHub-account and software trust assumptions. Public endpoints have no guaranteed availability or immutable historical-close interface. Licensed feeds and independently operated validators would strengthen this design.

Signing starts at least twenty minutes after the reported regular close, within a bounded review window. Unsigned failed candidates can be replaced. Once any reviewer signs, the exact candidate is preserved across retries. Finalized snapshots and signatures are immutable and publicly retained without private keys. A missing or inconsistent quote blocks signing; it never becomes zero.

## Execution and recovery

At the next session's opening, the relayer checks the chain, oracle, report hash and signatures, simulates publication, waits for its receipt and settles in batches of up to 64 allocations. Progress is read from the contract after every receipt. Restarting resumes pending work without paying a completed round again. Eligibility, weights, balances and distributions are contract enforced. Rejected ETH pushes become claimable credit.

Contracts cannot fetch HTTP or initiate transactions. Automatic execution still depends on data services, RPC, scheduled runners and relayer gas. GitHub schedules may be delayed. Missing closing windows or prolonged provider outages can halt subsequent sessions; the system must never fabricate a missing day. A pre-trading or pending-deployment idle run is not a completed payout.

## Secrets and verification

AUTO_SIGNER_KEY_1, AUTO_SIGNER_KEY_2, AUTO_SIGNER_KEY_3 and RELAYER_KEY are GitHub encrypted Actions Secrets. Public signing addresses must match the oracle. Signing accounts have no withdrawal privilege; the separate relayer holds a limited Gas balance. Keys never enter frontend builds, reports or repository history.

The old external-service-only settle workflow is removed. The snapshot workflow produces reference quotes only. Finalized records are created by the automatic review workflow. The browser verifies displayed allocations against the oracle commitment.

The integration test runs the actual capture, signing, assembly and settlement CLI programs on an isolated real EVM, using explicitly synthetic provider responses. It verifies a one-ETH local payout and duplicate-run protection. This is a test of automation mechanics, not a completed production session or independent audit.
