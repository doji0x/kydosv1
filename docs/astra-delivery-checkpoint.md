# Astra continuity checkpoint

Single rolling handoff; design is in [launchpad-build-spec.md](launchpad-build-spec.md).

## Current handoff — Anchor/SBF dependency compatibility

- **Scope/status:** Owner approved the Anchor build repair on `codex/amm-graduation-foundation` for PR #17. GitHub access is restored. The lockfile, workflow and build documentation exactly match the locally verified repair `008e236842f703471df5d16d3fa69b1b21dc3990`; only these rolling handoff records are refreshed for delivery. Local checks pass; the resulting GitHub CI must be inspected after publication.
- **Source/base:** GitHub reverified branch `ed7779774795c78753b6f67969197b343a2a10ec` and PR #17 base/main `2316ac8e3d74a70a5ab5d154008adea757938c19`, including RPC PR #16. The delivery uses that branch tip as its parent; no force update is authorized.
- **Failure:** Source run `35687167604`, job `106616355756`, failed on `cpufeatures 0.3.1` requiring edition2024; an earlier run failed on `cmov`. Solana CLI 2.1.21 uses separate platform-tools v1.43 Rust/Cargo 1.79 despite host Rust 1.90.
- **Changes:** `solana/Cargo.lock` pins six compatible dependency roots and removes the incompatible transitive packages. `.github/workflows/solana-scaffold.yml` locks host tests and separates locked SBF and IDL commands, requires all three outputs, checks lockfile immutability and uploads explicit binary/IDL/types paths. `solana/README.md` records commands, pins and remaining SDK warnings. This checkpoint and work state are updated in place.
- **Checks on prepared tree:** Anchor 0.31.1 / Solana 2.1.21 SBF build passes using Rust 1.79.0-dev and Cargo 1.79.0. Locked IDL generation passes; program binary, IDL and TypeScript definitions are nonempty. Generated IDL address and initialize/buy/sell instruction names match expectations. Six workspace unit tests and three account-validation tests pass with `--locked`. Lockfile hash is unchanged after the full sequence. Workflow YAML and diff whitespace checks pass.
- **Warnings/limits:** Existing Anchor macro warnings remain. The official Solana release contains an empty syscall inventory; all 12 warned symbols were checked against registration in Agave 2.1.21 source. This is compile/host evidence only. No validator, token creation, real wallet signing, deployment or funded test occurred. Frontend checks from the prior milestone were not rerun for this Rust lockfile/CI repair.

## Exact next action

Publish this prepared tree using the restored GitHub connection, then inspect PR #17 checks on the resulting delivery SHA and report it in chat. Publishing is already authorized; merge and deployment are not. Preserve the original local repair commits when synchronizing the checkout. Reuse the existing local build evidence because the build files are unchanged. Do not add a recursive self-SHA/check-status commit.

The preceding atomic launch/metadata UI work remains in the source commit. AMM initialization, migration CPI/receipt, swaps, LP/fee policy, deployed program identity and legacy-account rollout remain subsequent work. Upload setup requires server `PINATA_JWT` and deployment approval for `launchMetadata`; see [setup/build instructions](../solana/README.md). Funded creation tests remain deferred until AMM/graduation is resolved. Prior library research is not resumed here.
