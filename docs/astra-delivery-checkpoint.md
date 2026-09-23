# Astra continuity checkpoint

Single rolling handoff. Architecture remains in [launchpad-build-spec.md](launchpad-build-spec.md)
and [meteora-adapter.md](meteora-adapter.md). Deployment/indexer setup is in
[launch-and-chart-rollout.md](launch-and-chart-rollout.md).

## Current handoff — launch and chart reliability

- **Scope/status:** The owner requested committing the implemented fixes on a new branch. Delivery branch: `codex/chart-launch-reliability`. Source/base: `71be092a487bb5fc8a5ff7c369039b0c29747f75`. Local checks pass; publication and exact-SHA CI inspection follow this record. Merge belongs to the owner.
- **Upstream reconciliation:** Main includes PR #21 plus photo uploads, mainnet-wallet precedence and executable-program checks. These changes are preserved. After the workspace restored an older fee-development checkout, the implementation was recovered into an isolated worktree based on current main; the separate uncommitted fee work was not modified.
- **Launch:** Both launch pages expose actual RPC cluster/program availability before uploads. Admin initialization includes FeePolicy and matches the Anchor client. Native SOL funding, rent, metadata levy, payer and signed simulation are checked before broadcast; `getLogs()` is captured. Public receipts precede sends and unresolved outcomes remain locked. `SOLANA_MAINNET_PRIVATE_KEY` still takes precedence over `KYDOS_DEPLOYER_KEY`.
- **Charts:** A finalized Kydos event decoder replaces generic swaps for curve history. It retains raw amounts, fees, trader and chain position; failed/foreign/rolled-back/incomplete events are rejected. A single reconciliation worker persists independent live/history cursors. Chart reads are separate from ingestion, with event deduplication and proper historical/live pages. Generic SOL/WSOL support stays isolated from canonical curve events.
- **UI:** Actual network, shared SOL/USD price basis, expiring FX, FDV, inventory progress, visible trade history, desktop trading panel, incremental candles and follow control. Quiet-market health reflects indexing, and the board includes zero-buy launches with explicit partial-coverage labeling.
- **Checks:** Locked dependency install passed. All 68 Solana JS tests plus Meteora SDK fixture parity passed. Lint, frontend build, Solana syntax, backend TypeScript transpilation, entity JSON, utility-script syntax and diff checks passed. No program/IDL/dependency changes; Rust/SBF/IDL builds and the previously failing full-app typecheck were not repeated.
- **Limits:** No deployment, funded transaction, Phantom extension/browser integration test or live Base44 execution. The local build lacks hosted app configuration. The user's absent executable program still blocks launches. Indexing needs the documented single worker and secrets before live data appears. Base44 lacks atomic uniqueness/leases; do not run concurrent ingestion workers. DAMM executable migration remains unfinished.

## Next owner/action

Publish this branch and inspect checks on its actual delivery SHA; report that SHA
in chat without recursive checkpoint commits. Owner reviews/merges, then deploys
the frontend, backend functions and entity schemas together. Establish a controlled
program address, matching IDL/binary and intended RPC cluster before a funded
launch. Configure one indexing worker and replay history using the rollout guide.
