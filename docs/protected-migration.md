# Protected Kydos migration: approved phases 1-3

## Scope and current branch

The owner approved preserving Kydos creation and its custom curve, establishing
an authorized DAMM destination and implementing atomic migration. Continue
PR #34 on `codex/atomic-protected-graduation`; do not create another branch.
Repair source: `8755fb2214bd818267852a4597729dfbe2bd16e4`. Base: merged PR #33 at
`c0038ce424bd4cc54af046d7b7f691b8d8b4aba4`. Original compatibility baseline:
`3cce2ed02ac94d3951db33b3a67725182d8d7597`.

Preserve 1B original supply, six decimals, 793.1M curve / 206.9M migration,
existing program ID, Curve/FeePolicy layouts, buy/sell math, treasury and original
instruction/error definitions. No DBC, replacement program, extra tax or restored
authority. Holders may burn their tokens; current supply need not remain 1B.
Development approval is not approval to merge or spend mainnet funds.

## Phase 1: compatibility and deployment evidence

The existing read-only evidence tools remain under
`solana/scripts/protected-migration`. They inspect loader-v3 programs and configs
without sending transactions. The compatibility checker is not weakened: old
creation/trading source and old IDL definitions remain intact.

Historical mainnet observation (run 37156192684, job 111299944380, October 3 2026)
found Kydos executable and upgradeable. Program:
`GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE`; ProgramData:
`HkAvMhKsTaB99iniJ9vqpZJ86Nm2Csu5Mm63tU2VwVQk`; deployment slot 450014937.
Recorded authority: `6AK3h1s6byYRaDjNue8rMV1nqu8Q94AawPVVwNk7Phqc`.
No matching protected configuration was found in that pinned-layout scan.
This is historical observation, not proof of signer control, independent genesis
pinning, deployed-source parity or current configuration absence.

Read-only commands from repository root:

```
npm --prefix solana run test:protected
npm --prefix solana run check:compatibility
node solana/scripts/protected-migration/inspect.mjs --cluster mainnet-beta --out mainnet-observation.json
```

Exit 2 means observations cannot authorize release. Use an independently obtained
`--expected-genesis` and `--config` for an explicit candidate. Never commit secrets.
RPC failure is not evidence of absence. No fresh public scan occurred in this repair.

## Phase 2: one-time protected route

`install_migration_route` creates the 287-byte MigrationRoute PDA once, requiring
the actual current Kydos upgrade-authority signer authenticated through loader
state. It verifies program identities, ProgramData pointers/tags, executable
flags, ELF header, private Dynamic config, authority, index/PDA and zero permissions.
The route binds the config hash and DAMM deployment slot, quote/treasury and policy.
No update, close, arbitrary CPI, raw fee-claim or withdrawal bypass is exposed.

Fresh migration checks this route and enforces 100 bps BothToken, full range,
no dynamic fee, changing fee schedule, compounding or AlphaVault. The config
controls who can create pools; the migration program controls these fee parameters.
Changed config bytes or deployment slot reject fresh migration. Slot pinning is
not binary verification and cannot detect a same-slot upgrade. Route recovery
would need separate review; it must not reset completed migration receipts.

### Operator request: draft, not submitted

An authorized Meteora operator with CreateConfigKey must provision a suitable
Dynamic config unless an existing matching account is independently verified:

```
Cluster: mainnet-beta
Kydos: GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE
DAMM v2: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
pool_creator_authority: 3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd
permission: 0
index: unused u64 selected by the authorized operator
```

Obtain finalized creation signature, config address/index and operator identity.
Verify actual bytes and cluster before installation. No Kydos private key is
needed in the request. No request or mainnet configuration was submitted/created.

## Phase 3: implemented atomic graduation

`protected_migration/atomic.rs` executes the complete core. Anyone may sponsor
`migrate(max_setup_lamports)`, but cannot choose recipients, reserves, arbitrary
instructions or a noncanonical pool. It authenticates completed Curve/FeePolicy,
mint, custody and approved route. Only tracked real SOL and protected base reserve
fund liquidity. Rent, virtual balances and donations do not inflate principal.

