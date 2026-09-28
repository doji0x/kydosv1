# Permissionless DAMM v2 adapter - milestone 3A

## Delivered scope

Source reviewed: merged PR #30 at `b5e03c9a64d5f3256734aee6cb88eb630de094aa`.
Delivery base: `ed992423cb32a9b6a3ac1289a472ba3d49e1b1d4`; its newer application
changes do not overlap these eight paths and are preserved unchanged.
Branch: `codex/permissionless-damm-adapter`.

This milestone implements config-free address derivation, creation/lock CPI
builders and fresh-destination checks in `meteora::permissionless`. It does NOT
add an externally callable migration instruction, initialize accounts, sign or
submit transactions, write a receipt, claim fees, burn tokens or pay recipients.
The current instruction/account ABI and browser IDL remain unchanged.

The old private-config builder remains historical preparation with regression
tests; no operator setup is restored. The new module never accepts a config or
requires Meteora operator provisioning. Both builders remain unconnected to
runtime migration. This is NOT a production-ready graduation route.

## Policy kept unchanged

The creation builder pins a fixed 100 bps pool fee, `BothToken`, no dynamic fee,
no changing fee schedule, no compounding, no AlphaVault, the existing full price
range and immediate timestamp activation. Base is the launched coin; quote is
original SPL WSOL. The Token-2022 position NFT beneficiary is the canonical
Kydos position-owner PDA, not a creator or treasury wallet.

The lock builder requests a permanent lock of the entire calculated initial
liquidity. Later settlement retains PR #30's policy: burn the position's net
collected base fees; split its net collected quote fees equally between the
recorded creator and Kydos. No additional tax or holder allocation is introduced.
Supply constants, curve fees, reserve accounting, settlement, authorities,
treasury and browser code are untouched.

The attached migration research chooses an 800M/200M Kydos allocation; the
current repository uses 793.1M/206.9M. This task does not reconcile or change
those numbers. It preserves the shared Curve-PDA vault concept and the existing
repository's integer seed-liquidity calculation.

## Interface and addresses

Pinned upstream remains `@meteora-ag/cp-amm-sdk` 1.4.10, SDK revision
`37cd9e690d7b5fb6182638a21b86e0e1bf636a7e`, program revision
`a85c926607433f23f0ea60f4ca7b1ae92f4156cb`, IDL 0.2.4.

- `derive_addresses(launchpad, mint)` has no config argument. Pool seeds are
  `["cpool", max(mint, WSOL), min(mint, WSOL)]` under the pinned DAMM program.
  Sorting is descending raw bytes, NEVER a change to A=coin/B=WSOL roles.
- `prepare_pool(launchpad, mint, token_a_budget, token_b_budget)` recomputes the
  existing seed quote and returns addresses plus `initialize_customizable_pool`
  (19 account metas, 107 data bytes) and `permanent_lock_position` (6 account
  metas, 24 data bytes). These are CPI instructions, not a complete wallet
  transaction: the future launchpad handler must sign its PDAs.
- Creation signers are the migration payer and position-NFT mint. The lock signer
  is the position-owner PDA. Meteora's customizable initializer does not require
  its creator beneficiary to sign.
- `validate_fresh_destinations` checks exactly seven writable destinations in
  order: receipt, pool, position, NFT mint, NFT token account, coin vault, WSOL
  vault. Each must have its derived key, system ownership, empty data and no
  executable flag. Unsolicited lamports alone do not make it occupied; actual
  prefunded account creation still requires validator/runtime testing.

The fresh-only check rejects ALL occupied destinations, including receipts. It
is not a successful-replay path and does not prove migration. It does not
validate source reserves, mint authorities, pool data or deployed binaries.
The future handler must derive expected keys itself from authenticated state.

## Blocking issue before executable graduation: pool address occupation

The reviewed Meteora initializer derives the customizable pool only from the
mint pair. There is no launchpad-specific namespace or mint-authority signature
requirement. The payer signs and supplies both assets; even one-sided seeding
requires at least one raw unit of each. Once tokens circulate on the Kydos curve,
another holder can create the same customizable pool first.

