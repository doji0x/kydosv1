# Protected Kydos migration: approved phases 1-3

## Authority and scope

The owner approved development preserving Kydos creation and its custom curve,
verifying a protected DAMM v2 route, and implementing complete atomic migration.
No mainnet deployment, replacement program, DBC, tokenomics change, secret
handling or paid transaction is authorized merely by this development approval.

PR #32 delivered read-only evidence and compatibility tooling and merged at
`63b2f51a6e2fb173326e9aa9c384ac2abf375e5a`. PR #33 continues on
`codex/protected-route-installation`. It implements route installation, NOT
complete graduation. The original compatibility baseline remains
`3cce2ed02ac94d3951db33b3a67725182d8d7597`.

Keep 1B original supply, six decimals, 793.1M curve / 206.9M migration allocation,
existing program ID, Curve/FeePolicy layouts, buy/sell math, treasury and existing
instruction/error definitions. The allocation supersedes older 800M/200M notes.
Do not restore mint/freeze authority or replace existing launches.

## Phase 1: evidence already delivered

`solana/scripts/protected-migration/evidence.mjs` validates loader-v3 observations,
config layout/authority/permission/PDA and public hashes. `inspect.mjs` permits
only read-only RPC methods, uses finalized observations and produces explicit
blockers. `compatibility.mjs` rejects changes to existing source/interfaces while
allowing identified additive module/dispatcher additions. The 39 original tests
cover malformed inputs, immutable programs, bytecode padding, key encoding,
cluster mismatch and write-method rejection. Do not repeat that implementation.

Mainnet observation job 111299944380 in run 37156192684 found the declared Kydos
program executable and upgradeable, observed slot 453058242 on 2026-10-03T21:45Z:

- Program: `GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE`
- ProgramData: `HkAvMhKsTaB99iniJ9vqpZJ86Nm2Csu5Mm63tU2VwVQk`
- Deployment slot: 450014937
- Recorded authority: `6AK3h1s6byYRaDjNue8rMV1nqu8Q94AawPVVwNk7Phqc`
- Derived creator authority: `3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd`
- Protected config candidates in the scanned pinned layout: none.

This resolves the earlier unavailable-mainnet-log issue. It does not prove
signer control, independent genesis pinning or repository/deployed bytecode
parity. An inaccessible RPC is not evidence of absence. Source declare_id alone
was not used as proof of deployment. Authority control and bytecode parity must
be established before a paid release.

Read-only usage from repository root:

```
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix solana run test:protected
npm --prefix solana run check:compatibility
node solana/scripts/protected-migration/inspect.mjs --cluster mainnet-beta --out mainnet-observation.json
```

Exit 2 intentionally means observations cannot authorize release. Supply an
independently established `--expected-genesis` to pin RPC network identity.
`--config` verifies an explicit candidate. Reports omit RPC URLs; do not put
credentials in shell history. Output uses exclusive creation, not overwrite.

## Phase 2: actual route installer

`protected_migration.rs` adds `install_migration_route` and a new 287-byte
`MigrationRoute` account at `["migration_route"]`. Installation requires a signer
matching the current upgrade authority in the authenticated Kydos loader-v3
ProgramData. Its key is not assumed to be the treasury or hardcoded from a past
observation. The signer also sponsors route account rent.

The installer verifies Kydos and DAMM program IDs, executable flags, loader
owners, ProgramData PDA/pointers, loader tags, bounded layouts and ELF headers.
It rejects a missing/immutable Kydos upgrade authority and unexpected remaining
accounts. It derives `["meteora_pool_creator"]` under the existing Kydos ID and
uses the existing private-dynamic config validator to check authority, config
PDA/index, discriminator/length, no AlphaVault and zero permissions.

The route records the full config hash, canonical DAMM ProgramData and deployment
slot, fixed quote mint/treasury, installing authority, installation slot and
policy versions. Fixed policy is 100 bps BothToken, permanent lock, and the
approved later settlement identity. These fields do not create a pool or enforce
burns/payouts by themselves. Future pool creation must also enforce no changing
fee schedule, dynamic fee, compounding or AlphaVault.

There is no update, close, sweep, migrate or raw fee-claim instruction in this
module. `validate_route` is a reusable guard for FUTURE fresh migration and is
not yet called by a fund-moving handler. It checks route identity/policy, config
fingerprint and DAMM deployment-slot continuity. Changed config bytes or a DAMM
upgrade fail closed. Slot binding is a change detector, not source/binary proof;
an upgrade in the same slot is a limitation. A later route-version recovery
requires explicit review and must not reset successful migration receipts.