A dedicated payer receives separate setup funding. Canonical staging supports
harmless prefunding; WSOL is synchronized before use. Both sides of caller-side
lamport moves enter the next CPI synchronization. The DAMM initializer is followed
by actual layout, deposit, fee, price, position and NFT-custody verification.
All initial liquidity is permanently locked and rechecked. Only then is the
493-byte receipt finalized with bindings, deposits, dust, liquidity and policy.
Cleanup/refunds distinguish this sponsor's funding from pre-existing donations.

Every operation shares one atomic transaction. Any failed step rolls back source
movement, pool creation, locks and receipt. Existing receipts permit zero-budget
replay after cleanup and pool trading without seeding twice or requiring original
pool reserves/price. Occupied unreceipted destinations are not adopted. The final
curve buy remains separate. The old graduated flag means curve complete; public
AMM status must instead use a real successful migration receipt.

## Corrected failures and test evidence

The initial test loader used CLI `none`; Agave 2.1.21 encoded Some(default key),
which production validation correctly rejected. Tests now use a distinct explicit
ephemeral DAMM authority and verify actual bytes. No authority check was removed.

The original monolithic migration exceeded its SBF frame. The compiler emitted
stack-overwrite diagnostics but exited zero. Non-inlined phases and boxed derived
addresses fix this. `check-sbf-build.mjs` plus four tests now make unsafe compiler
stack diagnostics fail CI. The two direct lamport moves include both affected
accounts in the next CPI, fixing the actual UnbalancedInstruction failure.

The exact-source mismatch was one extra terminal newline; it was corrected
without loosening the checker. Browser IDL is normalized from actual current-source
Anchor IdlBuilder compilation, not invented definitions. Existing interface entries
remain unchanged, including the original route documentation.

Local tools: Node 22.16.0, Agave 2.1.21, platform-tools v1.43, Rust 1.90.0 and locked
dependencies. DAMM binary is the public SDK fixture from revision
`37cd9e690d7b5fb6182638a21b86e0e1bf636a7e`, Git blob
`946562cfc35b978dbaf1100363b7505b018fd6f6`. Graduation actually invokes it. Source
and config accounts are synthetic genesis fixtures, not production provisioning.

Passing local suites: route runtime 14; graduation runtime 29; Solana JS 142
(includes four build-diagnostic tests); confirmation harness 6; host Rust 35;
app lint/build and market tests 5. Coverage includes malformed accounts,
underfunded/incomplete curves, restored mint authority, occupied destinations,
setup exhaustion after funding, compute exhaustion after DAMM creation, a later
transaction failure after successful migration, exact deposits/full lock,
cleanup, prefunding/donations, third-party concurrency, and post-swap replay.
This is meaningful executed coverage, not an exhaustive audit of every state.

Clean-fixture measurements: 365748 CU, 26928240 setup lamports excluding network
fees, 256 KiB requested heap; largest signed packet 1141/1232 bytes. Not a mainnet
cost quote. Normal CI retains compiler/runtime logs. Temporary diagnostic workflow
and large offline-tool packaging are removed. Check the resulting delivery SHA;
previous CI success is not evidence for new code.

## Separate live-release and future-work gates

Genuine verified configuration, authority control, cluster identity and deployed
binary/source compatibility remain prerequisites before a paid upgrade or route
installation. Upstream Meteora controls remain external dependencies. Local tests
are not mainnet binary verification or an independent security review.

No public-network transaction occurred. Fee claims, base burns and protected
50/50 quote payouts remain separate implementation work, as do keepers/UI rollout.
The initial position stays program-controlled for that later settlement policy.

## References

- https://solana.com/docs/core/programs/program-deployment
- https://solana.com/docs/core/cpi
- https://solana.com/docs/tokens/basics/sync-native
- https://www.anchor-lang.com/docs/updates/release-notes/0-31-0
- https://docs.meteora.ag/developer-guides/damm-v2/rust-integration/cpi
- https://github.com/anza-xyz/agave/blob/v2.1.21/test-validator/src/lib.rs
- `docs/fee-settlement.md`: approved burn / equal-quote accounting.
