# Astra continuity checkpoint

Single rolling handoff; design is in [launchpad-build-spec.md](launchpad-build-spec.md).

## Current handoff — curve treasury fees

- **Scope/status:** First repository milestone after the DAMM v2 research: 1% bonding-curve trading fees, all to `5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg`, including initial creator buys. Implemented and locally verified on `codex/curve-treasury-fees`; publication and exact-SHA CI inspection follow. No creator split, deployment or funded test.
- **Source/base:** PR #17 is merged. Main reverified at `b5c76cd9500ed368a82395eb5a8f2fb83f241a14`. This is a separate branch from that tip.
- **Program:** New immutable 76-byte `[fee_policy, curve]` PDA holds version 1, 100 bps and the fixed treasury. Trades constrain policy owner/seeds/bump/source/version/rate and treasury address/owner. Buy inputs include fees; sell minimums protect net SOL. Ceil-to-lamport fees go directly to treasury, outside curve reserves. Final fills charge only the accepted gross; Curve's 397-byte layout and inventory-driven completion remain. New fee event preserves the old trade event's reserve-movement meaning.
- **Client/UI:** Fee-aware quotes and policy decoding; fixed account wiring; FeePolicy rent in cost review without double-counting the fee; fee and net purchase/output shown. Failed policy/reserve refresh blocks trading. Initial create-and-buy remains one transaction and fits with maximum valid text. Generated browser IDL now includes accounts/events and is checked against the compiled interface in CI.
- **Checks:** 40 JavaScript tests; 10 Rust workspace unit tests; 5 host account tests, including treasury substitution and net sell slippage rejection. Syntax, lint, frontend build, locked SBF build, locked IDL/types generation, generated-IDL comparison, YAML and diff checks pass. Typecheck retains 160 existing diagnostics versus 162 on the same-dependency main baseline; no added file/error-code diagnostics. `Cargo.lock` unchanged. Artifact sizes/hashes and commands are in the work state.
- **Limits:** Existing Anchor macro and Solana SDK syscall-inventory warnings remain. No validator/creation test, actual wallet signing, funded transaction or deployment. The validator suite's account wiring/constants are updated only. Existing markets without FeePolicy require an explicit rollout decision before any live upgrade. The checked-in program address is not deployment evidence.

## Exact next action

Publish this prepared tree on `codex/curve-treasury-fees`, open the PR to main, inspect its checks and report the resulting commit SHA in chat. Do not create recursive commits to write this checkpoint's own SHA. Merge and deployment remain with the owner.

Next is **Meteora DAMM v2 migration**: pin the compatible CPI and pool-creation/config route, handle pre-created pool collisions, stage the actual reserved tokens and net SOL under program authority, record an idempotent receipt, and validate position ownership/locking and fee claims before client routing. The old `kydos_amm` interface is historical groundwork, not the selected destination. Permanent locking and any extra migration charge remain concrete decisions for that milestone. Funded creation remains deferred until migration/graduation is ready.
