# Meteora DAMM v2 migration and fee contract

Milestone 1 locks the Kydos fee, custody and migration policy and updates the
SDK-parity pool initialization to `BothToken`. It remains offline preparation:
there is no launchpad migration instruction, funded pool, receipt account,
position lock or enabled AMM trading in this milestone. The existing launchpad
instruction/account ABI is unchanged. The executable work is deliberately split
into later reviewable milestones.

## Approved v1 policy

| Item | Fixed v1 decision |
| --- | --- |
| Curve fee | 100 bps of gross SOL, already paid directly to the Kydos treasury |
| DAMM headline fee | 100 bps fixed base fee; no dynamic fee or scheduler |
| Collection | `BothToken`: fees accrue in the coin and WSOL according to swap direction |
| Meteora share | Currently 20% of the trading fee; controlled by Meteora, not Kydos |
| Expected Kydos share | Currently 80 bps of volume after the 20% protocol share |
| Extra migration fee | None |
| Liquidity | Entire initial Kydos position permanently locked atomically with migration |
| Fee custody | Claim only to fixed Kydos treasury token accounts |
| Utility | Deferred: no burn, split, buyback, holder reward, creator reward or compounding |

The 100 bps DAMM fee is the pool's swap fee, not a second transfer tax. Original
SPL tokens do not tax wallet transfers or trading in unrelated pools. Likewise,
80 bps is the expected Kydos LP share under Meteora's current 20% protocol share,
not an immutable promise. Runtime and UI surfaces must disclose the gross fee and
current protocol split separately.

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
enable volatility fees. The adapter fixes **100 bps headline fee**, `BothToken`, no
compounding, no dynamic fee, no changing fee schedule, no AlphaVault, the full
allowed price range, and timestamp activation with `activation_point=None`.
Coin is always token A (original SPL, 6 decimals); original SPL WSOL is token B.
Position NFTs use Token-2022, as required by Meteora.

In `BothToken`, coin-to-WSOL swaps take fees from WSOL output and WSOL-to-coin
swaps take fees from coin output. With Meteora's current 20% protocol share, the
1% pool fee leaves an expected 0.8% for the Kydos position. No extra migration
fee is selected. Secondary pools can bypass this canonical-pool fee; a universal
transfer tax would require a different token design and is outside this scope.

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
position NFT. The executable migration must permanently lock all position
liquidity before finalizing its receipt; fees remain claimable.

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

## Executable migration contract

Anyone may request migration, while the caller pays transaction and permanent
pool-account rent. Curve liquidity is never reduced to pay setup costs. One
atomic Kydos instruction must:

1. Validate the completed canonical curve, fee policy and absent receipt.
2. Preserve curve rent and isolate tracked reserves from unsolicited donations.
3. Move exactly the accounted 206.9M coin reserve into canonical staging.
4. Wrap only `curve.real_sol_reserves` into the canonical WSOL staging account
   and call `SyncNative`; the virtual 30 SOL is never transferred.
5. Recompute the opening price/liquidity and invoke the pinned DAMM initializer
   with the approved private config, 100 bps fee and `BothToken` collection.
6. Validate the created pool, mints, vaults, position, liquidity and deposits.
7. CPI into `permanent_lock_position` for the complete position and validate the
   permanent-lock state.
8. Create the canonical receipt only after those checks pass, then return allowed
   dust and temporary-account rent to fixed destinations.

Any failure rolls back every effect. A repeated or competing request must never
transfer reserves twice; an existing destination is accepted only when a matching
successful receipt and complete pool/position state validate.

## Fee claim contract

A separate permissionless Kydos instruction will authenticate the program-held
position NFT, CPI into `claim_position_fee`, and send coin and WSOL only to the
canonical Kydos treasury associated token accounts. The caller may pay network
and missing-ATA rent but cannot redirect either asset. A claim event records both
amounts. This milestone selects custody only: claimed assets remain untouched
until a later, separately approved utility policy.

## Remaining delivery gates

- Provision and bind the private dynamic config for the deployed Kydos program.
- Implement the migration and fee-claim handlers plus receipt account/events.
- Measure packet size, compute and heap; use a versioned transaction only if the
  atomic account set cannot fit a legacy transaction.
- Add local-validator/devnet coverage for migration, both swap directions, fee
  accrual/claim, permanent lock, rollback, replay and account substitution.
- Add client migration recovery, receipt/pool verification, indexing and routing.
- Complete an independent program audit and move upgrade authority to a multisig
  before unrestricted public graduation.

The present host tests cover 12 independent SDK seed vectors (including nonzero
dust), price/budget invariants, full CPI parity, both mint orders, synthetic config
rejections, reserve isolation and receipt serialization. They make no RPC calls.
SBF compilation does not measure the future handler's compute/heap consumption;
that budget, rollback, competing calls, executable-version parity, locks, claims
and end-to-end graduation still need validator/runtime verification before use.

