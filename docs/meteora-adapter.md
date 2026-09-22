# Meteora DAMM v2 adapter foundation

Milestone 2 adds a compatible interface and offline preparation. It does not add
a launchpad migration instruction, fund a pool, initialize a receipt, lock a
position or enable AMM trading. The existing launchpad instruction/account ABI is
unchanged. Source main: `9eb9da645fd65bb99db941e6d31039c0bfc4dc38` (PR #19 merged).

## Pinned contract

| Component | Pin |
| --- | --- |
| DAMM v2 program, mainnet/devnet | `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` |
| Program source reviewed | `MeteoraAg/damm-v2` at `a85c926607433f23f0ea60f4ca7b1ae92f4156cb` |
| Official SDK test dependency | `@meteora-ag/cp-amm-sdk` **1.4.10**, exact npm integrity in package-lock.json |
| SDK source reviewed | `MeteoraAg/damm-v2-sdk` at `37cd9e690d7b5fb6182638a21b86e0e1bf636a7e` |
| IDL metadata version | **0.2.4**; npm IDL equals the reviewed source JSON |
| Source IDL file SHA-256 | `ccbe93966accca0693790fd3a35b06ed4ca3758cd4d8675c31df92703b9a974d` |
| Canonical IDL JSON SHA-256 | `2ea7a91da839c5dd4b617f9e167db6b875e29bc251800c7f51155af8a1ffd565` |

The upstream Rust workspace currently uses Anchor 1.0.2, Solana 3.1.10 and Rust
1.93.0. Kydos retains its current toolchain and constructs one narrow, tested
`initialize_pool_with_dynamic_config` instruction. No upstream program source or
moving Rust crate is imported. The MIT SDK is a dev dependency, not browser code.
The IDL/source pins establish a tested interface, not deployed binary verification.

## Pool route and operator setup

Use a **private dynamic config**, not permissionless `cpool` initialization or a
public config. The private creator signer prevents another coin holder from
creating Kydos's config/pair pool first. No existing-pool adoption is implemented.
The future handler must reject a nonempty destination without a matching valid
receipt; it must never fall back to a public config or caller-selected pool.

There is **no provisioned/verified private-config address recorded in this repo**.
The declared Kydos program ID is also not deployment evidence. Required setup:

1. Establish the final Kydos program ID and intended cluster. Derive
   `["meteora_pool_creator"]` under that ID. This program signer is the config's
   `pool_creator_authority`; the treasury and operator wallet are not substitutes.
2. Have a Meteora operator with `CreateConfigKey` provision
   `create_dynamic_config(index, { pool_creator_authority, permission: 0 })`.
   Its address is `["config", index as u64 little-endian]` under DAMM v2.
3. Verify its owner, discriminator, exact 328-byte length, index/PDA, nonzero
   expected authority, dynamic type, zero permission and absent AlphaVault config.
   `validate_private_config` / `validatePrivateConfig` implement these checks.
4. Bind that approved config in the future launchpad route policy and verify the
   deployed DAMM executable. Passing an arbitrary config argument is not approval.

Dynamic here means initialization supplies the fee/range parameters. It does not
enable volatility fees. The adapter fixes **100 bps headline fee**, `OnlyB`, no
compounding, no dynamic fee, no changing fee schedule, no AlphaVault, the full
allowed price range, and timestamp activation with `activation_point=None`.
Coin is always token A (original SPL, 6 decimals); original SPL WSOL is token B.
Position NFTs use Token-2022, as required by Meteora.

Meteora's protocol share remains separate: with its current 20% share, a 1% pool
fee leaves 0.8% for LPs; Kydos receives that LP portion while holding all liquidity.
It is not a promise of 1% net treasury revenue. No extra migration fee is selected.

## Address and custody contract

All Kydos addresses are under the final launchpad program. `curve` is its existing
`["curve", coin_mint]` PDA. The helpers return canonical addresses; the future
handler must enforce these seeds/bumps and actual account state before CPI.

| Role | Seeds / ownership |
| --- | --- |
| Receipt | `["migration_receipt", curve]`; future Kydos-owned account |
| Migration payer | `["migration_payer", curve]`; **system-owned, empty data** signer |
| Pool creator authority | `["meteora_pool_creator"]`; global Kydos signer |
| Position owner | `["meteora_position_owner", curve]`; Kydos signer/NFT beneficiary |
| Position NFT mint | `["meteora_position_mint", curve]`; Kydos signs initialization, Token-2022 owns the mint |
| Staging coin / WSOL | `["migration_token", curve, mint]`; original SPL accounts, authority = migration payer |
| DAMM pool | `["pool", config, max(coin, WSOL), min(coin, WSOL)]` under DAMM; raw-byte **descending** mint order |
| DAMM token vault | `["token_vault", mint, pool]` under DAMM |
| DAMM position | `["position", position_nft_mint]` under DAMM |
| DAMM NFT token account | `["position_nft_account", position_nft_mint]` under DAMM; **not an ATA** |

PDA sorting does not reorder token A/B in instruction arguments. The global
pool authority and event authority are derived under DAMM. The 21-account CPI
includes both event accounts and the original Token/Token-2022/System programs.
Every signer/writable flag and the full 107-byte instruction payload are checked
against SDK-built instructions in both mint sort directions.

Meteora's payer both pays creation rent and authorizes transfers out of staging.
The data-bearing Curve account cannot serve as that system payer. The future
caller supplies rent/transaction funding separately; Kydos moves tracked assets
into staging and signs with the payer, creator-authority and NFT-mint PDAs.
The position beneficiary is the position-owner PDA. There is no wallet-held
position NFT or permission to withdraw liquidity in this milestone.

## Integer seeding and receipt schema

For budgets `a = 206900000000000` raw coin units and `b = real_sol_reserves`, use
`Lmin = 4295048016`, `H = 79226673521066979257578248091`, with Q64 sqrt prices.
The price `S` is the floor of the positive root of:

`a*H*S² + (b*2^128 - a*H*Lmin)*S - b*2^128*H = 0`.

Liquidity is `min(floor(a*S*H/(H-S)), floor(b*2^128/(S-Lmin)))`.
The pool debits `ceil(liquidity*(H-S)/(S*H))` coin and
`ceil(liquidity*(S-Lmin)/2^128)` WSOL. Both are checked against their budgets;
each residual is explicit dust. Budgets are u64; price/liquidity must fit u128.
Bounded BigUint intermediates avoid overflow in Rust; JavaScript uses BigInt.
The SDK test oracle uses its CommonJS Decimal instance at 120 digits because its
default 20-digit precision loses low Q64 bits on large inputs.

For the indicative one-shot completion, `b = 85005359057`, the resulting price is
`373906170871547101`, liquidity is `77361186753688197299861051454996`, both
budgets are fully deposited and dust is zero. Path-dependent net reserves are used
as observed, not replaced by the indicative completion target or 30 virtual SOL.
`seed_completed_curve` rejects unsupported/incomplete curves and deficient custody,
preserves curve rent, and excludes donated SOL/tokens from the seed budget.

`MigrationReceiptV1` is a proposed 347-byte serialized body (355 bytes with a
future Anchor discriminator), not an account exposed by the current IDL. It binds
curve, config, pool, position, NFT mint/owner, treasury and coin mint; records both
budgets, actual deposits, dust, price, liquidity, completion slot and lock policy.
It must be created only after successful atomic migration and full pool/position
validation. Serialization tests do not establish runtime idempotency.

## Next executable milestone

The remaining policy choice is program custody versus a **permanent liquidity
lock**; no irreversible lock is selected or executed here. Before enabling the
handler, resolve that choice and the private-config setup above. Implement atomic
staging/SyncNative, initialization, post-CPI validation, the approved lock,
receipt finalization and dust/rent refunds with fixed destinations. Fee claims
must authenticate the program-held NFT and route proceeds to the fixed treasury.
Keep repeat migrations from funding twice and reject mismatched receipts/pools.

The present host tests cover 12 independent SDK seed vectors (including nonzero
dust), price/budget invariants, full CPI parity, both mint orders, synthetic config
rejections, reserve isolation and receipt serialization. They make no RPC calls.
SBF compilation does not measure the future handler's compute/heap consumption;
that budget, rollback, competing calls, executable-version parity, locks, claims
and end-to-end graduation still need validator/runtime verification before use.

Sources: [Meteora CPI guidance](https://docs.meteora.ag/developer-guides/damm-v2/rust-integration/cpi),
[pinned program](https://github.com/MeteoraAg/damm-v2/tree/a85c926607433f23f0ea60f4ca7b1ae92f4156cb),
[pinned SDK and IDL](https://github.com/MeteoraAg/damm-v2-sdk/tree/37cd9e690d7b5fb6182638a21b86e0e1bf636a7e),
[fee breakdown](https://docs.meteora.ag/core-products/damm-v2/fees/overview).
