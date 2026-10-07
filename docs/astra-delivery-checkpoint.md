# Astra continuity checkpoint

## Active delivery: Meteora DBC integration

Owner selected DBC for NEW launches and explicitly requested a new branch.
Continue `codex/meteora-dbc-integration`, based on the owner's revert commit
`111a75acc8c172b66bf8cedbc4af7eebe1f6a0b7`. At branch creation main was still
`38ff3b3619ea1e11bd6d6576ba03a35eea0c1f8b`. Do not restore PR #34 or resume
private-config operator provisioning. Do not merge or overwrite either branch.

First scope: isolated `solana/dbc` package with official SDK 1.5.13, requirements
tests, candidate generation, unsigned config ABI test and an honest SDK-derived
accounting report. No program, IDL, existing launch client or root package change.
Policy matching is not on-chain verification.

Package publication, transitive lockfile and SDK execution are checked by the new
DBC workflow, because local shell networking cannot resolve npm/GitHub. Its initial
bootstrap uploads the generated lockfile for review; commit that lockfile and remove
bootstrap before calling the install reproducible. Inspect exact branch commit CI.
Never copy requested allocation numbers into an allegedly verified SDK report.

Local policy tests: 29 pass on Node 22.16.0; candidate/test/inspector syntax checks
pass. SDK tests, DBC runtime, migration, custody and payouts are not established by
those checks alone. A missing implemented settlement PDA is a release blocker;
do not assign production fee rights to an unimplemented controller to launch.

Next: inspect actual SDK reports, reconcile exact nominal allocation and buffer
requirements, then execute DBC creation/trading/graduation against pinned local
programs. Adapt launch/UI/indexing only after canonical-account tests. Existing
coins remain legacy; no DBC importer or second curve is implied. No transaction,
upgrade, config, pool, fee claim, burn or payout is authorized by this checkpoint.

Historical protected-route documents and the prior active task in work-state
are superseded for this task; do not resume the rejected architecture. Final
commit identity and exact-head checks belong in the chat handoff.
