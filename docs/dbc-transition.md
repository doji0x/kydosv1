# Kydos DBC integration: executed lifecycle milestone

## Direction and preserved scope

Continue `codex/meteora-dbc-integration`. The owner selected DBC for NEW launches;
the branch is based on their revert `111a75acc8c172b66bf8cedbc4af7eebe1f6a0b7`.
Resume source for this milestone: `71c8cd10d9e5c8461ddce185e898408e11d24461`.
Do not restore PR #34, pursue Kydos-specific DAMM operator provisioning, modify
main, or reinterpret existing custom-curve accounts as DBC accounts.

New architecture: Kydos UI -> DBC creation/trading -> supported DAMM v2 migration
-> Kydos fee settlement. This milestone changes only the isolated `solana/dbc`
package, its CI and continuity documents. Existing program, IDL, root dependencies,
frontend and legacy launch accounts are untouched. No paid deployment or public
transaction is part of these tests.

## Completed: dependencies and exact nominal allocation

The earlier interrupted workflow DID commit the reviewed npm lockfile at
`71c8cd10d9e5c8461ddce185e898408e11d24461`. Its Git blob is
`84c53d6dc45db9cdd88d86a6f8b5d7a2a2f7d039`. This milestone preserves that file,
removes both temporary lock bootstrap and CI repository-write permission, and
uses `npm ci` exclusively. The CI no longer uploads dependency bundles or pushes
commits. SDK stays 1.5.13; Node 22.16.0; no SDK or transitive dependency change.

The first percentage-helper candidate had a nominal allocation discrepancy:
11.482252 fewer curve tokens, 2.375678 more migration tokens and 9.106574 remainder.
`exact-curve.mjs` now inverts the SDK's actual finite-range integer migration
function rather than approximating its opening price with the reserve ratio.
A second bounded integer search solves the lower curve price and liquidity for
the exact quote threshold and nominal curve amount. No tolerances are widened.

Only `sqrtStartPrice` and `curve` change from the SDK-built candidate. All fee,
lock, authority, supply and vesting settings remain unchanged. The resulting
single segment ends at its migration price; its buffer capacity is exactly the
approved curve allocation, so it does not require an additional supply buffer.
Each result is independently recomputed with SDK helpers and rejected unless
all nominal quantities are exact. DBC config creation also accepted these values
when executed against the pinned program, not merely the JavaScript validator.

| Quantity | Raw units | Human units |
| --- | --- | --- |
| Initial and configured post-migration supply | 1000000000000000 | 1B tokens |
| Nominal curve allocation | 793100000000000 | 793.1M tokens |
| Gross migration threshold | 206900000000000 | 206.9M tokens |
| Quote graduation threshold | 85005359057 | 85.005359057 SOL |
| Minimum supply with buffer | 1000000000000000 | 1B tokens |
| Unallocated nominal supply | 0 | 0 tokens |

Resulting sqrt start price: `97542788885440377`; migration sqrt price:
`373906170871547102`; curve liquidity: `104665909691083263283300748933251`.
These are integer SDK/program parameters, not price or return guarantees.

## Policy retained

Original SPL mint, six decimals, immutable metadata setting, no retained mint or
freeze authority. Bonding fee: 100 bps, quote-only, no dynamic fee,
creatorTradingFeePercentage=0 for the bonding-phase partner allocation.
Migrated pool: 100 bps, DBC OutputToken mapped to DAMM BothToken, no dynamic fee
or compounding. No additional creation/migration charge. Partner position:
100% permanently locked; no discretionary creator or treasury LP allocation.
The intended post-migration quote entitlement remains 50% creator / 50% Kydos,
and all launch-controlled base fees are to be burned by the future controller.

## Executed local lifecycle, not just instruction construction

`npm run test:runtime` loads public pinned DBC, DAMM and Metaplex executables
into a disposable Agave 2.1.21 validator on fixed loopback port 18899. It rejects
other RPC endpoints, checks exact bytecode hashes, uses generated test wallets,
and never reads a production wallet or submits to mainnet/devnet. The legacy
Kydos program is deliberately NOT loaded. Temporary ledgers are cleaned up.

Synthetic genesis includes funded test wallets and a DBC-authorized dynamic DAMM
configuration at the SDK's published route address. This is a local dependency
fixture, NOT production provisioning or proof of the mainnet configuration.
The fee beneficiary is an ephemeral wallet, NOT an implemented Kydos settlement
PDA. This distinction remains an explicit release blocker.

