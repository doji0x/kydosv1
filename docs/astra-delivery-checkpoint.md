# Astra continuity checkpoint

Architecture remains in [launchpad-build-spec.md](launchpad-build-spec.md) and
[meteora-adapter.md](meteora-adapter.md). Launch/indexer rollout remains in
[launch-and-chart-rollout.md](launch-and-chart-rollout.md).

## Current handoff — DAMM v2 fee and migration policy

- **Scope/status:** Owner approved Milestone 1 only: fix the DAMM v2 fee,
  collection, custody and migration policy without adding executable migration
  or utility. PR #27 remains open on `codex/damm-v2-milestone-1`.
  Pre-merge review fixed its browser-IDL check: only the final newline was absent.
- **Source/base:** Main `7c28478921248489a1d9c9cb4322fdede643d3a8`.
- **Decisions:** Curve fee remains 100 bps. DAMM uses a 100 bps fixed fee and
  `BothToken`; Meteora's current 20% protocol share leaves an expected 80 bps
  Kydos share. There is no extra migration fee. The complete initial position
  must be permanently locked. Claims go only to fixed Kydos treasury token
  accounts. Burns, splits, rewards, buybacks and all utility remain deferred.
- **Changes:** SDK-parity initialization and regenerated fixtures now encode
  `BothToken`; Rust/browser policy constants and tests pin the approved policy.
  The migration contract documents atomic staging, WSOL funding, DAMM CPI,
  post-validation, permanent lock, receipt finalization, replay protection,
  fixed fee claims and delivery gates.
- **IDL review:** On delivery `c2d0e27257744df721e86861ec905a748cb3b600`,
  Anchor CI run `36002097799` passed Rust tests, SBF build and IDL generation,
  then failed byte-for-byte browser IDL comparison. Reproduced with Anchor
  IDL builder 0.1.2 (used by CLI 0.31.1), locked program dependencies and nightly
  Rust 1.100.0 (2026-09-24). Generated and browser JSON were structurally equal;
  synchronization adds exactly one trailing newline, with no interface changes.
- **Evidence:** `npm --prefix solana test` passes 69/69; fixture generation checks
  SDK 1.4.10, 12 seed vectors and two account/instruction cases; JavaScript syntax
  checks and root lint pass; `git diff --check` passes.
- **Limits:** No executable migration, private config, validator/devnet run,
  funded transaction, pool, lock or claim. Rust parity tests were not run in this
  original environment; the cited CI run supplies that evidence. The corrected
  browser IDL passes local `sync-idl.mjs --check`; new exact-SHA CI is pending.

## Next owner/action

Wait for corrected-head Anchor CI to pass before merging Milestone 1. Next, provision and bind the private Meteora dynamic
config before implementing the executable atomic migration handler. Do not add
utility behavior to this milestone.
