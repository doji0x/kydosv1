# DBC browser integration: merge candidate

## Scope and provenance

Continue `codex/meteora-dbc-integration` from
`b815a317efdd37e03b91f8a90b4a7dc13ab89765`. This commits the previously delivered
browser patch; it does not change Rust, IDLs, dependencies, economic policy,
legacy market handling, or the admin server-wallet launch path. The source
controller passed workflow 37858540064. That is not evidence for this patch's CI.

The original patch SHA256 is
`ff00d8d36da85952aea398c71252dfc542e410edea409a63a3706b1fc03f1498`.
Executable browser, UI, RPC and test files retain that patch's contents. This
record replaces the offline-only handoff. Exact-head and PR-merge checks must
complete before reporting merge readiness. No deployment is authorized.

## Browser behavior

The /launch page retains Coming soon by default. The build flag
`VITE_KYDOS_DBC_UI_ENABLED=true` exposes a DEVNET preview only, not permission
to transact. Creation invokes Kydos launch_dbc for atomic original-creator
registration, never raw DBC or legacy creation. A fresh mint secret stays in a
WeakMap; it is not returned to UI state, storage, APIs, logs or exported results.
Initial buys are explicitly rejected, not silently omitted.

The fee screen authenticates the Kydos registry rather than DBC's mutable creator
field. It reads bounded, pool-scoped positions and builds claim_dbc_fees or
settle_damm_fees, never raw claims. The on-chain controller enforces account
bindings, full permanent locking, base burns and equal creator/Kydos net quote
payouts. Bonding partner fees remain Kydos-only. Quote remains WSOL in canonical
recipient ATAs; no wallet sweep or automatic unwrapping occurs. Historical u128
counters stay exact integers.

Creation and claims are simulated for review and again before signing. Settlement
previews parse a Kydos event in its program invocation context, not wallet
balances. Empty claims reject before wallet approval. Instruction contents are
bound to a single-use review. Wallet/network/release changes or increased setup
budgets reject. All potentially needed custody and recipient rents are reserved,
including existing recipient accounts which could close during wallet approval.
Anticipated revenue never funds execution costs.

The existing durable activity journal saves the signed signature and submitting
marker before the sole broadcast. Ambiguous outcomes retain their recovery lock;
there is no automatic resubmission. DBC activity links point to the DBC workspace,
not the legacy market. The page does not operate a keeper or production indexer.

## Release gate

The manifest is public configuration, not a secret. VITE_KYDOS_DBC_RELEASE must
contain enabled=true, the devnet genesis identity, an independently verified DBC
config public key, and programDataHashes for Kydos, DBC, DAMM and Metaplex:

- Kydos: GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE
- DBC: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
- DAMM: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
- Metaplex: metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
- Devnet genesis: EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG

Each hash is SHA256 of the COMPLETE verified ProgramData account bytes, including
loader state, deployment slot, authority and allocation padding, not merely a .so
hash. The loader ownership and program/PDA bindings and full DBC policy hash are
checked. Verification occurs before review and submission, including after wallet
signing. Mainnet rejects even with the UI flag enabled. Changing Phantom's
network alone does not change the authenticated backend RPC's network.

Do not substitute synthetic fixture hashes for live verification. This release
gate trusts the configured RPC and independently reviewed manifest. It cannot
prevent an upstream upgrade after the last read, nor replace security review.
A public-network rehearsal and production approval remain required.

## Merge checks and limitations

The new workflow installs BOTH committed dependency locks with npm ci, runs 23
browser-flow tests, 3 differential SDK checks, selected existing regression tests,
lint, default and opt-in production builds, and a no-source-mutation check. It
uses read-only repository permissions. All browser wallet/RPC tests are mocked;
they are not proof of a real Phantom interaction. The independent controller and
DBC lifecycle workflows execute actual programs in local validators.

The preceding offline workspace passed 23 browser, 3 differential and 25 selected
regression tests plus lint and both builds. Its full typecheck was already red:
185 baseline diagnostics vs 182 with the patch, with no new diagnostic heads.
Do not claim full typecheck success from this result. Clean-install exact-head CI
and the full PR checks supersede the offline environment for merge validation.
Visual browser navigation and real-wallet testing have not been established.

Production launch readiness is separate from merging this disabled preview.
Initial buys, DBC/DAMM trading UI, image upload, chart/indexer routing, graduation
and settlement keepers, surplus/leftovers and SOL unwrapping remain separately
scoped work. Never enable public fee rights or launches before deployed-controller
and configuration verification. Existing coins are not reinterpreted or imported.

## Primary references

- https://solana.com/docs/rpc/http/simulatetransaction
- https://www.anchor-lang.com/docs/clients/typescript
- docs/dbc-fee-controller.md and docs/dbc-transition.md
- SDK 1.5.13 and the unchanged isolated lock (differential tests).
