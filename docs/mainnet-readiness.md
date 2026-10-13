# Mainnet readiness: approved work, initial delivery

## Base and branch

The owner approved the remaining-work plan and explicitly requested a NEW branch.
`codex/mainnet-readiness-typecheck` starts at merged PR #35 commit
`0fe3a908b2f1169871a03f7bff3187164bd3035f`. No changes are made to main or the
previous delivery branch. Code review/merge is not permission to deploy or spend.

## Completed in this initial implementation

The frontend check now covers all maintained src JS/JSX/TS/TSX files, including
entrypoints and shared UI previously missed by the root configuration. The original
root check had 182 diagnostics; the full frontend scan had 455. Those overlap and
are not added. The complete corrected frontend has zero diagnostics locally.

Repairs use JSDoc and accurate imported component/ref/variant types, explicit state,
wallet declarations and request-error contracts. They do not add blanket any,
production suppression comments or exclusion of active code. Shared form context
now fails clearly before accessing an absent provider. Optional chart payloads and
stable React keys are handled. Public upload callers use the installed/documented
Core.UploadFile contract; the DBC IPFS service and legacy launch engine are not
replaced. Token amounts and on-chain IDL values remain unchanged.

`npm run typecheck` runs the full frontend compiler and source-coverage guard with
noEmit enabled. `npm run test:types` proves valid native props/ref/variant/OTP modes
compile and intentionally invalid contracts do not. CI now runs these checks,
mainnet boundary tests, lint and builds; it no longer treats building as typechecking.
This establishes FRONTEND coverage, not a completed Deno/backend/tooling audit.
Those additional approved check targets remain the next bounded milestone.

## Mainnet-only operations, preserved history

New DBC releases, legacy launch readiness, indexer network discovery and the server
RPC relay require the exact mainnet genesis identity. Historical activity/explorer
helpers still recognize devnet; they never authorize a devnet launch. Wrong-network
fixtures remain tests, with no external RPC calls. The production UI no longer
needs a devnet RPC. The Chromium devnet scenario now proves signing is blocked.

The server relay verifies genesis before forwarding, uses the existing method and
pool-query allowlist, caps response bodies and applies a 15-second timeout per
upstream request. Redirects, non-HTTPS endpoints and URL-userinfo are rejected.
Errors do not reflect private provider URLs/messages/data. There is no submission
retry or fallback RPC. A transport failure after forwarding remains potentially
ambiguous and must use the existing transaction journal/reconciliation flow.
The trusted mainnet provider remains a trust boundary; an identity check is not
cryptographic proof of every response or protection against a later provider change.

The obsolete protected-route observation job (including its public devnet matrix)
is removed; its compatibility job and all regression tests remain. Those old scans
looked for an abandoned configuration and were never DBC release approval. Actual
DBC mainnet verification remains the separately approved, read-only operator
procedure in docs/dbc-mainnet.md. No live manifest or credential is introduced.

## Verification and exact limits

Local checks: full frontend typecheck and coverage, positive/negative type-contract
tests, focused request/metadata/release/market regressions, all 138 existing Solana
unit tests, lint and production build. Counts and exact delivery-SHA GitHub results
belong in the PR handoff. Test wallets/RPCs are isolated fixtures, not mainnet.
Local Chromium navigation was rejected by the container's administrative browser
policy; unchanged CI executes the updated 11-case browser suite. Do not claim
local UI execution passed. Production build still warns about large chunks.

Pending approved work: runtime-correct backend/tooling typecheck targets and source
inventory, live program/configuration compatibility evidence, DBC/DAMM trading and
optional initial-buy UI, authenticated indexing, durable graduation/settlement
workers, separately approved residual accounting and a bounded real-wallet release
rehearsal. No claims of repository-wide zero diagnostics, completed automation,
production readiness, public deployment or paid operations follow from this batch.

Economic invariants stay: existing Kydos program/treasury and IDL, 1B initial supply,
793.1M/206.9M nominal allocations, original creator registration, permanent initial
LP locking, newly received base-fee burns and equal post-migration net quote payouts.
No Rust, configuration fingerprint, SDK, or dependency lock changes are included.

## Primary references reviewed

- https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
- https://www.typescriptlang.org/tsconfig/noEmit.html
- https://docs.base44.com/developers/references/sdk/docs/type-aliases/integrations
- https://solana.com/docs/rpc/http/getgenesishash
