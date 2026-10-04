# Astra continuity checkpoint

## Current delivery: repaired atomic protected graduation

Continue PR #34 on **codex/atomic-protected-graduation**. Do not create another
branch. Repair source: `8755fb2214bd818267852a4597729dfbe2bd16e4`;
base: `c0038ce424bd4cc54af046d7b7f691b8d8b4aba4` (merged PR #33).
Design and outstanding operator request: [protected-migration.md](protected-migration.md).

The atomic migration now executes locally: tracked reserves -> protected DAMM
pool creation -> verified full permanent lock -> cleanup -> receipt. Retry and
concurrent execution cannot seed twice; replay works after a real pool swap.
This is not fee-settlement or deployment approval.

## Repairs

- Agave 2.1.21's CLI `none` test fixture produced `Some(default_pubkey)` rather
  than `None`. Both harnesses now use a distinct ephemeral DAMM authority and
  verify its actual loader bytes. Production authority validation was not relaxed.
- Split the oversized migration into bounded non-inlined SBF frames. The pinned
  compiler returned success despite stack-overwrite diagnostics. A tested CI
  gate now rejects those diagnostics; the repaired build has none.
- Synchronize both sides of direct Curve lamport transfers at the following CPI,
  fixing the executed `UnbalancedInstruction` error without changing budgets.
- Restore the exact original source newline convention. Regenerate the browser
  IDL from current-source Anchor IDL compilation; all old definitions remain.
- Remove temporary diagnostic workflow/tool packaging. Retain normal compiler
  and runtime logs in the Solana Anchor workflow.

## Verification

Local tools: Node 22.16.0, Agave 2.1.21, platform-tools v1.43, Rust 1.90.0.
Executed route cases: 14/14. Executed graduation cases: 29/29. Solana JS: 142/142
(including four build-diagnostic tests); confirmation harness: 6/6; Rust suites:
35 tests; app lint/build and five market tests pass. Current-source IDL generation
and browser comparison pass. Removing only the approved dispatch additions from
lib.rs gives original blob `be9d9f83440eb737ed5e55ef07fefd78993709ee` exactly.

Clean-fixture migration: 365748 CU, 26928240 setup lamports excluding network fees,
256 KiB requested heap. Largest signed packet tested: 1141/1232 bytes. These are
local measurements using synthetic genesis and pinned public DAMM bytecode, not
mainnet cost quotes or source/binary verification. Resulting commit and exact-head
CI state belong in PR/chat; do not reuse older green checks as new-head evidence.

## Next action and release limits

Review the repaired diff and exact-head CI. Actual mainnet configuration,
upgrade-authority control, cluster identity and deployed-source parity remain
release prerequisites. Last recorded scan found no matching config; no new
public observation or operator request was submitted by this repair. No mainnet
transaction, paid upgrade, installation, live migration, claim, burn or payout.
Fee settlement and frontend/keeper rollout remain separate work.
