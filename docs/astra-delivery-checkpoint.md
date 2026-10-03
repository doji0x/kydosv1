# Astra continuity checkpoint

Current delivery: [protected-migration.md](protected-migration.md).
Fee policy: [fee-settlement.md](fee-settlement.md).

## Protected migration phases 1-3 - partial delivery

- **Approval:** Owner approved the protected-config plan after explicitly keeping
  Kydos's existing creation and curve. No DBC, new program ID or paid deployment.
- **Branch/base:** `codex/kydos-protected-migration-phases-1-3`, based on inspected
  main `3cce2ed02ac94d3951db33b3a67725182d8d7597`. Draft PR #32.
- **Delivered:** Read-only deployment/config evidence helpers and CLI; exact
  baseline source/IDL compatibility guard; 39 focused tests; Solana test wiring;
  read-only CI observations and visible evidence summaries. No fund-moving code.
- **Preserved:** Existing program, 793.1M/206.9M, metadata/authority setup, curve
  math, buy/sell instructions, account layouts, treasury and settlement helpers.
- **Verification:** Focused tests passed 39/39 locally. For initial delivery
  `6e788dce0e9d0488a3002d9f67f1f499cc8eca07`, compatibility/evidence CI run
  37156192684 and application CI run 37156192659 passed. Anchor run 37156192645
  was still in progress at the last check; later-head results are separate.
- **Observed chain evidence:** Devnet report from run 37156192684, job
  111299944390, observed genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
  At finalized slot 507138253 the declared Kydos program was not found; DAMM was
  observed. The strict config scan for the derived authority returned no valid
  candidate. This says nothing about a different paid program ID or mainnet.
  Mainnet report was produced but its logs were not yet accessible for review.
- **Not delivered:** On-chain route installation, executable migration, lock,
  receipt, actual fee claims, burns, payouts, runtime SVM tests or deployment.
  No live config or upgrade-authority control has been verified for Kydos.

## Next owner/action

Read exact-head CI/evidence summaries and resolve the funded deployment's actual
program ID, network and authority. Inspect a real protected config or obtain
Meteora operator provisioning; public keys/config files are not permission.
Continue approved phase 2 route binding and phase 3 atomic migration with runtime
tests, without overriding the existing curve or inventing deployment evidence.

No local Rust/Cargo/Anchor or network repository checkout is available. Reuse
completed helpers/tests rather than restart them. Complete the already approved
work on this branch; do not merge it as a completed migration. Resulting SHA and
fresh check state belong in the final chat/PR handoff, not a recursive commit.
