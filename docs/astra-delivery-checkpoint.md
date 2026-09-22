# Astra continuity checkpoint

Single rolling handoff; design is in [launchpad-build-spec.md](launchpad-build-spec.md)
and [meteora-adapter.md](meteora-adapter.md).

## Current handoff — DAMM v2 adapter foundation

- **Scope/status:** Milestone 2 after the migration research: compatible Meteora interface, strict private-config validation, deterministic custody addresses, integer seed calculations and proposed receipt schema. Locally verified on `codex/damm-v2-adapter`; publication and exact-SHA CI inspection follow. No executable migration or changes to current trading behavior.
- **Source/base:** PR #19 merged as `9eb9da645fd65bb99db941e6d31039c0bfc4dc38`. Both fee-delivery CI checks passed on `17757bac5a8c359a36af8fcf95c69faff79152aa`; main has the same tree. This task starts a separate branch from that merge.
- **Implementation:** Launchpad `meteora.rs` constructs the 21-account / 107-byte private dynamic config initializer with fixed 100-bps fees, OnlyB, full range, immediate timestamp activation and no dynamic fees/compounding/AlphaVault. Rust and JS constrain the config's owner, address, discriminator, length, creator, type, index and permissions. Separate system payer, position owner, NFT mint, staging and receipt PDAs preserve program custody.
- **Math/schema:** Exact integer positive-root calculation, bounded liquidity and ceil debit amounts, explicit dust. Preflight uses the reserved 206.9M tokens and actual tracked net SOL, excludes donations/virtual SOL, preserves rent and rejects incomplete/unsupported/deficient curves. Proposed receipt body is 347 bytes (355 with a future discriminator); it is not initialized or exposed by current instructions.
- **Pins/files:** Official SDK 1.4.10 / IDL 0.2.4 as test-only dependencies; pinned source commits and operator setup in the adapter contract. New Rust/JS adapter modules, SDK fixture generator, shared fixtures and host tests; manifests, CI, build spec and README updated. Exact changed-file list is in `astra-work-state.json`. Existing npm resolutions and Rust crate versions preserved.
- **Checks:** 45 JS tests; 20 Rust tests; 12 SDK seed vectors including dust and two complete config/address/instruction fixtures. New module typecheck, syntax, lint, frontend build, locked SBF and IDL generation, generated-IDL comparison, new-file rustfmt, YAML/JSON and diff checks pass. App typecheck still fails with 138 diagnostics identical to main using the same installed dependencies. IDL unchanged; artifact hashes/commands in work state.
- **Limits:** Host serialization/parity does not prove runtime migration or idempotency. No validator/creation test, real signing, funded transaction, deployment or merge. Existing Anchor/Solana SDK warnings remain. The future handler's compute/heap budget, rollback, concurrent calls, deployed executable parity, locking and claims still need runtime verification.

## Exact next action

Publish the prepared tree on `codex/damm-v2-adapter`, open the PR to main, inspect
its checks and report the resulting commit SHA in chat. Do not create a recursive
commit to write this checkpoint's own SHA. Merge and deployment remain with the owner.

Next is executable DAMM migration. First establish the final Kydos program ID,
have a Meteora operator provision the private dynamic config for its
`[meteora_pool_creator]` signer, and bind that config in the launchpad route.
No approved/verified config is recorded yet. Resolve program custody versus a
permanent lock; no irreversible policy is selected here. Then implement atomic
staging/SyncNative, CPI, post-state validation, the approved lock, receipt/retry
enforcement, fixed-destination dust/refunds and treasury fee claims. Funded
creation remains deferred until migration/graduation is ready.
