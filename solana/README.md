# Solana program and client configuration

Kydos uses Anchor 0.31.1, Solana CLI 2.1.21 and host Rust 1.90.0. Solana's
separate SBF platform-tools v1.43 compiler uses Rust/Cargo 1.79; updating the host
compiler does not update it. The program is
`programs/kydos_launchpad/src/lib.rs`; its browser interface is
`../src/lib/solana/idl/kydos_launchpad.json`.

## Confirmed creation economics

The owner confirmed these values on 2026-09-21. The allocation and virtual SOL values are preserved in this branch.
The curve math and completion policy are specified in [the build specification](../docs/launchpad-build-spec.md).

| Parameter | Value |
| --- | --- |
| Token standard | Original SPL Token |
| Decimals | 6 |
| Total supply | 1,000,000,000 tokens |
| Curve allocation | 793,100,000 tokens (79.31%) |
| Liquidity allocation | 206,900,000 tokens (20.69%) |
| Virtual SOL reserve | 30 SOL |
| Initial virtual token reserve | 1,073,000,000 tokens |
| Completion | Real curve inventory exhausted; approximately 85.005 SOL net reserves |
| Curve trading fee | 1% of gross SOL, rounded up to a lamport, all to Kydos treasury |
| Treasury | `5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg` |

Creation mints all supply into the curve-controlled vault, creates Metaplex
metadata from the supplied URI, and revokes mint and freeze authorities.
Liquidity allocation is accounting within that vault, not proof of an external
liquidity pool. Completion sets the existing `graduated` flag and stops curve trading while
awaiting migration. It does not create an AMM pool. Rust and JavaScript use
real SOL + 30 SOL and real curve tokens + 279.9M virtual token offset. Final
buys charge only the rounded-up cost of remaining inventory. A buy limit includes the fee; sell output and slippage refer to wallet SOL after
fees. Fees never enter tracked curve reserves. New markets also initialize the
76-byte `[fee_policy, curve]` PDA. Unsupported policies and old markets without a
policy are rejected. Existing deployed accounts need an explicit rollout plan.

`programs/kydos_amm` contains a compiling account/interface scaffold with source-bound
pool derivation and migration receipt types. It has no deployable entrypoint,
program ID, executable migration or swaps yet. It is no longer the destination.
The compatible DAMM v2 adapter foundation lives in launchpad `meteora.rs` and
`migration.rs`, with offline client preparation in `src/lib/solana/meteora.js`.
See [the adapter contract](../docs/meteora-adapter.md). It supplies SDK-checked
instruction construction, private-config validation, custody addresses, seed
calculations and a proposed receipt body. Executable migration, pool verification,
position locking and fee claims remain subsequent work.

## Program identity and network boundaries

For a reproducible mainnet keypair, ID update, build and deployment, follow the [mainnet deployment runbook](docs/deployment.md). Do not deploy from the app preview.

The checked-in program address is
`Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2` in Rust, Anchor.toml, the client
IDL and `base44/shared/solanaProtocol.js`, used by the admin launcher and indexer. Configuration tests detect divergence.
Matching addresses do not establish a deployment or control of its keypair.
Do not generate an unrelated keypair and assume it matches this address.

`Anchor.toml` deliberately uses **localnet** for development and validator tests.
Its mainnet validator URL is the source for cloning Metaplex into localnet,
not a mainnet deployment target. `config/localnet.example.json` is likewise
local-only and is not used by the hosted browser application.

The hosted application uses `mainnetConnection()` and authenticated Base44
`solanaRpc` calls, backed by the server-only `HELIUS_RPC_URL`. Set that secret
for the intended cluster; the function name alone does not verify chain identity.
The `.invalid` browser URL is a placeholder intercepted by the custom HTTP
fetch adapter, not an actual endpoint. Transaction confirmation polls HTTP
status/history and block height; it must not open a WebSocket to that URL.

A funded launch still requires a matching verified program deployment, runtime
configuration and the outstanding spending/readiness safeguards. This change
neither deploys the program nor authorizes funded tests. No private RPC URL or
signing key belongs in browser configuration.

## Launch form and public metadata

The launch form accepts an image, name, ticker, optional description and an
optional initial buy (default 0 SOL). Advanced options retain a manually supplied
HTTPS/IPFS/Arweave URI and slippage setting (default 1%).

Configure **PINATA_JWT** in Base44's server secret manager and deploy the
`launchMetadata` function to enable image uploads. The Pinata credential needs
`org:files:write`; it must never be a `VITE_*` variable. The authenticated endpoint
issues image-only upload URLs valid for 60 seconds, restricted to the declared
file size (maximum 5 MB) and PNG/JPEG/WebP type. Metadata JSON is constructed and
uploaded on the server; only public IPFS URIs are used by the launch. Metadata
contains name, symbol, description and the image's IPFS URI. Keep the pinned
files available; a content address alone is not a permanence guarantee.

Uploads occur before wallet signing. Rejecting a launch leaves uploaded files
in storage. The browser reuses the uploaded image/metadata while the form is
unchanged, including after wallet rejection. No private keys or signed transaction
bytes are sent to the upload endpoint.

