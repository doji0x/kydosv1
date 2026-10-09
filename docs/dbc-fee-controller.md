# DBC creator registry and fee controller

## Scope

Continue `codex/meteora-dbc-integration` from `f7ea62476083b7b45e27a7267eb097580bda5e88`.
This milestone adds program custody, atomic creator registration, fee claims,
base-token burns and equal quote payouts to the EXISTING Kydos program ID.
No mainnet/devnet action, paid upgrade or frontend cutover is authorized here.

Added instructions: `launch_dbc`, `claim_dbc_fees`, `settle_damm_fees`.
Existing creation/trading source and account definitions remain unchanged.
The historical protected-route installer is not the DBC route and is not changed.

## Atomic original-creator registration

`launch_dbc` requires creator and fresh mint signatures, validates the complete
fixed DBC configuration, calls the SPL-token DBC initializer, and registers a
per-mint DbcLaunch account in the same instruction. Failure rolls back both.
There is no retrospective import, creator-update, close or reset instruction.
DBC's creator field can change later; Kydos still pays the original creator
recorded at launch. Existing Kydos or already-created DBC mints cannot be imported.

## Fixed configuration

The PDA using `["dbc_fee_authority"]` under Kydos must be both DBC fee claimer
and leftover receiver. Original SPL WSOL is the quote mint. This ordinary DBC
configuration does not need Kydos-specific DAMM operator provisioning.

PoolConfig bytes 104..1048 must hash to:
`fc03c742463f63e839da128dd0fb919ac3cddfb59057f8ab1faeed625e2aa46f`.
The prefix, recipients, discriminator and account ownership are checked separately.
This pins the exact nominal 793.1M/206.9M curve, 1B initial supply, fixed fees,
100% partner permanent lock, zero discretionary LP allocations and padding.
A public executed configuration fixture accompanies a Rust test rejecting a
mutation of every byte. Unsupported future versions fail closed; changing the
policy requires separately reviewed program/configuration changes.

## Fee custody and settlement

The migrated position NFT belongs to Kydos's fee PDA. Settlement verifies DBC
migration state, the canonical DAMM pool for the selected DBC migration config,
mints, vaults, canonical position/NFT accounts, exclusive NFT custody and full
permanent position locking. No delegated, unlocked or vested position is accepted.
Other LPs may add liquidity; only qualifying PDA-owned positions are settled.

Per-mint base and quote claim vaults belong to that mint's DbcLaunch PDA. The
caller pays rent/network fees separately. No arbitrary CPI, raw-claim bypass,
NFT transfer, LP withdrawal, recipient override or vault sweep exists.

`claim_dbc_fees` pays only net partner quote trading fees from the bonding curve
to Kydos, even when claiming those historical fees after migration. This preserves
creatorTradingFeePercentage=0 during bonding; it does not confuse those receipts
with post-migration 50/50 quote revenue.

`settle_damm_fees` claims the position's fees, measures actual token-balance
deltas, burns all newly claimed base using BurnChecked, and pays net quote equally
to the original creator and fixed Kydos treasury. It reuses the existing integer
settlement arithmetic. No Meteora share is deducted twice. Quote payouts are WSOL
in canonical recipient ATAs, not automatically unwrapped SOL. If creator equals
treasury, two equal transfers use the same ATA with separate entitlements.

At most one raw quote unit remains as protected dust. Donations, existing balances
and rent are excluded from receipts. Supply reduction, vault conservation and
recipient deltas are verified before committing counters. Checked u128 totals
record historical paid/burned amounts. Any failure rolls back claim, burn,
transfers, dust and counters together.

## Verification and handoff

The local run executed the built Kydos controller with pinned actual DBC/DAMM
and metadata programs. Unlike the previous lifecycle proof, the NFT fee owner is
now Kydos's real PDA, not an ephemeral wallet acting as a controller. Test wallets
and the protocol migration configuration are synthetic LOCAL fixtures only.

The controller runtime covers registration/rollback, wrong configuration fee
owner, duplicate launch, bonding claims, early AMM settlement rejection, donation
isolation, graduation into program custody, DBC creator transfer, wrong recipient
and pool, actual burn/equal payouts, repeated/fragmented claims and direct-wallet
claim rejection. A deliberately failing instruction after successful settlement
proves transaction-wide rollback; it is not exhaustive fault injection of every
possible SPL error. The helper tests compare actual compiler/browser IDLs and
unsigned instruction construction. Rust tests cover serialization and policy-byte
mutation in addition to the existing suites.

Local evidence before upload: 23 controller runtime assertion groups, seven
controller JavaScript tests, and 37 Rust tests passed. The first saved commit
`32b5ed2` failed its fixture-length test. `a869fb9` fixed the actual fixture bytes
without relaxing checks. Controller CI run `37675320585` then passed the Rust
checks, SBF build and 23 executed controller cases; its remaining failure was
the stale browser IDL, not fee settlement execution.

The completion updates the checked-in browser IDL using that run's generated
artifact `11507476130` (ZIP SHA256
`39dae51ad1efb9572ac933306cb9c9c213032012ee82bf7b34d25d0658a487e8`).
The JSON is whitespace-compacted but semantically identical to the normalized
compiler output. Removing only the new controller definitions reconstructs the
original browser-IDL Git blob `df514227a2853d4810e5588291161509492d92e5`.
Local checks verified compiler equality and all unsigned builders without RPC.
The resulting exact-head workflow must still finish successfully before merge
readiness is reported; earlier runs do not certify a later revision. No controller
logic, supply setting, authority check or payout rule changes in this IDL update.

## Outstanding production work

Frontend/indexer routing, creator claim UX, keeper recovery, target-cluster
configuration and deployed-source verification remain separate. The frontend must
use the atomic Kydos wrapper, not raw DBC initialization, for registered Kydos
launches. Raw externally created tokens using the fee PDA are not retrospectively
adopted. Do not assign production fee rights until the deployed controller is
verified and approved.

Surplus, migration leftovers, protocol fees, reward campaigns and additional
migration-fee balances are NOT claimed by these trading-fee endpoints. Residual
assets destined for the program-controlled leftover receiver are outside the fee
claim vaults and need a separately reviewed policy. No generic sweep is provided.
Kydos and upstream program upgrade authorities remain trust dependencies.
PDA custody does not make upgradeable programs immutable.

## References

- https://docs.meteora.ag/core-products/dbc/accounts-and-permissions
- https://docs.meteora.ag/developer-guides/damm-v2/program/instructions
- https://solana.com/docs/tokens/basics/burn-tokens
- https://solana.com/docs/core/pda
- `docs/dbc-transition.md`: prior exact configuration and DBC lifecycle proof.
