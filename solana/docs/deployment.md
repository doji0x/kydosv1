# Kydos mainnet program deployment

Run from the **repository root**. These commands deploy the launchpad program only; they do not launch a token. They cannot be run in the Base44 app preview: use a local checkout with the Solana toolchain. The keypair and `.program-id` stamp stay on your machine and are gitignored.

## Prerequisites

| Requirement | Check |
| --- | --- |
| Node.js 20+, repository dependencies | `npm ci --ignore-scripts` |
| Solana CLI 2.1.21 | `solana --version` |
| Anchor CLI 0.31.1 | `anchor --version` |
| Host Rust 1.90.0 | `rustc --version` |
| Deployment payer | `solana address` and `solana balance --url "$HELIUS_RPC_URL"` — fund this **local CLI wallet** for program rent and fees; it is separate from the program keypair and the app's admin-launch wallet. |
| Mainnet HTTP RPC | Export `HELIUS_RPC_URL` locally (HTTPS); do not commit the URL or any API key. `solana genesis-hash --url "$HELIUS_RPC_URL"` must equal `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. |

Review the launchpad source, audit status, and deployment budget before spending funds. The deploy script checks mainnet genesis and source identity, but does not validate program safety or prove the on-chain binary matches a reviewed build. Never use a funding wallet's key as the program ID keypair.

## 1. Generate and back up the program keypair

```sh
node solana/scripts/deploy/01-generate-keypair.mjs
```

This creates `solana/target/deploy/kydos_launchpad-keypair.json` and `solana/.program-id`. **Back up the keypair securely and offline before proceeding.** Do not commit, share, paste into chat, or replace it after deployment. The script refuses to overwrite either file. Its printed public key is the new program ID; use it below. Retain a separate, protected upgrade authority wallet (the CLI payer is the default upgrade authority for `solana program deploy`). Losing the program keypair prevents safely reproducing this deployment command; losing upgrade authority prevents future upgrades.

## 2. Propagate the program ID

```sh
node solana/scripts/deploy/02-update-program-id.mjs YOUR_PRINTED_PROGRAM_ID
```

The script refuses an ID that does not match both the keypair and the stamp. It updates `declare_id!` in Rust, the Anchor localnet program mapping, and `base44/shared/solanaProtocol.js`. The admin launch function imports that shared address; its `PROGRAM_ID` is constructed from it, not hardcoded. The Anchor provider remains localnet for development tests; the deploy command explicitly selects mainnet.

**Manual checklist before deployment:**

- [ ] From `solana/`, regenerate and sync the browser IDL:

  ```sh
  cd solana
  anchor idl build --program-name kydos_launchpad --out target/idl/kydos_launchpad.json --out-ts target/types/kydos_launchpad.ts -- --locked
  node scripts/sync-idl.mjs
  node scripts/sync-idl.mjs --check
  cd ..
  ```

- [ ] Check `src/lib/solana/idl/kydos_launchpad.json` has the new address; check `base44/functions/adminLaunchToken/entry.ts` still imports `PROGRAM_ADDRESS` from the shared module. Never change the admin launch **wallet** secret to the program keypair.
- [ ] Run `npm --prefix solana test` and review the changed source/IDL before committing. Do not commit `target/` or `.program-id`.

## 3. Deploy on mainnet

```sh
# HELIUS_RPC_URL must already be exported locally; your CLI wallet must be funded.
node solana/scripts/deploy/03-deploy-mainnet.mjs
```

The script checks the keypair, all program ID sources including the synced IDL, and mainnet genesis **before** building. It then runs the locked Anchor SBF build, confirms a nonempty `.so`, and uses `solana program deploy` with the generated keypair and explicit RPC URL. It streams deployment output and fails nonzero if the command fails. If the command's outcome is uncertain, check the program account **before rerunning**, as a retry against an already-deployed ID can attempt an upgrade and incur costs.

## 4. Verify and publish

- [ ] `solana program show YOUR_PRINTED_PROGRAM_ID --url "$HELIUS_RPC_URL"` reports the correct program and upgrade authority. Check the address on [Solscan](https://solscan.io/) (mainnet). Appearance on an explorer alone is not proof of source-code parity.
- [ ] Check the executable flag through the RPC: from `solana/`, run `HELIUS_RPC_URL="$HELIUS_RPC_URL" node scripts/check-deployment.mjs`. It checks the Kydos and metadata program accounts and reports whether the Kydos program is executable (not whether its binary matches source).
- [ ] Commit the changed Rust/config/shared ID and synchronized browser IDL, then publish the updated app **and** the admin-launch backend function using the same release. Its `status` action performs a deployment/funding readiness check; open the Admin Launch page and refresh status before creating tokens. Keep `HELIUS_RPC_URL` set to the same mainnet RPC in the app's server secrets, and separately fund `SOLANA_MAINNET_PRIVATE_KEY` for launches.
- [ ] Retain encrypted offline backups of the program keypair and upgrade authority credentials; restrict access to both. Do not treat the `.program-id` stamp as a key backup.