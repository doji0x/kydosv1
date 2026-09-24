# Launch and chart reliability rollout

## Deployment blocker

The checked-in Kydos address is `GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE`.
The earlier deployment error was reported while the repository still targeted a
different address. Both launch paths show the actual RPC network and stop before
metadata uploads when the currently configured address is not executable there.
Phantom's selected network does not change Base44's `HELIUS_RPC_URL`.

For an existing deployment, establish its cluster, program address, authority and
matching source/IDL. For a new deployment, use an operator-controlled program
keypair. Keep Rust `declare_id!`, Anchor configuration, the generated browser IDL
and `base44/shared/solanaProtocol.js` consistent; configuration tests reject drift.
Follow the locked build/IDL commands in [the Solana README](../solana/README.md).
Do not substitute an arbitrary executable program or generate an unrelated
keypair for the currently checked-in address.

With the intended RPC in the local environment, this check is read-only:

```sh
node solana/scripts/check-deployment.mjs
```

It verifies network identity and executable accounts, not source/binary equality.
Deployment and binary verification remain separate operator steps. See
[Solana deployment](https://solana.com/docs/programs/deploying) and
[Anchor verifiable builds](https://www.anchor-lang.com/docs/references/verifiable-builds).
No deployment or funded launch was performed for this change.

## Admin and Phantom funding

Admin launch preserves `SOLANA_MAINNET_PRIVATE_KEY` precedence, falling back to
`KYDOS_DEPLOYER_KEY`. These are server-only secrets. The displayed server wallet
pays native SOL for rent, the separate Metaplex creation levy, and network fees;
a connected Phantom wallet does not fund it. Status estimates use the actual
cluster rent/fee schedule. There is no fixed SOL balance that applies universally.

The admin initializer includes the FeePolicy PDA and the same account ordering
and compute limit as the Phantom builder. It signs with the mint and server
wallet, simulates the signed message, retrieves `SendTransactionError.getLogs()`,
and keeps ambiguous submissions unresolved instead of making another mint.
Public recovery receipts are stored before broadcast, so a missing HTTP response
can be reconciled by request ID. If no receipt exists after an interrupted call,
operator reconciliation is required; never clear the lock merely because an RPC
status is temporarily missing. Run admin launches serially; Base44 does not offer
atomic request-ID uniqueness across concurrent callers.

Kydos curve creation/buy uses native SOL. WSOL staging belongs to the future DAMM
migration; an absent WSOL account does not explain this curve launch failure.

## Canonical chart ingestion

Deploy these backend functions and entities with the frontend:

- `adminLaunchToken`, `AdminLaunchReceipt`.
- `indexSolanaTransactions`, `solanaTokenChart`, `solanaBoard` and their shared modules.
- `SolanaTrade`, `SolanaIndexState` (service-role writes/reads only).

The chart endpoint now reads stored events instead of ingesting history on every
page view. Old generic swap rows are retained but excluded from canonical
queries. A replay is necessary. The decoder reads finalized program signatures,
raw transaction logs and block signature positions through `HELIUS_RPC_URL`.
It checks invocation ownership, rollback, trade fees and complete event logs.
Unavailable transactions, block positions or truncated logs stop checkpoint
advancement and surface an indexing problem. Fix provider coverage or decoding
and replay that page; do not silently skip it.

Each event retains raw amounts, trader, chain/program identity and chain order.
Multiple trades per signature survive. SOL volume follows curve reserve movement
(buy net, sell gross); treasury fees remain separate. The enhanced SOL/WSOL
adapter is available separately and does not mix external venues into Kydos data.
Meteora pool candles require a verified migration and a separate pool decoder.

Configure a random `KYDOS_INDEXER_TOKEN` of at least 32 characters in Base44 and
in one supervised worker. Set `KYDOS_INDEXER_URL` in that worker to the deployed
`indexSolanaTransactions` function's HTTPS endpoint. Do not use a browser-exposed
secret. Run exactly one instance:

```sh
node solana/scripts/run-indexer.mjs
```

`--once` performs one catch-up cycle plus an older-history page. The continuous
worker drains live pages before advancing the durable head, backfills older
pages, then waits 15 seconds. It stops on errors, including ambiguous timeouts,
for operator inspection. The worker needs a deployed program and provider history
access; it was not started against the hosted app during this change.

Base44 lacks unique constraints/atomic leases. The worker must remain single
writer; the function's local guard is not distributed. Inserts are retryable and
readers deduplicate by canonical event ID before aggregation. Duplicate checkpoint
records stop processing. For multiple workers or higher throughput, move ingestion
to a database/queue with atomic uniqueness and leases behind the same API.
[Base44 schema limitations](https://docs.base44.com/developers/backend/resources/entities/entity-schemas)

History-complete means replay reached the end of RPC-available history. It does
not prove an archival provider retained everything. Finalization introduces an
intentional delay. Metadata/FX caches are best-effort per isolate for 60 seconds,
not a shared global cache. USD is an observed current SOL conversion and expires
after two minutes; historical candles remain SOL-denominated.

## UI and validation

Live/history cursors are independent, older pages can pass the previous 500-row
limit, and live bursts drain ascending pages without losing trades. Quiet markets
use indexer health rather than last-trade age. The market shows chain identity,
FDV, curve inventory progress, recent trades and a desktop trade panel. Candles
use stable chain ordering, incremental latest-bar updates and a follow control.

The board includes launches with zero buys and reports 24-hour volume among the
latest 200 indexed launches. It scans at most 5,000 stored rows per request. If
history or this sample is incomplete, it labels the sample and sorts by launch
time rather than claiming a complete volume ranking.

Regression tests cover ABI/cost parity, admin handler funding/deployment failures,
signed simulation and response-loss recovery, event multiplicity/rollback, WSOL,
850-event pagination, burst catch-up, candle ordering and valuation freshness.
Hosted Base44 execution, Phantom extension behavior and funded chain execution
remain untested. No program/IDL/fee-economics change is included.
