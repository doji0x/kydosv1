# Astra continuity checkpoint

Current delivery: [protected-migration.md](protected-migration.md).
Fee policy: [fee-settlement.md](fee-settlement.md).

## Protected migration phases 1-3 - in progress

- **Approval:** Owner approved the protected-config plan after explicitly keeping
  Kydos's existing creation and curve. No DBC, new program ID or paid deployment.
- **Branch/base:** `codex/kydos-protected-migration-phases-1-3`, based on inspected
  main `3cce2ed02ac94d3951db33b3a67725182d8d7597`. PR #31 is already merged.
- **Delivered so far:** Read-only deployment/config evidence helpers and CLI;
  exact-baseline source/IDL compatibility guard; 39 focused tests; Solana script
  wiring; read-only CI observations; this updated checkpoint/design.
- **Preserved:** Existing program, 793.1M/206.9M, metadata/authority setup, curve
  math, buy/sell instructions, account layouts, treasury and settlement helpers.
- **Verification:** Focused dependency-free tests: 39/39 on Node 22.16.0. New
  JavaScript syntax checked. Exact-head CI and RPC observation must be inspected
  separately. No local Rust/Cargo/Anchor or full network dependency checkout.
- **Not delivered:** On-chain route installation, executable migration, lock,
  receipt, actual fee claims, burns, payouts, runtime SVM tests or deployment.
  No live config or upgrade-authority control has yet been verified.

## Next owner/action

Inspect exact-head CI and read-only mainnet/devnet observations. Establish the
owner's actual deployed program/cluster and authority arrangement without
assuming source ID equals paid deployment. Verify a protected config candidate
or obtain authorized Meteora provisioning. Then continue approved phase 2 route
binding and phase 3 atomic migration with runtime tests; never substitute a
partial fund-moving handler or declare synthetic fixtures to be live evidence.

The config-based creator restriction protects the destination while migration
remains publicly triggerable. Dynamic configuration is not a dynamic trading
fee. No pair-only fallback or DBC conversion is authorized. The resulting SHA,
CI and concrete observation outcomes belong in the final chat/PR handoff.
