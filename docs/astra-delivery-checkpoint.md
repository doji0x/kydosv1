# Astra continuity checkpoint

Current design: [protected-migration.md](protected-migration.md).

## Current delivery - protected-route installation

- PR #32 merged at `63b2f51a6e2fb173326e9aa9c384ac2abf375e5a`.
  Continue only PR #33 on `codex/protected-route-installation` from that base.
- Installer source: `cc5e4c996a02a25a917de8b8d13924fb830d8c2f`.
  Compiler-IDL / runtime-fixture correction: `4d40883a06fdb4ccf35d993de1ca43bd43235b16`.
- Added actual `install_migration_route`, restricted to the current authenticated
  Kydos loader-v3 upgrade authority. One-time route binds config fingerprint,
  canonical program/ProgramData, DAMM deployment slot and fixed fee/lock policy.
  Added a reusable guard for future migration; no update, close or sweep.
- Existing program ID, initialize/buy/sell, Curve/FeePolicy layouts, original
  instruction definitions/errors, curve math, 793.1M/206.9M allocation and
  settlement arithmetic are preserved. New IDL entries are additive.
- Four new Rust host tests compiled/passed and the SBF build/IDL generation
  succeeded in Anchor run 37157451897. Original full runtime attempt found an
  invalid negative-test fixture: its unknown `permission` property was ignored
  by the pinned coder. Corrected actual encoded permission bytes at offset 248.
  Program validation was not weakened. Fourteen executed cases are now required.
- Downloaded compiler artifact 11286800097 from that run, normalized the generated
  type helper and compared every old IDL entry. Checked-in IDL blob:
  `df514227a2853d4810e5588291161509492d92e5`; SHA256:
  `4550206550e25eb408f11af711eb0bd6841a46cd2d5b9b0506703c7d38363776`.
  The strict fresh-build IDL comparison is still enabled.
- Corrected-head runtime/build/IDL checks require fresh CI. Inspect final delivery
  checks rather than treating the original build or synthetic fixtures as a full
  runtime pass. Local environment has Node but no Rust/Anchor/validator toolchain.

## Mainnet observation now resolved

Read-only run 37156192684, job 111299944380, 2026-10-03T21:45Z, observed declared
Kydos program executable and upgradeable at slot 453058242. Deployment slot:
450014937. ProgramData: `HkAvMhKsTaB99iniJ9vqpZJ86Nm2Csu5Mm63tU2VwVQk`.
Recorded upgrade authority: `6AK3h1s6byYRaDjNue8rMV1nqu8Q94AawPVVwNk7Phqc`.
Creator PDA: `3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd`.
No protected config candidate was found by that pinned-layout scan.
This is observation, NOT proof of signer control, source/binary parity,
independent genesis pinning, or release readiness. Never hardcode the observed
wallet as a substitute for the installer's current loader-state validation.

## Next action / limits

Review corrected-head runtime tests and IDL matching in draft PR #33. Obtain and
independently verify an authorized Meteora configuration before any live install.
Then implement complete atomic migration, full post-CPI validation, 100% initial
liquidity lock and successful receipt/replay. Real migration remains unfinished.
No mainnet route install, operator request submission, migration, pool, lock,
receipt, claim, burn, payout, paid transaction or deployment was performed.
A changed DAMM deployment/config must fail the future fresh-migration guard;
route-version recovery requires separate review, not a generic reset function.
Resulting delivery SHA and fresh CI belong in chat/PR, not a recursive self-SHA.
