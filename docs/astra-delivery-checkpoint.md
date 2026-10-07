# Astra continuity checkpoint

## Active branch: codex/meteora-dbc-integration

Continue the SAME DBC branch. Resume source:
`71c8cd10d9e5c8461ddce185e898408e11d24461`. Based on owner's PR #34 revert
`111a75acc8c172b66bf8cedbc4af7eebe1f6a0b7`. Do not resume protected-DAMM operator
provisioning, restore custom graduation, change main, or move legacy accounts.

The interrupted task had saved the real npm lock. It is now retained unchanged;
CI lock bootstrap/self-write jobs and dependency bundle uploads are removed.
Only isolated solana/dbc code, its workflow and continuity docs change. Existing
Kydos program/IDL, launch client, root dependencies and supply policy are untouched.

## Delivered and verified locally

- Integer reconciliation fixes the finite-range percentage-helper discrepancy.
  Actual SDK AND executed DBC config now accept nominal 793.1M / 206.9M, 1B
  supply, no extra issuance, unchanged 85.005359057 SOL threshold and fee policy.
- 46 policy/SDK/confirmation tests and syntax checks pass.
- 29 executed lifecycle cases pass: actual config + SPL mint creation, buys,
  sell, partial-fill threshold crossing, DAMM migration, full permanent lock,
  fee-owner verification, post-migration swaps, rejected duplicate and rollback
  after successful migration. Two independent paths; 28 local transactions.
- Final trade rounding leaves one raw base unit (0.000001 token) and one lamport
  surplus in BOTH tested paths. Nominal allocation checks remain exact. Reports
  separate protocol migration fees, net deposits, trading fees and residuals.
- Agave 2.1.21, SDK 1.5.13 and existing lock. Pinned real public program binaries;
  synthetic genesis DAMM config. Fixed loopback only. No Kydos program loaded.

## Limits and next action

Inspect exact-head DBC CI and review the bounded milestone. Reports/logs are
retained by the normal workflow. No live DBC configuration, production fee
controller, UI/indexer integration or keeper exists yet. Fee owner is an ephemeral
local TEST wallet, not proof of program-enforced creator rights or base burns.
Next implement authenticated creator mapping and a usable fee-controller PDA,
then app/keeper integration. Do not assign production rights to an unimplemented
PDA or use a wallet as a production bypass. Current binary/deployment and config
compatibility remain release requirements. No paid upgrade or public transaction.

Details and measurements: docs/dbc-transition.md. Final commit SHA and post-edit CI
belong in the chat/PR handoff, not a recursive commit with this file's own SHA.
