# Backend and operational-tooling verification

## Delivery boundary

This continues the approved mainnet-readiness work on the single new branch
`codex/mainnet-backend-tooling`, based on merged PR #36/main
`2e361e82972a8aa0e6af137e205c611b92c7112c`. The opening commit `f32b8fe` refreshed
expired checker inputs; it was a diagnostic baseline, not the completed repair.
No program deployment, merge, mainnet transaction or release activation occurs.

The fresh Deno baseline reproduced 56 errors. An initial combined operational
script scan found 21 diagnostics. The final checks separate root tooling from the
isolated DBC package because their existing SDK installations intentionally use
different Web3 versions. Neither npm dependency lock or protocol configuration
was upgraded to make types compatible. Runtime-correct checks now pass locally;
exact delivery-commit CI is required before a merge-readiness claim.

## Changes with behavioral coverage

- Generic deadline results retain their value type instead of degrading to unknown.
  Invalid/expired deadlines reject before starting work. Timeout bounds waiting;
  it does not cancel a remote mutation or prove that no side effect occurred.
- Model tool arguments must be known, correctly typed fields in a plain object.
  Nullable optional fields normalize to absence. Repository/branch/read-before-write
  authorization remains separate and unchanged. Model-supplied expectedHeadSha is
  rejected; it can only come from trusted session context.
- Git commits require a valid observed 40-character head SHA before any transport.
  The generic dispatcher now supplies that explicit context. A stale head rejects,
  and the final ref update remains nonforced without automatic retry. This corrects
  the missing argument exposed by the checker rather than making it optional.
- Solana legacy and v0 messages use their common staticAccountKeys accessor.
  Actual Deno/SDK tests exercise both formats, wrong payer and missing signatures.
- RPC parameters accurately distinguish named DAS objects from positional arrays.
  Event-window options type both older/newer cursors; their runtime ordering,
  duplicate filtering and mutually exclusive cursor behavior are preserved.
- Script types reflect the actual DBC SDK enum contracts and deployment-target
  tuples. The account-only controller type view is generated from, and compared
  byte-for-byte to, the canonical browser IDL. It is not another protocol ABI.

Two existing Astra test expectations predated the active implementation: the
consumed prompt constant and HTML extraction/manual redirect handling. The tests
now assert the actual consumed safety prompt, retain redirect rejection, and add
script/style stripping and provenance checks. Those production modules were not
changed merely to satisfy obsolete tests. No compatibility safeguard is removed.

## Coverage and reproducibility

Use Node 22.16.0 and Deno 2.9.7, then install both existing npm locks:

```sh
npm ci --ignore-scripts
npm --prefix solana/dbc ci --ignore-scripts
npm run typecheck
npm run test:types
npm run test:backend
npm run test:backend-runtime
npm run lint
npm run build
```

The composite typecheck covers 201 frontend source files, 60 deployed-backend/shared
files, 20 maintained root/Solana operational scripts, and 9 isolated DBC helper,
account-declaration and runtime-harness files. These are source-inventory counts,
not unique runtime test counts. Frontend coverage remains checked independently.
New unassigned source, missing checker coverage, active suppression comments,
changed historical source or active imports of historical snippets fail the guard.

`typechecks/historical.json` explicitly pins three preexisting nondeployed draft
snippets and the archived EVM source inventory (114 files), which README already
marks inactive. The files are not removed or silently claimed type-safe. Tests
are inventoried separately and exercised by their runtime-specific suites; this
milestone does not claim every test file, third-party module or archived example
is statically checked. Rust remains covered by existing build/test workflows.

The backend retains its previous non-strict baseline compiler settings while
checking JS and TS. Existing implicit/explicit any in older code is not thereby
eliminated. No noImplicitAny/strict-mode migration or whole-repository security
audit is claimed. New contract repairs use specific types and validation, not
suppression comments or blanket replacement types.

Deno's configuration and integrity lock are now committed and frozen. The narrow
`base44:runtime` declaration describes the injected secret accessor; it is used
only by the checker, never as a deployed runtime substitute. This verification
lock does not prove the hosted Base44 deployment uses the same transitive packages;
actual deployed-runtime compatibility remains a release requirement.

The checker does not execute handlers, deployment scripts, or public transactions.
Deno tests run cached-only after dependency setup, without network/write/run/FFI
permissions. Only three nonsecret SDK environment settings are readable. CI sets
the two websocket optional-native toggles to avoid native loading. All fetches in
behavioral tests are local fixtures. The final workflow uploads logs and hashes,
not the temporary checker binary or dependency bundles used for diagnosis.

## Local evidence and required CI

Executed locally: complete composite typecheck, six coverage/type-regression cases,
23 backend/Astra behavioral cases (29 total in test:backend), five Deno runtime
cases, five frontend type-contract cases, 144 existing Solana tests, 46 isolated
DBC SDK tests, lint and production build. Suites may overlap; do not add them as
unique product guarantees. The original source/lock/dependency archives were
verified, but a fresh network install was not possible in this shell. Final PR CI
must install both npm locks cleanly and resolve the committed Deno lock itself.

The root application workflow now requires the composite check. The dedicated
backend/tooling workflow runs on qualifying PRs AND main pushes, so a green frontend
merge build cannot conceal a failing backend check. Existing Anchor, DBC runtime,
controller, browser and compatibility checks remain in place.

## What remains after this milestone

Runtime typechecking is not product completion or deployment approval. The approved
remaining work is live DBC/controller compatibility evidence, DBC/DAMM trading and
optional initial purchase, authenticated discovery/indexing, durable graduation
and settlement workers, approved residual policy, and bounded real-wallet release
acceptance. Mainnet is the only external RPC; isolated validators remain usable.

Ordinary SPL WSOL-quoted DBC configuration and token creation do NOT require a
Meteora team member's approval. The payer creates a valid configuration and the
creator signs pool initialization. Certain unsupported Token-2022 quote extensions
need an operator token badge; that is not Kydos's current SPL WSOL quote path.
Kydos's own verified release manifest is a deployment safety gate, not Meteora
permission. Do not reintroduce the abandoned private-DAMM operator dependency.

Primary references, reviewed 2026-10-15:
- https://docs.meteora.ag/core-products/dbc/accounts-and-permissions
- https://docs.deno.com/runtime/reference/cli/check/
- https://docs.base44.com/developers/backend/resources/backend-functions/overview
