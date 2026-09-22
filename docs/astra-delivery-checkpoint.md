# Astra continuity checkpoint

Single rolling handoff; detailed design is in [launchpad-build-spec.md](launchpad-build-spec.md).

## Current handoff — AMM and graduation foundation

- **Scope/status:** Approved small milestone implemented on `codex/amm-graduation-foundation`, for PR review against `main`. No deployment, funded transaction, validator or token-creation test.
- **Source/base:** `2316ac8e3d74a70a5ab5d154008adea757938c19`. PR #16 RPC fixes are now merged; this branch includes them. Codex owns this isolated branch. `astra/latest` was not modified.
- **Decisions:** Preserve 79.31% curve / 20.69% liquidity, 1B supply, 6 decimals, 30 virtual SOL. Use 1.073B initial virtual tokens and inventory exhaustion for completion (~85.005359057 SOL from an untouched curve). Final buy charges rounded-up remaining-inventory cost; excess SOL stays in wallet. Completed curves stop trading awaiting migration.
- **Changes:** Shared Rust/JS quote vectors and integer math; strict economics/legacy-account rejection; client completion state; compiling AMM serialization/PDA/interface crate without executable handlers or program ID; build specification; CI host checks; direct BN import for Node 20 compatibility; dependency locks and reconciled documentation.
- **Checks on prepared delivery tree:** 25 JavaScript tests, six Rust workspace unit tests and three Rust account-validation tests pass. Frontend lint/build and diff whitespace checks pass. Build retains missing local app ID and bundle-size warnings; Anchor macros emit upstream cfg/deprecation warnings. No local SBF build or validator pass is claimed. Delivery commit and CI observations will be reported in chat; do not infer them from this pre-upload checkpoint.

## Remaining limits and next action

Review the PR. Subsequent work must establish verified program identities, LP custody/burn/lock and fee policy, then implement constrained pool initialization, migration CPI/receipt, swaps and indexing. The new AMM crate cannot yet move assets or run on-chain. Existing curve configurations must not be silently repriced: inventory deployed accounts and choose an explicit compatibility/rollout plan before any upgrade. Token-creation tests remain deferred at the owner's request; their old assertions need refresh when resumed. Host tests do not prove deployment readiness. Prior library research cursors remain incomplete and are not resumed by this milestone.
