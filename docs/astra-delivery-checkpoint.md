# Astra continuity checkpoint

## Active task: Meteora DBC integration

Owner selected DBC for NEW launches and explicitly requested a new branch.
Continue `codex/meteora-dbc-integration`, based on the owner's revert
`111a75acc8c172b66bf8cedbc4af7eebe1f6a0b7`. At branch creation main was still
`38ff3b3619ea1e11bd6d6576ba03a35eea0c1f8b`. Do not resume protected-DAMM operator
provisioning, restore PR #34, merge the revert, or overwrite unrelated work.

First code commit: `5551734758cf79d0d3129e9f57def54935992894`.
Isolated solana/dbc package uses official SDK 1.5.13, builds a candidate and
checks actual calculated supply plus unsigned config instruction construction.
Root dependencies, program/IDL and production launch client remain unchanged.

CI run 37657033302 passed 39 offline tests and candidate generation. Artifact
11499375871 contains npm-generated lockfile, test results, report and public
SDK dependencies. No RPC is permitted in the unsigned config test. The compiler
and validator suites for the legacy program were not rerun as part of this proof.

Actual SDK nominal result: initial 1000000000000000; curve 793099988517748;
gross migration 206900002375678; remainder 9106574 raw base units. Buffer minimum
fits initial supply, but exact 793.1M/206.9M allocation does NOT match. Strict
checks report this mismatch; no tolerance or supply change was authorized.

Next: finalize the real generated package lock and remove CI bootstrap; reconcile
allocation using executed DBC math, then run create/trade/graduate/post-swap against
pinned local programs. This milestone does not execute DBC or implement a fee
controller. Do not assign production fee rights to an unimplemented PDA.

Design/evidence: docs/dbc-transition.md. Old protected-route task notes are
historical, not active instructions. No mainnet/devnet transaction, paid upgrade,
config, token, pool, claim, burn or payout. Final SHA and exact-head CI belong
in chat, not in a recursive commit containing its own SHA.
