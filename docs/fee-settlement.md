# Base-burn / quote-split settlement foundation

## Status and scope

This milestone adds tested, dependency-free accounting helpers in Rust and
JavaScript. It does not implement or enable a migration, fee-claim instruction,
burn instruction, payout, scheduled keeper, or UI claim button. The current
launchpad instruction/account ABI and browser IDL remain unchanged.

Source reviewed: `main` at `69885cd0894a15dee350428e09c30c0d6b6f9ced`.
Delivery branch: `codex/base-burn-quote-split`.

This policy supersedes the treasury-only post-migration fee custody and
no-burn/no-split design in `meteora-adapter.md` and `launchpad-build-spec.md`.
Those files still describe historical private-config scaffolding, not an approved
live route. Permissionless migration is the selected direction, but its safe
pool-initialization and existing-pool/collision policy are not implemented here.
PR #29 is open to revert the private-config setup from PR #28. It has not merged
into the inspected main. Do not merge this branch without reconciling that PR's
package/checkpoint changes. This work does not provision or approve any config.

## Fixed post-migration policy

- Retain the existing 100 bps gross DAMM fee and `BothToken` collection design.
- Burn 100% of the base-token fees actually claimed by the launch-controlled LP
  position. Base means that particular launched coin, not a platform-wide token.
- Split its net claimed WSOL fees equally: 50% to the recorded coin creator,
  50% to the fixed Kydos treasury. Never subtract Meteora's fee share a second time.
- No additional holder tax, 1.25% preset, staking, buyback, referral allocation,
  or holder distribution is approved or implemented in this milestone.
- Leave existing bonding-curve fees, supply/reserve constants, authorities,
  treasury address, migration principal and migration-fee policy unchanged.

These are canonical-pool LP fee allocations, not a tax on arbitrary transfers or
fees earned by Meteora or other LPs. Current Meteora documentation describes
`BothToken` as output-asset fees and a default 20% protocol share. Use actual net
claim deltas rather than assuming a fixed SOL income of 0.8% on every trade.

## Accounting contract

The future handler must snapshot and reload authenticated fee-vault SPL token
amounts around its pinned `claim_position_fee` CPI. Do not use wallet lamports,
rent deposits, estimated fees, total pool balances, or caller-provided amounts.

Let `base_received = base_after - base_before`,
`quote_received = quote_after - quote_before`, and `d` be previously retained
quote dust in protocol-owned state. Require `d` to be 0 or 1 and funded in the
pre-claim quote balance. Reject a decreasing token balance.

```
base_to_burn = base_received
available_quote = quote_received + d
creator_quote = floor(available_quote / 2)
kydos_quote = floor(available_quote / 2)
next_quote_dust = available_quote % 2
```

All amounts are raw token units, not floating-point SOL. Carrying one indivisible
unit avoids awarding rounding profits to either recipient. Repeated tiny claims
produce the same cumulative payouts as one aggregate claim. Dust is not Kydos
revenue and cannot be withdrawn by an admin. An empty claim cannot spend unrelated
funds; previously donated balances remain outside settlement.

Helpers: `fees::settlement::plan_fee_settlement` and `planFeeSettlement`.
`SETTLEMENT_POLICY_VERSION = 1` is local to this new policy; it does not alter or
reinterpret the existing on-chain curve fee-policy version. The helpers are pure
arithmetic and do not authenticate any account, persist dust, or move funds.

## Required executable integration (not delivered here)

1. Finish permissionless graduation with authenticated pool/position bindings,
   atomic permanent locking, replay protection and a verified migration receipt.
   Reject or explicitly design recovery for precreated destination pools; never
   adopt arbitrary existing liquidity based only on matching token mints.
2. Bind a versioned per-coin settlement record to the curve, actual creator,
   fixed treasury, canonical pool, program-controlled position and both mints.
   Keep the position NFT controlled by the program, not a creator/admin wallet.
   Store dust in that record; no caller or admin can set a fee share or destination.
3. Validate the receipt and permanently locked position; verify token programs,
   mints, vault owners and canonical addresses. Read base/quote mapping from
   validated pool state, not sorted PDA seed order. Reject substituted accounts
   and aliases between recipients and claim vaults. Creator equal to treasury
   needs an explicitly tested combined-transfer case with separate accounting.
4. Claim into program-controlled vaults, measure deltas, and execute this plan in
   one atomic instruction: SPL `BurnChecked` for the launched base token and
   checked WSOL transfers to the creator and treasury token accounts. Skip zero
   operations. Burn failure or either payout failure must roll back the claim,
   every transfer and dust update. Mint authority need not be restored.
5. Persist new dust and emit actual received/burned/paid amounts and policy
   identity only on success. Reconcile post-settlement balances and supply change.
   Allow permissionless triggering without permissionless recipient selection.
   Caller pays transaction/ATA creation costs; do not charge liquidity principal
   or silently deduct costs from the creator's 50%. Leave dust vaults open.

No universal admin sweep, alternate raw fee-claim path, mint-authority restoration,
LP withdrawal or caller-controlled CPI is part of the proposed integration.
Any program upgrade authority still requires separate governance/release controls;
this arithmetic alone is not a guarantee against an authorized program upgrade.

## Verification and release gates

`npm --prefix solana run test:settlement` runs 21 offline JavaScript tests,
including 14 CSV vectors shared with the Rust module. Coverage includes u64
boundaries, absent claims, donation isolation, funded dust, invalid inputs,
1,001 one-unit claims, and 10,000 fragmented claims compared with aggregation.
The standard Solana test and syntax-check scripts include the new JavaScript.
The registered Rust module has three unit tests using the same fixture.

The current environment ran the 21 JavaScript tests and syntax checks. It has
no Rust/Cargo/Anchor toolchain and cannot resolve GitHub for a full checkout or
dependency installation. Rust tests, the full repository suite, SBF/IDL parity
and validator/devnet tests are NOT claimed as passing. Check exact delivery-SHA
CI before merge. Later integration must additionally test real BothToken accrual,
authentication failures, permanent locks, mint supply reduction, payout rollback,
replay, account substitution, and preserved creator/treasury entitlements.

## Primary references (reviewed for this design)

- Meteora fees and claimable LP share:
  https://docs.meteora.ag/core-products/damm-v2/fees/overview
- Meteora pool, position, locking and claim instructions:
  https://docs.meteora.ag/developer-guides/damm-v2/program/instructions
- SPL burn behavior and token-account-owner authority:
  https://solana.com/docs/tokens/basics/burn-tokens

External documentation verifies available mechanisms, not Kydos deployment or
upstream executable/source parity. Keep the existing SDK/source pins until a
separate integration validates any replacement.
