# Astra continuity checkpoint

Single rolling handoff; architecture is in [launchpad-build-spec.md](launchpad-build-spec.md)
and [meteora-adapter.md](meteora-adapter.md). Launch setup and diagnosis are in
[the Solana README](../solana/README.md#launch-form-and-public-metadata).

## Current handoff — Phantom launch funding and preflight

- **Scope/status:** Reviewed the reported debit/unfunded-account failure and fixed the Phantom launch path on `codex/launch-funding-preflight`. The owner requested a commit on a new branch. Changes are locally verified; publication and exact-SHA CI inspection follow. The actual failed wallet transaction was not supplied, so its cause is not claimed as confirmed.
- **Source/base:** `bf3da2756fd48918d37defd31e030c7b647a0afe`, the verified merge of PR #20. Its tree matches adapter delivery `d5a4daf4863dd9d0789d3ee0a2566374561e2e9e`. No intervening main changes were found when this task began.
- **Implementation:** Creation estimates include Metaplex's separate rent-derived levy (`rent(1308) + 5440` lamports). Review displays native SOL balance, verified network and metadata fee. The complete legacy launch message is simulated on the submission RPC before Phantom, without changing its blockhash or requesting a wallet signature. The authenticated proxy permits this read-only method. Wallet errors identify the actual payer/network; Phantom payer/account checks also run after approval.
- **Signing/recovery:** Creation remains one atomic transaction with mint plus wallet signatures. Missing signatures, changed message/account/network, failed simulation and inadequate balance stop before broadcast. Signature verification and send-time preflight remain required; ambiguous submissions retain the existing recovery lock. No automatic replacement transaction or network switch is introduced.
- **Files:** Client costs, signing/preflight, wallet context, review, launch UI/stage and RPC allowlist; three regression test files and these records. Exact list in `astra-work-state.json`. No program, IDL, dependencies or admin server-wallet launcher changes.
- **Checks:** All 51 Solana JS tests and SDK fixture checks pass; 25 directly affected tests pass. Lint, frontend build, Solana syntax checks, new-module type/syntax checks and diff checks pass. Full app typecheck and Rust/SBF/IDL builds were not repeated for this client-only change; the prior milestone recorded existing app typecheck errors.
- **Live read-only evidence:** Mainnet simulation with a generated unfunded payer returned `AccountNotFound`, empty logs and zero units at slot 449384837. No transaction was submitted. Configured Kydos address `Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2` returned no account on mainnet slot 449384808 and devnet slot 502433751 (2026-09-22). This blocks live creation with the checked-in identity independently of the wallet fixes.
- **Limits:** No real Phantom extension execution, funded launch, backend/frontend deployment or merge. Hosted app/runtime secrets and the user's failing wallet/network were not inspected. Local frontend build has no live Base44 app configuration. The separate admin launch route signs with a server wallet and needs its own review if that was the failing route.

## Exact next action

Commit/publish this verified tree on the requested new branch, inspect exact-SHA
checks and report the delivery SHA. Deploy the updated frontend and `solanaRpc`
allowlist together when rollout is authorized. Establish the actual deployed
Kydos program ID/network and bind verified program/client artifacts before a
funded launch. Obtain the failing page, public wallet/network or simulation logs
to tie the reported error to the hosted app. Merge remains with the owner.

DAMM v2 executable migration remains separate unfinished work: verified Kydos
identity, operator-provisioned private config and custody/locking decision are
still required. The merged adapter has no callable migration or WSOL staging.
