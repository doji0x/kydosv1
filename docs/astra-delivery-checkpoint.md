# Astra continuity checkpoint

Single rolling human handoff. Machine-readable task routes and prior research
cursors remain in `astra-work-state.json`. This record is evidence, not authority
to resume unrelated work.

## Current handoff — RPC and configuration reconciliation

- **Scope/status:** Codex prepared the owner's requested RPC fixes for delivery on
  `codex/solana-rpc-fixes` and a PR targeting `main`. No deployment or funded
  transaction occurred.
- **Source/base:** `main` at `d9996c47e762fd2a83ec2494e2f3d63e2080778f`, fetched
  again before editing. Isolated branch: `codex/solana-rpc-fixes`, owned by
  Codex for this request. `astra/latest` was not modified or merged.
- **Decision:** owner explicitly confirmed 79.31% curve / 20.69% liquidity and
  30 virtual SOL on 2026-09-21. Preserve the current Rust program values. The
  existing 1B supply, 6 decimals and 85 SOL target remain unchanged.
- **Changes:** RPC allowlist now includes fee and rent queries; request IDs are
  preserved; public transaction confirmation uses HTTP polling. Client quotes
  now use the same effective reserves and buy inventory cap as the program.
  Displayed economics, current Solana documentation and tests are reconciled.
  Program identity tests check Rust, Anchor config, browser IDL and admin code.
  New RPC policy helper and transport tests are included in the Solana suite/CI
  path filter. The IDL import and incomplete test connection fixtures were
  corrected so the existing cost tests execute under Node.
- **Checks:** 25 JavaScript tests and syntax checks passed; frontend lint and
  production build passed. Build warned that the local Base44 app ID is absent.
  Typecheck reports 253 errors, the same count as unchanged source; no new
  diagnostic categories were found in the baseline comparison. Rust/Anchor tools are unavailable; no on-chain test or build
  pass is claimed. Final static diff review performed; independent review is
  pending via the requested PR.
- **Access:** GitHub branch creation succeeded on 2026-09-22 after the prior
  connector metadata errors. The remote branch was verified at the source SHA.
  GitHub delivery/PR identifiers and current CI state are reported in the final
  chat handoff after upload; earlier blocked-delivery claims are historical.

## Remaining limits and next action

Deliver the prepared branch through GitHub and open the PR targeting `main`;
report its actual SHA and checks. Review and merge remain separate from delivery. Do not reimplement these fixes or merge
the older `astra/latest` economics. Current program address consistency is not
proof of a deployed matching binary or ownership of its keypair. Localnet remains
the Anchor test target; the hosted UI uses the server-configured Helius endpoint.
Mainnet spending enforcement, deployment verification and external AMM graduation
remain separate unfinished work. Prior research/specification cursors in work
state are preserved and were not resumed.

Prior funded-test boundary remains: one funded test total, at most 0.05 SOL
including principal, rent and all fees. This code/PR request does not authorize
that test, deployments, upgrades, automatic replacement or additional spending.
