# Astra continuity checkpoint

Current design: [fee-settlement.md](fee-settlement.md).
Historical adapter: [meteora-adapter.md](meteora-adapter.md).

## Current handoff - base-burn / quote-split foundation reconciled with main

- **Scope/status:** Offline settlement accounting on `codex/base-burn-quote-split`,
  draft PR #30. Reconciled after the owner merged private-config revert PR #29.
  No executable claim, payout, burn or permissionless migration is enabled.
- **Source/base:** Foundation `6c1828e4b38899399d979d49f49dfc4be892358f`;
  merged upstream `fd11f095c8e69e8d88ef455983860a72fe1cc5c4`, which includes
  PR #29 at `221180adfb065382463119436f8ff8cddbd65854`.
  Reconciliation preserves both histories without force-pushing or changing main.
  Upstream public-launch, Jupiter trading and chart changes stay intact.
- **Policy:** Burn all launch-controlled post-migration base fee receipts.
  Net quote receipts split equally between the recorded creator and Kydos.
  One raw quote unit may remain as protected rounding dust until the next claim.
  No extra tax, staking, buybacks or holder rewards. Curve economics unchanged.
- **Changes:** Keep existing Rust/JavaScript helpers, shared fixtures and tests
  byte-for-byte unchanged. Remove package references to reverted operator scripts
  and tests; refresh settlement design and continuity records. Deleted config
  files are not restored. Historical private-route scaffolding remains unenabled
  and must be replaced in a separate permissionless-migration milestone.
- **Verification:** Re-ran 21/21 focused JavaScript tests and new-file syntax
  checks on Node 22.16.0. Verified helper/test/CSV source blob hashes and package
  removal of `meteora-config` references. New exact-head CI must be inspected
  separately before merge; prior-head success is not equivalent evidence.
- **Limits:** No Rust/Cargo/Anchor available locally; no full dependency checkout,
  full regression suite, SBF/IDL check, validator/devnet run, deployed program
  inspection, transaction submission or mainnet action in this milestone.
  Resulting delivery SHA and fresh CI state are reported in the chat/PR handoff.

## Next owner/action

Review the reconciled draft and exact-head CI. PR #29 is already merged; do not
repeat operator provisioning or restore its deleted setup. Next implement and
test permissionless migration, including precreated-pool/collision handling,
permanent-lock custody and receipt validation, before wiring atomic claim ->
base burn -> equal quote payouts. Additional taxes and holder distributions
remain separate economic decisions.
