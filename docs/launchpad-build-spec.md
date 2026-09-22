# Kydos AMM and graduation foundation

Scope approved in chat on 2026-09-22: define completion/migration, correct curve
math, and establish a compiling AMM account/interface foundation. No token
creation/validator tests, funded transactions, deployment, or full AMM build in
this milestone. Base main: 2316ac8e3d74a70a5ab5d154008adea757938c19 (PR #16 merged).

## Economics and completion decision

Preserve original SPL Token, 6 decimals, 1B minted tokens, 793.1M curve tokens,
206.9M liquidity tokens and 30 virtual SOL. Use 1.073B **initial virtual tokens**
for pricing; synthetic reserves are never minted or counted as withdrawable assets.

Resolve the earlier exact/approximate question as **inventory-driven completion**:
85 SOL is approximate, not a hard cap. Starting from an untouched curve, buying
all 793.1M tokens costs 85,005,359,057 lamports (ceiling) before fees. Many trades,
integer rounding, and round trips can alter the actual completion balance.
`graduation_target` stores this indicative one-shot value; it is never a trigger.
No new fee is introduced by this change; fee policy remains a separate decision.

The existing fields `virtual_token_reserves` and `virtual_sol_reserves` store
INITIAL pricing constants (not live reserves). Derive the live virtual reserves:

- x = real SOL + 30 SOL
- y = remaining curve tokens + (1.073B - 793.1M) tokens
- liquidity allocation remains 206.9M actual tokens, not the virtual offset.

For buy input a, output = floor(y*a/(x+a)). If that would exhaust real inventory
r, charge only ceil(x*r/(y-r)) and return r. Only the accepted SOL is transferred;
excess input remains in the wallet. Completion is exactly r_after = 0.
For sell input b, SOL output = floor(x*b/(y+b)); require it to be positive and
no greater than actual SOL reserves. Reject sells exceeding circulating curve
inventory. Use checked u128 intermediates / u64 state and enforce min output.
Outputs round down; exact-output final-fill cost rounds up. Shared Rust/JS vectors
cover the 85-SOL boundary, partial fills, dust, reserve bounds, and invariants.

## Lifecycle

| State | Evidence | Allowed behavior |
| --- | --- | --- |
| CurveTrading | graduated=false, remaining real tokens>0 | Curve buy/sell |
| ReadyToMigrate | graduated=true, remaining real tokens=0 | No curve buy/sell; funds remain in curve custody |
| AmmTrading (future) | Valid canonical migration receipt and active AMM pool | AMM swaps; curve remains closed |

Retain the current Curve ABI and `Graduated` event name for this foundation.
`graduated` now means **curve complete / awaiting migration**, never proof of an
active AMM. Do not auto-switch pricing functions in the curve. The frontend
shows this state and prevents trade submission. A future migration receipt is
separate from Curve, avoiding an account-size change in this milestone.

Legacy accounts with the former 793.1M initial virtual-token value are rejected
by the new pricing contract and client. This is NOT an approved upgrade for
existing deployed markets. Before any deployment, inventory any existing accounts
and decide explicit versioned rollout/compatibility. Do not silently reprice them.

## AMM foundation in this branch

`solana/programs/kydos_amm` is a host-compilable Rust interface crate using Anchor
serialization. It deliberately has no entrypoint, program ID, deployable binary,
CPI handler or instruction discriminator. It establishes:

- PoolState: source launchpad/curve, mint pair, vaults, LP mint, fee config,
  status, PDA bumps, real reserves and accounted LP shares.
- InitializeMigratedPoolArgs: schema version, seed amounts, minimum LP shares.
- MigrationReceipt: source curve, AMM ID, pool and actual migrated amounts.
- Canonical pool derivation: [pool, source_curve, base_mint, quote_mint] under
  the eventual verified Kydos AMM program ID. Vaults and authority have separate
  documented seed tags; account-owner constraints must be enforced in handlers.

PoolState::BODY_SPACE excludes the future Anchor discriminator. These are planned
serialization layouts, not accounts that currently exist on-chain. Initial LP
ownership, fee schedule, upgrade authority and the AMM deployment identity remain
explicit decisions before implementing handlers; no defaults grant custody.

## Next migration implementation contract (not implemented here)

Anyone may request migration, but only the source curve PDA may authorize asset
movement through CPI. The AMM must constrain the source program, PDA seeds,
source account ownership and signer; an arbitrary wallet signer is insufficient.
Pin the destination AMM program and canonical pool, token mints, vault owners,
original SPL Token program and WSOL mint. Reject substituted/pre-seeded destinations
unless a deliberately specified initialization policy verifies their exact state.

A single atomic transaction must:
1. Verify ReadyToMigrate and absence of a successful canonical receipt.
2. Determine actual transferable SOL excluding rent and any separately approved
   charges. The 30 virtual SOL is never transferred. Preserve account rent.
3. Wrap actual SOL into the canonical WSOL account and SyncNative.
4. Move 206.9M reserved tokens and the approved actual SOL amount into AMM vaults.
5. Initialize the pool at quote_amount/base_amount, verify minimum liquidity
   and apply the explicitly selected LP burn/lock/custody policy.
6. Write the receipt only after successful pool initialization; all effects
   roll back together on any failure. Competing calls cannot fund twice.

A repeated request may return the validated existing receipt, but never repeat
transfers. Curve completion and migration are separate transactions, not a server
withdrawal. Pending migration is observable and retryable without changing custody.
Client routing switches only after confirmed receipt+pool verification. Custom
LaunchCreated/TradeExecuted/Graduated/Migrated events need Kydos-aware indexing;
Helius parsed swap recognition alone is not a complete custom-program indexer.

AMM pricing will use real pool reserves with exact-input output rounded down,
explicit fee accounting, and post-swap invariant checks. Reserved liquidity must
be tradeable within the AMM (the curve's remaining-inventory cap must not carry
into pool swaps). Token identity stays unchanged. Compare final curve price to
opening pool price using actual net amounts; do not force a discontinuous last buy.

## Verification and deferred work

This milestone runs pure calculations, serialization/PDA checks, existing mocked
client tests and build checks only. Token-creation tests in creation.test.js and
`anchor test` are explicitly deferred until AMM/graduation work is ready. Their
older economic assertions must be refreshed at that time; they are not evidence
for this branch. Full pool initialization, swaps, LP operations, migration CPI,
fees, live readiness gates, custom event indexing and end-to-end validation are
subsequent milestones. No live-readiness claim follows from these host tests.

## References reviewed

- Pump public docs snapshot 81091419e4457566469d4e2a27f64ed84d42419c:
  https://github.com/pump-fun/pump-public-docs/blob/81091419e4457566469d4e2a27f64ed84d42419c/docs/PUMP_PROGRAM_README.md
- PumpSwap account/instruction reference (not a dependency):
  https://github.com/pump-fun/pump-public-docs/blob/81091419e4457566469d4e2a27f64ed84d42419c/docs/PUMP_SWAP_README.md
- Constant-product rounding/invariants: https://docs.raydium.io/algorithms/constant-product
- CPI authority: https://solana.com/docs/core/cpi
- WSOL synchronization: https://solana.com/docs/tokens/basics/sync-native
- Account constraints: https://www.anchor-lang.com/docs/references/account-constraints

No Pump SDK, Pump program call or source implementation is added.
