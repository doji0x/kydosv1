# Astra continuity checkpoint

Current design: [permissionless-migration.md](permissionless-migration.md).
Fee policy: [fee-settlement.md](fee-settlement.md).

## Current handoff - permissionless DAMM adapter (milestone 3A)

- **Scope/status:** Config-free creation and full permanent-lock CPI preparation
  on `codex/permissionless-damm-adapter`. No executable migration or fund movement.
  Fresh-account checks intentionally reject occupied destinations.
- **Source:** `b5e03c9a64d5f3256734aee6cb88eb630de094aa`, merged PR #30, whose
  delivered head was `e5618e713957756b6b7d0c15c91f438e6ce89c2e`.
  Delivery base: `ed992423cb32a9b6a3ac1289a472ba3d49e1b1d4`; its disjoint
  application changes are preserved, not audited or rewritten by this task.
  PR #29's revert remains intact. Do not repeat operator setup or PR reconciliation.
- **Policy:** Fixed 1% BothToken; original SPL coin/WSOL; program-owned position
  NFT; full initial liquidity lock instruction. PR #30's base burn and equal
  creator/Kydos net quote allocation remains unchanged. No added holder tax.
- **Changes:** New `meteora::permissionless` module, two-direction vectors, nine
  JS fixture/SDK tests, six Rust tests, test wiring and design. Existing adapter
  changes only by module registration. Private-route fixtures remain regression
  evidence, not an enabled migration route. Instruction/account ABI is unchanged.
- **Verification:** Four selected dependency-free fixture checks and JS syntax
  passed locally on Node 22.16.0. Exact JS/fixture blobs are recorded in the design.
  Original adapter blob was checked before its two-line addition. SDK parity,
  Rust, SBF/IDL and full regression results require exact delivery-head CI.
- **Limits/blocker:** No local Rust/Anchor or dependency checkout; no validator,
  devnet, signing, migration, receipt, executed lock, claim, burn or payout.
  The pair-only `cpool` address can be occupied before Kydos graduates. Rejection
  protects custody but does not guarantee graduation. Public runtime activation
  stays gated on a reviewed, tested precreation/recovery design.

## Next owner/action

Review the adapter and exact-head CI. Resolve pool precreation without adopting
untrusted state, then implement authenticated atomic staging/migration, complete
post-CPI validation, permanent lock and a route-versioned receipt with replay
protection. Fee settlement integration follows runtime migration tests. No supply
change, operator provisioning or reward allocation is authorized by this handoff.
Delivery SHA and CI state belong in the final chat/PR handoff, not a recursive
commit containing this checkpoint's own SHA.
