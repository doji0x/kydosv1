# Astra continuity checkpoint

Current scope: protected-route installation, a partial delivery of the approved
phases 1-3. Existing design: [protected-migration.md](protected-migration.md).

## Current handoff

- PR #32 is merged at `63b2f51a6e2fb173326e9aa9c384ac2abf375e5a`.
  Work continues on separate `codex/protected-route-installation` from that base.
- Added one-time `install_migration_route` authorized by the runtime Kydos
  loader-v3 upgrade authority, authenticated config/PDA/fingerprint binding,
  DAMM ProgramData/deployment-slot binding, fixed fee/lock/settlement policy,
  and a reusable future-route validator. No update, close, sweep or migrate.
- Existing initialize/buy/sell, account layouts, supply allocation, curve math,
  authorities and settlement arithmetic stay unchanged. lib.rs adds only the
  allowed module/import and thin installation dispatcher.
- Added four Rust host tests and a loopback-only built-program installation test.
  The runtime harness covers unauthorized installs, substituted accounts,
  prefunded PDA, transaction rollback and reinstallation. Synthetic test configs
  are NOT evidence of Meteora operator provisioning or live route installation.
- No Rust/Anchor toolchain locally. Runtime and build tests must be run by CI.
  Generated browser IDL must be committed and the existing strict match check
  must pass. The workflow reports generated additions without changing that gate.

## Newly retrieved chain evidence

Mainnet observation run 37156192684, job 111299944380, dated 2026-10-03T21:45Z:
Kydos at the declared program ID WAS observed, executable and upgradeable.
ProgramData: `HkAvMhKsTaB99iniJ9vqpZJ86Nm2Csu5Mm63tU2VwVQk`.
Upgrade authority: `6AK3h1s6byYRaDjNue8rMV1nqu8Q94AawPVVwNk7Phqc`.
Deployment slot: 450014937; observation slot: 453058242.
Pool-creator PDA: `3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd`.
No valid private config candidate was found in the scanned pinned layout.
This resolves the previous inaccessible-mainnet-log uncertainty, NOT signer
control, source/binary parity, independent genesis pinning or release readiness.
Do not hardcode the observed authority as a substitute for current loader state.

## Remaining work / next action

Inspect this branch's exact-head CI, fix build/runtime/IDL failures, and review
route installation. A DAMM upgrade or changed config intentionally blocks fresh
migration until a separately reviewed version; no arbitrary reset is exposed.
Then complete the approved atomic migration and runtime acceptance tests.
No actual config provision, live route install, reserve migration, pool/lock,
receipt, fee claim, burn, payout, mainnet transaction or deployment is delivered.
The resulting SHA and passing/pending checks belong in the chat/PR handoff.
