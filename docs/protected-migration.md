# Protected Kydos migration: approved phases 1-3

## Authority and scope

The owner approved development of the plan preserving Kydos creation and its
custom curve, verifying a protected DAMM v2 configuration, and implementing the
complete atomic migration core on a separate branch. No mainnet deployment,
program replacement, DBC integration, tokenomics change, secret disclosure or
paid transaction is authorized by that approval.

Branch: `codex/kydos-protected-migration-phases-1-3`.
Verified repository baseline: `3cce2ed02ac94d3951db33b3a67725182d8d7597`.
The 793.1M curve / 206.9M migration allocation supersedes older 800M/200M notes.
The existing program ID, layouts, creation, trading, fees and settlement
arithmetic are preserved. Mint/freeze authority must not be restored.

## Current delivery: phase 1 evidence and compatibility gates

- `evidence.mjs`: strict loader-v3 Program/ProgramData observation, canonical
  public-key encoding, config layout/authority/permission/PDA validation, public
  bytecode/config hashes and explicit non-authority/non-deployment claims.
- `inspect.mjs`: read-only JSON-RPC allowlist. Observes finalized program and
  ProgramData in one snapshot, derives authority/config PDAs, and discovers
  matching config candidates. No wallet loading, signing, submissions or airdrops.
- `compatibility.mjs`: compares existing source and interface against the exact
  baseline. Only separately identified module/dispatcher additions are allowed;
  existing instruction/account/type/event definitions and errors stay unchanged.
- 39 dependency-free unit tests cover malformed accounts, immutable deployments,
  config rejection, full u64 indexes, fingerprints, cluster mismatch, bytecode
  padding, CLI parsing and a write-blocking RPC allowlist.
- Tests and syntax checks are wired into the existing Solana suite. A separate
  read-only CI job observes public mainnet/devnet endpoints. Observation failure
  is evidence of an unresolved gate, never a passing deployment claim.

The local focused suite passed 39 tests on Node 22.16.0. No local Rust/Cargo/
Anchor toolchain or network checkout is available. Exact-head CI and actual
observation results must be inspected separately. The funded deployment, signer
control and protected configuration are NOT yet verified by this delivery.

## Using the read-only inspector

From the repository root:

```
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix solana run test:protected
npm --prefix solana run check:compatibility
node solana/scripts/protected-migration/inspect.mjs --cluster mainnet-beta --out mainnet-observation.json
```

The exit code is deliberately 2: observation alone cannot satisfy a release
gate. No expected genesis hash is guessed. To validate a selected RPC's network
identity, pass an independently established `--expected-genesis` public hash.
`--config` checks an explicit candidate instead of discovery. `--rpc` accepts
HTTPS endpoints, but avoid putting credentials in shell history. Reports omit
the RPC URL. Output creation is exclusive (`wx`), not an overwrite.

A missing/unreachable public RPC does not establish that a deployment or config
is absent. An observed authority public key does not prove the owner can sign.
Matching candidate config bytes does not install or authorize that route.

## Remaining phase 1 gate

Verify the intended live deployment and source/account compatibility, reconcile
the pinned SDK/IDL with the target executable, and demonstrate authority control
before proposing an in-place paid upgrade. Preserve all existing launches. Do
not assume the source `declare_id!` identifies the owner's paid deployment.

## Remaining phase 2

Discover before requesting provisioning. If no valid config exists, prepare the
public request for an authorized Meteora `CreateConfigKey` operator, setting
`pool_creator_authority` to the existing `["meteora_pool_creator"]` Kydos PDA,
dynamic config type and zero permission. A wallet cannot self-grant operator
permission. No operator onboarding or provisioned config is claimed here.

Independently verify finalized configuration bytes, index/PDA, authority and
program identity. Later install a one-time versioned Kydos route using the
verified upgrade-authority arrangement, not the treasury by assumption. Bind
config fingerprint and program identities; no arbitrary destination setter.
Config type Dynamic does not enable volatility fees. Kydos must enforce fixed
100 bps, BothToken, no dynamic fee/schedule/compounding/AlphaVault at pool creation.

## Remaining phase 3

The approved complete migration includes source validation, tracked reserve
isolation, separately sponsored rent/fees, canonical staging and SyncNative,
protected pool creation with PDA signatures, full post-CPI state verification,
permanent lock of all initial liquidity, and a route-versioned successful
receipt. No partial fund-moving handler is delivered by this first gate.

A valid replay must work after pool trading/extra LP deposits and temporary
account cleanup, without moving funds again or requiring the original price.
Reject unreceipted existing destinations. Enforce exactly the canonical initial
position and receipt bindings. Do not require total current mint supply to
remain 1B because holders can burn their own tokens. Do not count unsolicited
balances, rent or the virtual 30 SOL as migration principal.

Runtime tests must execute the built Kydos and version-identified DAMM programs,
including precreation attacks, account substitution, donations/prefunding,
rollback at every CPI boundary, concurrent/replayed migration, integer dust and
complete permanent locking. Measure compute, heap and transaction size. The
existing host tests and builds are not substitutes for this runtime gate.

## Deferred work and release

Atomic fee claiming/burning/50-50 quote payouts, keepers, public UI activation
and mainnet deployment remain outside phases 1-3. No additional tax is introduced.
Base-fee burns and the creator's 50% quote entitlement remain the approved later
settlement policy; no unrestricted raw claim or LP withdrawal should bypass it.
A released migration must not imply those payouts already run automatically.

Do not merge this multi-phase draft as a completed migration until its phase
acceptance gates and exact-head checks have passed. A separate reviewed mainnet
release and measured cost approval are required. Pending external evidence must
be reported explicitly rather than replaced with synthetic test accounts.

## References

- https://solana.com/docs/core/programs/program-deployment
- https://solana.com/docs/core/pda
- https://solana.com/docs/core/cpi
- https://solana.com/docs/tokens/basics/sync-native
- https://docs.meteora.ag/developer-guides/damm-v2/rust-integration/cpi
- `docs/meteora-adapter.md` (historical private-route preparation; its old treasury-only fee policy is superseded)
- `docs/fee-settlement.md` (approved accounting-only settlement foundation)

Source/IDL compatibility and account observations are not a security audit or
proof that any on-chain deployment matches the repository.
