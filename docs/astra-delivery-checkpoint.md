# Astra continuity checkpoint

Single rolling handoff; detailed design is in [launchpad-build-spec.md](launchpad-build-spec.md).

## Current handoff — atomic launch and metadata UI

- **Scope/status:** Approved follow-up implemented on `codex/amm-graduation-foundation`, extending PR #17 with three focused commits: atomic optional creator buy, image/metadata uploads, and launch review UI. No merge, deployment, funded transaction, validator or on-chain token-creation test.
- **Source/base:** Branch source `d1a2822ab4dc3acdfd6bf12e1924da4de986e521`; main `2316ac8e3d74a70a5ab5d154008adea757938c19`. PR #16 RPC fixes are merged and included. Codex owns this branch; `astra/latest` was not modified.
- **Decisions:** Preserve 79.31% curve / 20.69% liquidity, 1B supply, 6 decimals, 30 virtual SOL, 1.073B initial virtual tokens and inventory-based completion. Initial buy defaults to 0 SOL. Positive buy uses initialize, creator ATA and buy in one transaction with one Phantom request; mint secret remains in memory. No Pump SDK/program call.
- **Changed files:** Client/cost/review helpers and mocked tests; authenticated `launchMetadata` Base44 function and shared/client upload helpers; `useLaunchFlow`, `LaunchForm`, launch page and wallet/activity components; prop annotations for four reused UI primitives; test scripts/CI paths and setup/design/continuity docs.
- **Behavior:** Server-only Pinata JWT; short-lived size/MIME-restricted image upload URL; server-generated public IPFS metadata; advanced manual URI retained. Review displays verified network, rent, fees, buy/minimum output, and blocks increased costs or unavailable programs before signing. Uploads occur before the atomic transaction. Rejection preserves form/upload cache; unresolved sends retain the existing journal lock. Desktop/mobile mock UI checks cover rejection, retry and single submission.
- **Checks on prepared delivery tree:** 35 JavaScript tests pass on Node 20.20.2; frontend lint/build, syntax and diff-whitespace checks pass. Browser flow passes with mocked Phantom/RPC/Pinata only; no real signing, broadcasts or uploads. Full frontend typecheck still fails on existing repository errors; added launch modules have no reported errors. Build retains app-ID, browser-data and bundle-size warnings.
- **CI inspected at source SHA:** General CI passed. Solana Anchor run `35684628863`, job `106608716975`, passed JS and nine host Rust tests, then failed SBF build: `cmov 0.5.4` requires Cargo edition2024 support, unavailable in Solana 2.1.21's embedded Cargo 1.79. Rust/toolchain files are unchanged by this follow-up. Final delivery SHA and new CI state belong in chat, not a recursive checkpoint commit.

## Remaining limits and next action

Review PR #17. To enable uploads after deployment approval, configure server secret `PINATA_JWT` and deploy `launchMetadata`; see [setup](../solana/README.md#launch-form-and-public-metadata). Deployed Base44 secrets/functions and the program binary were not verified. The 600,000-CU limit is an unmeasured ceiling; executable-program checks do not prove source/deployment equivalence.

Resolve the SBF dependency/compiler mismatch before claiming an on-chain build. AMM initialization, migration CPI/receipt, swaps, LP custody/fee policy, verified identities and indexing remain subsequent work; the AMM crate is still interface-only. Inventory legacy accounts and choose an explicit compatibility plan before upgrades. Funded Phantom/token-creation testing remains deferred until AMM/graduation is resolved. Prior library research cursors remain incomplete and are not resumed here.
