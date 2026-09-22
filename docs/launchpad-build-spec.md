# Kydos curve fees and DAMM v2 migration plan

The curve fee milestone is merged in PR #19. Current milestone: the compatible
Meteora DAMM v2 adapter foundation, based on main
`9eb9da645fd65bb99db941e6d31039c0bfc4dc38`. Its pinned interface, private-config
route, custody addresses, integer seed math and receipt schema are specified in
[meteora-adapter.md](meteora-adapter.md). Executable migration follows separately.
No validator/token creation tests, funded transactions or deployment. The earlier
custom AMM scaffold is not the migration target.

## Economics and completion decision

Preserve original SPL Token, 6 decimals, 1B minted tokens, 793.1M curve tokens,
206.9M liquidity tokens and 30 virtual SOL. Use 1.073B **initial virtual tokens**
for pricing; synthetic reserves are never minted or counted as withdrawable assets.

Resolve the earlier exact/approximate question as **inventory-driven completion**:
85 SOL is approximate, not a hard cap. Starting from an untouched curve, buying
all 793.1M tokens costs 85,005,359,057 lamports (ceiling) before fees. Many trades,
integer rounding, and round trips can alter the actual completion balance.
`graduation_target` stores this indicative one-shot value; it is never a trigger.
This value is net curve reserves. Treasury fees are paid separately and never
increase the reserves available for migration.

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

## Fixed curve fee policy

Each new market initializes a separate 76-byte `FeePolicy` account at
`[fee_policy, curve]` under the Kydos launchpad program. Version 1 fixes the fee at
100 bps and the treasury at `5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg`.
There is no policy setter, creator split, adoption or withdrawal instruction.
The Curve layout remains 397 bytes. Every trade verifies the policy's program
owner, PDA, bump, source curve, version, rate and treasury. The treasury must be
the fixed writable system account; a caller cannot redirect fees.

Amounts use integer lamports. Fee = ceil(gross SOL * 100 / 10,000).

| Operation | Submitted input | Curve reserve movement | Treasury | Wallet output |
| --- | --- | --- | --- | --- |
| Buy, including initial buy | Maximum SOL including fee | Increase by accepted gross minus fee | Fee in SOL | Curve tokens |
| Sell | Token amount | Decrease by gross quoted SOL | Fee in SOL | Gross SOL minus fee |

Buys first quote against the maximum after subtracting the fee. For the final
partial fill, gross = ceil(required net * 10,000 / 9,900); only that gross is
charged. A one-shot completion from an untouched curve therefore costs
85,863,999,048 lamports including an 858,639,991-lamport fee, leaving
85,005,359,057 lamports in real curve reserves. Unused input remains in the wallet.
A 1 SOL buy instead sends 0.01 SOL to the treasury and 0.99 SOL into the curve.
A zero initial buy charges no trading fee. Reject positive buys/sells that cannot
produce positive output after rounding. Slippage applies to tokens on buys and
**net wallet SOL on sells**, separately from network fees.

Sell settlement preserves Curve rent plus all remaining tracked reserves. Fees
are transferred during each trade; no unclaimed fee liability is mixed with
migration SOL. `TradeExecuted.sol_amount` retains its reserve-movement meaning
(buy net, sell gross). The new `TradeFeePaid` event records mint, trader, side,
treasury, gross, fee and net amounts for indexing/accounting.

Launch review includes FeePolicy rent and shows the included fee and net curve
purchase. Upfront balance checks budget the full authorized buy limit plus rent
and network fees; they do not add the 1% a second time or pre-credit sell proceeds.
The browser requires a decoded, supported on-chain policy before quoting.

Existing markets without this policy cannot trade through the new interface.
Do not deploy this program over live markets without inventorying them and
approving an explicit versioned rollout. Program identity and upgrade authority
verification remain deployment prerequisites. This milestone authorizes neither
retroactive fees nor a live upgrade.

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

## Earlier custom AMM scaffold (superseded destination)

`solana/programs/kydos_amm` is a host-compilable Rust interface crate using Anchor
serialization. It remains unused; Meteora DAMM v2 supersedes it as the destination.
It deliberately has no entrypoint, program ID, deployable binary,
CPI handler or instruction discriminator. It establishes:

