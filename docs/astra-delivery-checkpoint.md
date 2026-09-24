# Astra continuity checkpoint

Design and operator runbook: [meteora-adapter.md](meteora-adapter.md#milestone-2-private-config-setup-and-approval-preflight).
Broader architecture: [launchpad-build-spec.md](launchpad-build-spec.md).

## Current handoff — Milestone 2 private-config setup

- **Scope/status:** Owner requested Milestone 2. Setup toolkit prepared on
  `codex/damm-v2-milestone-2`; live provisioning and approved binding remain open.
- **Source/base:** Main `d4779592d9efe31911f53d02edd26e2073a6f644`, merge of
  PR #27. Both CI and Solana Anchor passed on its delivered head
  `d6ad1d81fc3ed719506bada5971e708d7a83b6fe` (runs `36005497771`, `36005497853`).
- **Changes:** Public operator request; offline request generator; read-only
  discovery, finalized config verification and approved-route preflight; separate
  null mainnet/devnet registry entries; seven rejection/verification tests wired
  into the Solana suite; Codespaces/operator runbook.
- **Decisions:** Use the release program's creator PDA
  `3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd`, private dynamic config and
  permission zero. Operator chooses an unused index. Discovery/candidate validity
  never implies approval. A reviewed binding pins cluster, genesis, program IDs,
  creator authority, index, config address and config-data SHA-256.
- **Evidence:** `npm --prefix solana test` passes 76/76, including seven new
  setup tests; syntax checks and `git diff --check` pass. Live mainnet discovery
  at finalized slot `450045280` returned no matching private configs.
- **Limits:** No config creation, wallet signing, transaction submission,
  program deployment, executable migration, pool, lock or fee claim. The JSON
  registry is a review/preflight input, not on-chain authorization. The later
  handler must enforce the approved config address on-chain. Executable flags
  do not prove binary/source parity. Corrected IDL from Milestone 1 is unchanged.

## Next owner/action

Review the setup PR. Share `solana/config/meteora-mainnet-request.json` with a
Meteora operator authorized for `CreateConfigKey`. Obtain the chosen index,
config address and finalized creation signature; run the independent verifier,
review and commit the cluster binding, then pass the approved-route preflight.
Only then is the private-config prerequisite complete. Keep utility deferred.