Sources: [Meteora CPI guidance](https://docs.meteora.ag/developer-guides/damm-v2/rust-integration/cpi),
[pinned program](https://github.com/MeteoraAg/damm-v2/tree/a85c926607433f23f0ea60f4ca7b1ae92f4156cb),
[pinned SDK and IDL](https://github.com/MeteoraAg/damm-v2-sdk/tree/37cd9e690d7b5fb6182638a21b86e0e1bf636a7e),
[fee breakdown](https://docs.meteora.ag/core-products/damm-v2/fees/overview),
[program instructions](https://docs.meteora.ag/developer-guides/damm-v2/program/instructions),
[permanent locks](https://docs.meteora.ag/user-guides/how-to-use-damm-v2/damm-v2-pool-detail#permanent-lock-liquidity).

## Milestone 2: private-config setup and approval preflight

The repository now provides an offline operator request and read-only RPC tools.
This is the setup portion of Milestone 2. Provisioning and approval remain open
until a Meteora operator creates the config. The registry is a release-review
input, not an on-chain authorization account or an enabled migration handler.

The release program `GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE` derives creator
PDA `3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd`. This is the authority the
operator must store. A mainnet finalized lookup on 2026-09-24 at slot `450045280`
returned no matching 328-byte configs for that authority. This observation is
point-in-time evidence; rerun discovery before requesting another config.

### Operator handoff

The ready-to-share request is [meteora-mainnet-request.json](../solana/config/meteora-mainnet-request.json).
It contains only public information. Ask a Meteora operator with `CreateConfigKey`
to choose an unused u64 index and call `create_dynamic_config` on mainnet with:

- `pool_creator_authority = 3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd`
- `permission = 0` (do not skip mint validation)
- Return the chosen index, config address and finalized creation signature.

The operator signer and rent payer sign config creation. The Kydos PDA is stored
as the future pool-creator authority; it does not sign config creation. Funding
an ordinary wallet does not grant `CreateConfigKey`. No Kydos keypair, seed phrase,
or Helius credential needs to be sent to the operator. The requested dynamic
config does not itself set the 1% fee: the later Kydos pool initializer supplies
and enforces the fixed Milestone 1 fee parameters.

Pinned source: [creation handler](https://github.com/MeteoraAg/damm-v2/blob/a85c926607433f23f0ea60f4ca7b1ae92f4156cb/programs/cp-amm/src/instructions/operator/ix_create_dynamic_config.rs),
[creation accounts](https://github.com/MeteoraAg/damm-v2/blob/a85c926607433f23f0ea60f4ca7b1ae92f4156cb/programs/cp-amm/src/instructions/operator/ix_create_static_config.rs),
[operator permissions](https://github.com/MeteoraAg/damm-v2/blob/a85c926607433f23f0ea60f4ca7b1ae92f4156cb/programs/cp-amm/src/state/operator.rs).

### Commands in Codespaces

Run from the repository root after `npm ci --ignore-scripts`:

```sh
node solana/scripts/meteora-config.mjs request --cluster mainnet-beta
read -r -s -p "Paste Helius mainnet URL: " KYDOS_RPC_URL
printf '\n'
export KYDOS_RPC_URL
node solana/scripts/meteora-config.mjs discover --cluster mainnet-beta
```

Once the operator returns the address, replace `CONFIG_ADDRESS` below:

```sh
node solana/scripts/meteora-config.mjs verify --cluster mainnet-beta --config CONFIG_ADDRESS > /tmp/kydos-config-verification.json
```

`verify` checks cluster genesis, executable Kydos/Meteora programs under the
upgradeable loader, and the existing strict private-config validator. Its
finalized account snapshot records the slot and SHA-256 of the config bytes.
This proves observed account properties, not deployed binary/source equivalence.
No command loads a keypair, signs, sends a transaction, or enables migration.
RPC errors are sanitized to avoid printing endpoint credentials.

### Bind only after review

1. Check that the returned creation signature, address and index match the
   operator request and the independent `verify` report on the intended cluster.
2. Review the report's `proposedBinding`, then commit that object under the matching
   cluster in [meteora-routes.json](../solana/config/meteora-routes.json). Keep the
   other cluster separate. Never use a config returned by discovery as automatic approval.
3. Run `node solana/scripts/meteora-config.mjs check --cluster mainnet-beta`.
   It refuses a missing binding, wrong release identity, index/PDA mismatch,
   wrong cluster or changed config bytes. Successful checks still report
   `migrationEnabled: false` because the executable handler is not implemented.
4. Before deploying the later handler, enforce the reviewed config address in
   its on-chain route policy. A JSON registry or environment variable alone
   cannot enforce a CPI account restriction on-chain.

Milestone 2 setup acceptance: reproducible request, separate cluster bindings,
read-only discovery/verification, no automatic candidate approval, and rejection
tests in the normal Solana suite. Full Milestone 2 completion additionally needs
the provisioned config, reviewed evidence and committed binding. Executable
migration, locks, claims, runtime tests and deployment remain later gates.