- PoolState: source launchpad/curve, mint pair, vaults, LP mint, fee config,
  status, PDA bumps, real reserves and accounted LP shares.
- InitializeMigratedPoolArgs: schema version, seed amounts, minimum LP shares.
- MigrationReceipt: source curve, AMM ID, pool and actual migrated amounts.
- Canonical pool derivation: [pool, source_curve, base_mint, quote_mint] under
  the eventual verified Kydos AMM program ID. Vaults and authority have separate
  documented seed tags; account-owner constraints must be enforced in handlers.

PoolState::BODY_SPACE excludes the future Anchor discriminator. These are planned
serialization layouts, not accounts that currently exist on-chain. These types are historical groundwork, not a Meteora-compatible CPI contract.
Do not implement a new custom AMM from them as part of the selected migration path.

## Next migration implementation contract: Meteora DAMM v2 (not implemented here)

Anyone may request migration, but only the source curve PDA may authorize asset
movement through CPI. The Kydos migration handler must constrain the source program, PDA seeds,
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
5. Initialize the pool using range-aware integer seed calculations, verify minimum liquidity
   and apply the explicitly selected Meteora position lock/custody policy.
6. Write the receipt only after successful pool initialization; all effects
   roll back together on any failure. Competing calls cannot fund twice.

A repeated request may return the validated existing receipt, but never repeat
transfers. Curve completion and migration are separate transactions, not a server
withdrawal. Pending migration is observable and retryable without changing custody.
Client routing switches only after confirmed receipt+pool verification. Custom
LaunchCreated/TradeExecuted/Graduated/Migrated events need Kydos-aware indexing;
Helius parsed swap recognition alone is not a complete custom-program indexer.

Use the verified DAMM v2 pool and swap interface, with explicit token ordering,
fee collection mode, config validation and integer amount/price bounds. Reserved liquidity must
be tradeable within the AMM (the curve's remaining-inventory cap must not carry
into pool swaps). Token identity stays unchanged. Compare final curve price to
opening pool price using actual net amounts; do not force a discontinuous last buy.

## Verification and deferred work

This milestone runs pure calculations, serialization/PDA checks, existing mocked
client tests and build checks only. Token-creation tests in creation.test.js and
`anchor test` are explicitly deferred until AMM/graduation work is ready. Their
account wiring and economic constants are synchronized, but the suite is not run
or evidence of runtime readiness. Full pool initialization, swaps, LP operations, migration CPI,
DAMM fee claims, live readiness gates, custom event indexing and end-to-end validation are
subsequent milestones. No live-readiness claim follows from these host tests.

The adapter foundation selects private dynamic config initialization, strict mint
validation, program position custody and a pinned ABI compatible with the current
toolchain. The approved config still needs operator provisioning for a verified
Kydos program ID. Executable receipt/retry enforcement, lock policy, claims and
client routing remain pending. A 1% DAMM pool fee does not imply 1% treasury
receipts: Meteora's protocol share must be accounted for separately. Permanent
locking requires an explicit decision; no extra migration charge is implemented.

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

## Approved follow-up: launch interaction

The owner approved initial create-and-buy, image/metadata uploads and a review UI
on the same branch. The transaction builder reuses Kydos initialize and buy, with
a creator ATA between them; a zero initial buy remains create-only. Quotes use
this specification's integer math. Cost estimates include the full authorized
buy and the extra ATA rent. The prepared mint remains in memory from review to
signing. Rejection preserves form/upload data; unresolved submissions retain the
existing journal lock and are never replaced automatically.

Public image/JSON storage uses Pinata with a server-only PINATA_JWT and an
authenticated Base44 endpoint. Uploads are outside the atomic Solana transaction.
Setup, network checks, cost review and remaining deployment prerequisites are in
[solana/README.md](../solana/README.md#launch-form-and-public-metadata).

Source references: [Pinata signed uploads](https://docs.pinata.cloud/api-reference/endpoint/create-signed-upload-url),
[public uploads](https://docs.pinata.cloud/files/uploading-files), and
[Phantom provider detection](https://docs.phantom.com/solana/detecting-the-provider).
No live upload, Phantom signing or token creation is part of local validation.