Review reads the actual RPC genesis hash (mainnet/devnet supported) and checks
that the configured Kydos and Metaplex programs are executable. It displays
the wallet's native SOL balance on that network, purchase input, included 1%
fee, net curve purchase, rent (including FeePolicy), the separate Metaplex
metadata creation fee, network fee and estimated/minimum tokens. Metaplex's
creation levy is `getMinimumBalanceForRentExemption(1308) + 5440` lamports,
in addition to metadata account rent; it is not a fixed 0.01 SOL charge.
The same mint and
instructions are retained for signing; fresh fees/balance and network are checked
again. An increased total requires another review. Executable-account checks do
not verify that the deployed program binary matches the reviewed source.

Creation plus an optional buy uses one transaction: compute limit, initialize,
creator ATA creation, buy. Zero buy omits the last two instructions. The wallet
signs once after the mint's partial signature. Packet size is checked before
signing; the client never splits the transaction. The 600,000-CU limit is an
execution ceiling, not a measured requirement; no priority fee is added here.
Before opening Phantom, the client simulates the complete legacy message on
the submission RPC with `sigVerify: false`. This is an unsigned, read-only
precheck; it does not replace signature verification or send-time preflight.
Simulation errors prevent wallet signing and leave the launch unsubmitted.
Phantom's connected account and fee payer are checked before and after approval.
Deploy the updated `solanaRpc` function/shared allowlist together with the frontend
so the authenticated proxy accepts `simulateTransaction`.

Phantom must run in a standalone HTTPS/localhost page, not an iframe preview.
Changing Phantom's displayed cluster does not reconfigure HELIUS_RPC_URL. Local
validator suites remain separate from this mainnet/devnet UI.

`AccountNotFound` ("Attempt to debit an account but found no record of a prior
credit") is a transaction-level funding error. Check the fee payer's native SOL
on the actual RPC network; no WSOL account is required for this creation path.
If app simulation passes but Phantom reports this error, verify its account and
selected network match the launch review. Failed app simulations and funding
errors from Phantom identify the payer, network and last checked SOL balance.

The public RPC checks on 2026-09-22 found no account at the configured Kydos
address `Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2` on mainnet (slot
449384808) or devnet (slot 502433751). A verified deployment and matching IDL/
program identity are still prerequisites for live launches. The admin launcher now validates the server wallet, funding and deployment, includes FeePolicy, and preserves submission receipts. See [rollout and indexing setup](../docs/launch-and-chart-rollout.md).

## Checks

From the repository root, install the locked dependencies and run:

```sh
npm ci --ignore-scripts
npm --prefix solana run check
npm --prefix solana test
npm run lint
npm run typecheck
npm run build
```

Host checks (no validator or token creation):

```sh
cd solana
cargo test --workspace --lib --locked
cargo test -p kydos_launchpad --test account_validation --test meteora_adapter --locked
```

Build the SBF program and generate its IDL without deploying or creating tokens:

```sh
anchor build --program-name kydos_launchpad --no-idl -- -- --locked
anchor idl build --program-name kydos_launchpad --out target/idl/kydos_launchpad.json --out-ts target/types/kydos_launchpad.ts -- --locked
node scripts/sync-idl.mjs
node scripts/sync-idl.mjs --check
```

Run these commands from `solana/`. Anchor 0.31.1 passes arguments through
`cargo build-sbf` to `cargo build`, so the SBF command needs two separators.
IDL generation invokes `cargo test` directly and needs one. Keep these as
separate commands so `--locked` reaches Cargo in both cases. The sync script uses
Anchor's camelCase conversion for the browser account coder without making an
RPC request. Commit the synchronized IDL; CI rejects drift from the generated
program interface, including accounts and fee events.

The committed lockfile pins compatible versions of `blake3` (1.5.5),
`proc-macro-crate` (3.3.0), `indexmap` (2.7.1), `zeroize` (1.8.1),
`zeroize_derive` (1.4.2) and `unicode-segmentation` (1.12.0). Newer versions
had pulled in Rust 2024 manifests or a Rust requirement beyond the SBF compiler.
Preserve the lockfile and verify intentional dependency updates with the SBF
build as well as host tests. CI checks that the lockfile stays unchanged and
uploads only the program binary, IDL and TypeScript definitions.

`npm --prefix solana test` also regenerates the expected DAMM instruction bytes,
account metas, config layout and seed vectors in memory using the pinned
`@meteora-ag/cp-amm-sdk` 1.4.10 dev dependency, then rejects fixture drift. For an
intentional reviewed SDK update, use `node solana/scripts/meteora-fixtures.mjs --write`
from the repository root and recheck both Rust and JavaScript parity. The SDK and
high-precision Decimal oracle are test-only; the browser uses integer arithmetic.

The official Solana 2.1.21 Linux archive contains an empty `sdk/sbf/syscalls.txt`,
which causes its build checker to warn about known Solana syscalls. The 12
symbols reported by this build are registered in
[Agave 2.1.21's runtime](https://github.com/anza-xyz/agave/blob/v2.1.21/programs/bpf_loader/src/syscalls/mod.rs).
That warning and Anchor's existing macro warnings remain; compilation does not
establish runtime or deployment readiness.

The JavaScript suite checks RPC transport/cost estimation, confirmation,
configuration consistency and quotes. It does not execute on-chain CPIs.
`creation.test.js` is the separate local-validator suite; its policy account
wiring and economics are updated but have not been executed. Token-creation/validator
tests are explicitly deferred until AMM and graduation are resolved.
CI runs both locked build commands above and requires nonempty outputs; a host
build alone is not proof of SBF build or deployment readiness. Historical handoffs
such as `creation-checkpoint.md` and `implementation-resume.md` describe earlier
snapshots; their scaffold status and old economics are superseded here.