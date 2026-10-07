# Kydos DBC transition: SDK candidate milestone

## Selected direction and branch

The owner selected Meteora DBC for NEW launches and requested a new branch.
`codex/meteora-dbc-integration` starts at the owner's revert commit
`111a75acc8c172b66bf8cedbc4af7eebe1f6a0b7`. Main was still at PR #34's merge
`38ff3b3619ea1e11bd6d6576ba03a35eea0c1f8b` when the branch was created.
Neither main nor the revert branch was modified. Do not restore PR #34, request
a Kydos-specific protected DAMM config, or use the old graduation instruction
as the active new-launch route.

New architecture: Kydos interface -> DBC launch/trading -> supported DAMM v2
migration -> Kydos fee settlement. Existing coins remain on their existing
accounts. Do not initialize an existing Kydos mint through DBC or run two curves
for the same launch. No production frontend, program or IDL is changed here.

## Implemented in the first code commit

Commit `5551734758cf79d0d3129e9f57def54935992894` adds an isolated `solana/dbc`
package, SDK 1.5.13, fixed-policy candidate generation, normalized requirements
checks, SDK-derived supply reports, an unsigned createConfig instruction test,
and dedicated CI. No signer, RPC endpoint, deployed fee recipient or production
configuration is added. Root dependencies are unchanged.

The candidate targets initial supply 1B at six decimals, nominal curve 793.1M,
gross migration allocation 206.9M, and the prior candidate threshold
85.005359057 SOL. Bonding fee: 100 bps, quote collection, no dynamic fee and
creatorTradingFeePercentage=0 (the preexisting bonding-phase partner-revenue
intent, not the later creator entitlement). Migrated pool: 100 bps, output-token
collection, no dynamic fee/compounding. No extra creation or migration charge.
All candidate liquidity is partner-permanently-locked. The eventual partner
fee owner must be an IMPLEMENTED program that burns its base fee receipts and
pays net quote 50% recorded creator / 50% Kydos, not an unrestricted LP wallet.
This candidate does not assign fee rights to a production PDA.

## Actual SDK result: exact allocation is not yet resolved

CI run `37657033302`, artifact `11499375871`, executed the official SDK and passed
39 tests (29 policy tests and 10 SDK tests). Unsigned config construction passed
with RPC calls prohibited. SDK validation is not runtime program validation.

The generated report, in raw units with 1,000,000 units per token, recorded:

| Field | SDK result | Requested |
| --- | --- | --- |
| Initial supply | 1000000000000000 | 1000000000000000 |
| Nominal curve amount | 793099988517748 | 793100000000000 |
| Gross migration amount | 206900002375678 | 206900000000000 |
| Remainder at nominal threshold | 9106574 | Not yet reconciled |
| Minimum supply with buffer | 1000000000000000 | 1000000000000000 |

That is 11.482252 fewer curve tokens, 2.375678 more gross migration tokens and
9.106574 tokens outside those two nominal amounts. No extra initial issuance is
introduced by this SDK candidate. These are calculated values, NOT observed
balances after real buys, sells or graduation. The strict requirements checker
reports mismatch; no tolerance was widened to make it pass.

The nominal report can be generated with `node inspect.mjs` after installing the
isolated package. It always returns releaseReady=false. An illustrative 20-bps
protocol migration deduction is labeled as an assumption and is not evidence of
actual protocol collection or a Kydos burn.

## Dependency and test status

The initial CI job resolved published npm packages, ran npm ci, executed SDK tests
and uploaded the generated package-lock plus public dependencies. Transitive lock
finalization is still open: the exact generated lockfile has not been committed,
and the temporary bootstrap must be removed before merge/reproducibility approval.
No manually reconstructed lockfile is approved. The SDK source revision reviewed
was `a28b7239e71899eb52ff7aacac4dec90441885c4`; npm version identity is not a proof
of full source/tarball or deployed-binary equivalence.

## Next executable acceptance milestone

Finalize the lockfile, reconcile nominal allocations through actual SDK/program
math, and run a complete isolated DBC lifecycle: config creation, mint creation,
buys, sells, final threshold crossing, DAMM migration and post-migration swap.
Measure exact mint supply, final-buy overshoot/rounding, surplus, protocol base
and quote deductions, net deposits, permanently locked amount and fee owner.
Do not claim exact allocation or change supply based solely on a percentage input.

Then implement authenticated creator registration, app routing/indexing, and a
fee controller with actual claims, base burns and equal quote payouts. DBC's
creator can be transferable; do not let that silently redirect an entitlement
promised to the originally recorded creator. Production launches remain gated
until the fee owner can actually claim and enforce the policy.

No DBC config, pool, public-network transaction, paid upgrade, token launch,
keeper, base burn or payout was performed. Existing Kydos code may remain for
legacy compatibility, but DBC is the selected engine for new launches.

## Primary references

- https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference
- https://docs.meteora.ag/core-products/dbc/accounts-and-permissions
- https://docs.meteora.ag/core-products/dbc/fees/overview
- https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/a28b7239e71899eb52ff7aacac4dec90441885c4/packages/dynamic-bonding-curve/src/helpers/buildCurve.ts