Do not apply fresh-route/version checks to successful-receipt replay in a way
that makes completed migrations inaccessible after routine pool trading or
upstream upgrades. Historical receipts must be authenticated independently.

### Protected configuration request - draft, not submitted

Request an authorized Meteora operator with CreateConfigKey to provision a
Dynamic configuration for mainnet-beta:

```
Kydos program: GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE
DAMM v2 program: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
pool_creator_authority: 3tGjXG9oGyRDS3ppv1QsCNvYgr5XtAizKe75XcyHxuAd
permission: 0
index: unused u64 selected by authorized operator
```

Ask for finalized creation signature, config address/index and operator identity.
Re-derive every address and verify actual account bytes/cluster before signing
installation. No private key or seed phrase is needed in that public request.
No request was submitted, config provisioned or mainnet route installed here.
The installer must be in an approved program upgrade before it can be used live.
A Dynamic config governs creator authority; Kydos supplies/enforces fee parameters
when initializing a pool. It does not mean volatility-based fees are enabled.

### Tests and interface evidence

Four new Rust host tests cover signer/loader authority, malformed account
layouts, route serialization and changed route/config/deployment rejection.
The local-validator harness executes the built Kydos installer on fixed loopback
ports with ephemeral keys. It asserts all 14 checks execute: IDL parity,
unauthorized signer, wrong/private-public config authority, permissions/type,
substituted config owner/address or ProgramData, unexpected accounts, rollback
AFTER successful route execution, valid prefunded-route installation, and
repeat-install rejection. Unique transaction messages prevent signature replay
from being confused with a second successful execution. Confirmed transaction
metadata, not a preflight exception, proves each transaction ran.

The DAMM test binary is fetched from SDK revision
`37cd9e690d7b5fb6182638a21b86e0e1bf636a7e`, Git blob
`946562cfc35b978dbaf1100363b7505b018fd6f6`. It is loaded for executable/loader
validation only; the installer does not CPI into DAMM. Configs are synthetic
local genesis accounts, NOT operator-provisioned mainnet accounts.

Initial Anchor run 37157451897 passed host tests, SBF and IDL generation. Runtime
caught an invalid negative fixture: an unknown `permission` field was ignored
by the pinned coder. The corrected fixture sets actual encoded bytes at 248;
program validation was not relaxed. The checked-in IDL is normalized from the
actual compiler artifact 11286800097 and preserves every old definition.
IDL blob `df514227a2853d4810e5588291161509492d92e5`; SHA256
`4550206550e25eb408f11af711eb0bd6841a46cd2d5b9b0506703c7d38363776`.
The strict fresh-build comparison remains required. Corrected-head CI must be
inspected separately; no complete runtime pass is claimed by the initial run.
Local environment lacks Rust/Anchor/validator tools; executed results come from
identified CI runs, not a claimed local full suite.

## Phase 3: still unfinished

Complete atomic migration must authenticate the completed Curve/FeePolicy,
isolate tracked principal from donations/rent, sponsor execution separately,
prepare canonical staging and SyncNative, create the protected pool with PDA
signatures, verify all post-CPI state and deposits, permanently lock all initial
liquidity, and only then write a route-versioned successful receipt.

Replay must work after trading, extra LP deposits and temporary-account cleanup
without retransferring principal or requiring the initial price. Reject occupied
unreceipted destinations. Holders may burn their own tokens: do not require
current supply to stay exactly 1B. Never migrate virtual SOL or donations.

Runtime tests must execute Kydos -> DAMM -> token instructions and cover every
CPI failure boundary, precreation attacks, account substitution, donations,
concurrent/repeated requests, integer dust and complete locking. Measure compute,
heap, stack and transaction size. Installer tests are not migration tests.

## Deferred settlement and release

Later atomic fee claiming burns newly claimed base and splits net quote equally
between recorded creator and Kydos. Keepers, public UI activation and mainnet
release are separate work. No additional tax, raw-claim bypass or LP withdrawal.

PR #33 is a bounded route-installation delivery, not completion of all phases.
Review exact-head checks and code before merge. A paid upgrade/live route install
requires separately verified config, authority control, bytecode compatibility
and owner release approval. No public-network transaction was performed.

## References

- https://solana.com/docs/core/programs/program-deployment
- https://solana.com/docs/core/pda
- https://solana.com/docs/core/cpi
- https://solana.com/docs/tokens/basics/sync-native
- https://docs.meteora.ag/developer-guides/damm-v2/rust-integration/cpi
- `docs/meteora-adapter.md`: historical adapter; old treasury-only fee custody is superseded.
- `docs/fee-settlement.md`: approved burn / equal quote accounting.

Source/IDL compatibility, observations and local fixtures are not a security
audit or proof that deployed programs match the repository.