Two paths execute: buy -> partial-fill completion, and buy -> sell -> partial-fill
completion. Both create the config and mint, migrate, verify the exact deposited
balances and full liquidity lock, then execute a DAMM buy and sell to verify
output-asset fee accrual. Twenty-nine named assertion groups cover these paths,
negative transactions and rollback. The run submits 28 isolated transactions.

Rejected executed cases include insufficient configured supply, premature
migration, impossible slippage, oversized exact-input final buys, missing protocol
flash-rent reserve and duplicate migration. A deliberately failing instruction
AFTER successful DBC migration proves rollback of the pool, positions, source
vaults and migration state. A rejected submission is counted only after executed
transaction metadata confirms the program invocation and failure.

The pinned DBC program requires its global pool-authority account to have a
flash-rent reserve. The test first proves safe failure without it, then funds
1 SOL only in the local ledger. Successful migration reimburses the reserve
from the sponsor; token liquidity principal is not used for rent. Production
must inspect the existing protocol reserve, not blindly fund it.

## Nominal allocation versus actual trade rounding

Both tested paths kept initial mint supply exactly 1B. At completion, measured
circulation was `793099999999999` raw units (793099999.999999 tokens), leaving
`206900000000001` in the base vault: ONE raw base unit of swap rounding, not the
old multi-token configuration discrepancy. Quote reserves exceeded the threshold
by ONE lamport. These residuals are explicitly reported, not silently assigned
to a recipient or counted as a burn. Different trade paths require further testing.

Observed protocol migration rate: 20 bps. Actual deductions and deposits:

| Field | Raw amount |
| --- | --- |
| Protocol base migration fee | 413799999722 |
| Protocol quote migration fee | 170010718 |
| Net base deposited into DAMM | 206486200000278 |
| Net quote deposited into DAMM | 84835348339 |

Fees retained in the DBC vaults, surplus and the one-unit base residual are kept
separate from the AMM deposits. Gross source amounts equal deposits plus residual
vault amounts. Initial and post-migration mint supply are unchanged; no Kydos
fee burn or quote payout occurred. The initial DAMM position has zero unlocked
and zero vested liquidity; all pool liquidity equals its permanently locked
liquidity. Its NFT belongs to the explicit ephemeral test beneficiary.

Local measurements: 174199 and 166699 migration compute units; maximum packet
1196 bytes, below 1232. These are fixture measurements, not a mainnet cost quote.
Duplicate raw DBC migration REJECTS without moving reserves. It is not an
idempotent success API; the future worker must inspect migration progress first.
Oversized final ExactIn fails on the finite range. The future client must use
quoted PartialFill (with real slippage protection) and reconcile unspent input.

## Evidence and remaining work

Passing locally: 46 policy/SDK/confirmation tests; 29 executed lifecycle cases;
syntax checks. The final changed runtime ran twice successfully. The dedicated
CI repeats installation from the committed lock, helper tests, exact report and
all executed lifecycle assertions, then checks no tracked files were modified.
It retains JSON reports and logs. Exact delivery-SHA CI must be inspected after
commit; earlier green runs are not evidence for this revision.

Still NOT implemented: production config creation, Kydos creator registration,
fee-controller PDA and authenticated claims/base burns/equal quote payouts,
frontend/indexer routing, keeper recovery, and deployed-source compatibility.
No production fee rights should be assigned to a controller that cannot claim.
The local test wallet is not an approved production custody shortcut. Existing
Kydos coins remain legacy; no importer, second curve or account migration exists.

## Primary references and source pins

- SDK 1.5.13; reviewed source `a28b7239e71899eb52ff7aacac4dec90441885c4`.
- https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference
- https://docs.meteora.ag/core-products/dbc/migration-and-liquidity
- https://solana.com/docs/rpc/http/getsignaturestatuses
- DBC flash rent source: https://github.com/MeteoraAg/dynamic-bonding-curve/blob/f552f20aa3c1c7631427c3827aeea7c58b902813/programs/dynamic-bonding-curve/src/instructions/migration/flash_rent.rs
- Exact fixture Git and SHA256 identities are enforced by runtime-support.mjs
  and included in every lifecycle-report.json. Fixture execution is not a proof
  that current mainnet bytecode equals those binaries or an independent audit.
