# Astra continuity checkpoint

Current design: [fee-settlement.md](fee-settlement.md).
Historical adapter: [meteora-adapter.md](meteora-adapter.md).

## Current handoff - base-burn / quote-split foundation

- **Scope/status:** Offline fee-settlement accounting implemented for review on
  `codex/base-burn-quote-split`. No executable claim, payout or burn is enabled.
- **Source/base:** `main` at `69885cd0894a15dee350428e09c30c0d6b6f9ced`.
  Main still contains PR #28. Owner's revert PR #29 remains open at
  `9a9d38e49b64e01b7b16a24961610f632d134cf9`; it has not merged. This branch
  does not merge or modify that revert. Reconcile overlapping package/checkpoint
  changes before merge; do not resurrect the rejected operator setup.
- **Policy:** Burn all launch-controlled post-migration base fee receipts.
  Net quote receipts split equally between the recorded creator and Kydos.
  One raw quote unit may remain as protected rounding dust until the next claim.
  No extra tax, staking, buybacks or holder rewards. Curve economics unchanged.
- **Changes:** Pure Rust module registered under `fees`; matching JavaScript
  helper; shared CSV fixtures; 21 JavaScript tests; Solana test/check wiring;
  integration specification and updated work-state record.
- **Verification:** The 21 focused JavaScript tests and JS syntax checks pass
  locally on Node 22.16.0. Original `fees.rs` blob matched
  `cc954d98c37caed36464db916a28c44e1058c52b`; its only existing-code edit is
  module registration. Actual delivery SHA and exact-head CI state belong in
  the chat handoff, not a recursive self-SHA commit.
- **Limits:** No Rust/Cargo/Anchor available locally; no full dependency checkout,
  full regression suite, SBF/IDL check, validator/devnet run, deployed program
  inspection, transaction submission or mainnet action in this milestone.

## Next owner/action

Review the foundation and exact-head CI, reconcile open revert PR #29, then
replace the rejected private-config route with tested permissionless migration.
Resolve precreated-pool/collision handling, permanent-lock custody and receipt
validation before wiring atomic claim -> base burn -> equal quote payouts.
The detailed required account checks and runtime tests are in the current design.
Additional taxes and holder distributions remain separate economic decisions.