Rejecting that pool protects custody but DOES NOT solve liveness: it can block
fresh-only graduation. This task does not accept that as a final launchpad policy.
Do not enable public migration until a reviewed, runtime-tested design resolves
precreation and recovery. Instruction/SDK parity cannot prove this property.

No automatic existing-pool adoption, private-config fallback, caller-selected
pool, changing fee preset, principal withdrawal or extra charge is introduced.
Adoption needs independent price/fee/liquidity/authority analysis; matching mints
is insufficient. Reserving a pool before circulation changes launch timing and
seeding and is not introduced here. Switching among deterministic public routes
is not by itself proof that an attacker cannot block graduation.

## Next executable milestone

After resolving that gate, authenticate the completed curve, SPL mints, fee
policy and source vault; isolate tracked reserves from donations/rent; fund and
validate canonical staging; wrap only real SOL; execute creation with PDA
signatures; reload and validate complete pool/position state; verify liquidity
equals the seed; lock the full position; prove zero unlocked liquidity; and only
then finalize a versioned receipt. Caller funding must cover network/rent costs
separately from liquidity principal.

Historical `MigrationReceiptV1` contains a private-config field. Do not pass a
zero config and reinterpret it as a permissionless receipt. Specify an explicit
route/version and custody/creator bindings with a separate successful-replay
path. Failures must roll back staging, creation, locking and receipt writes.

Runtime tests must cover malicious precreation, donations/prefunding, substituted
accounts/programs, wrong owners/mints, incomplete curves, mismatched liquidity,
failed or partial locks, replay/races, compute/heap/packet limits and reserve
conservation. Atomic fee claims, actual base burns and quote payouts follow that
migration integration; none are delivered by this adapter.

## Tests and evidence

Shared JSON vectors cover both mint sort directions. Rust checks every derived
address, instruction byte and account meta against them, plus invalid budgets
and fresh-account rejection/reordering cases. JavaScript independently builds
both instructions with the pinned SDK IDL and checks PDAs using SDK helpers.
Unexpected SDK RPC attempts throw. Version and canonical IDL hash are pinned.
The vectors were reconstructed from reviewed source; they are not represented
as SDK-generated fixtures before the independent parity test has run.

`npm --prefix solana run test:permissionless` runs all nine JS tests and is wired
into the ordinary Solana suite. Six Rust tests are in the registered module and
run through existing `cargo test --workspace --lib --locked` CI.

Only four dependency-free fixture-sanity tests and JS syntax checks ran locally,
on Node 22.16.0. Tested/uploaded blob identities: JS
`0e4fa44ab56b3694b7ed185792f9f682023c247f`, fixture
`e3e7db699ba7e068f994df07320f02334d8ba665`.
This environment lacks Rust/Cargo/Anchor and cannot resolve GitHub for dependency
installation. SDK parity, Rust tests, SBF/IDL and full regression results require
exact delivery-head CI. Do not reuse PR #30's success as evidence for this code.
No validator/devnet execution, transactions or deployment occurred.

## Primary references

- Customizable initialization, accounts, seeds and funding:
  https://github.com/MeteoraAg/damm-v2/blob/a85c926607433f23f0ea60f4ca7b1ae92f4156cb/programs/cp-amm/src/instructions/initialize_pool/ix_initialize_customizable_pool.rs
- Permanent lock and position authority:
  https://github.com/MeteoraAg/damm-v2/blob/a85c926607433f23f0ea60f4ca7b1ae92f4156cb/programs/cp-amm/src/instructions/ix_permanent_lock_position.rs
- Program constants:
  https://github.com/MeteoraAg/damm-v2/blob/a85c926607433f23f0ea60f4ca7b1ae92f4156cb/programs/cp-amm/src/constants.rs
- SDK PDA helpers:
  https://github.com/MeteoraAg/damm-v2-sdk/blob/37cd9e690d7b5fb6182638a21b86e0e1bf636a7e/src/pda.ts
- Instruction overview:
  https://docs.meteora.ag/developer-guides/damm-v2/program/instructions

Source/IDL parity is not deployed binary verification or a program audit.
