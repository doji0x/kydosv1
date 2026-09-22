# Solana program and client configuration

Kydos uses Anchor 0.31.1, Solana CLI 2.1.21 and Rust 1.90.0. The program is
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
| Completion | Real curve inventory exhausted; approximately 85.005 SOL |

Creation mints all supply into the curve-controlled vault, creates Metaplex
metadata from the supplied URI, and revokes mint and freeze authorities.
Liquidity allocation is accounting within that vault, not proof of an external
liquidity pool. Completion sets the existing `graduated` flag and stops curve trading while
awaiting migration. It does not create an AMM pool. Rust and JavaScript use
real SOL + 30 SOL and real curve tokens + 279.9M virtual token offset. Final
buys charge only the rounded-up cost of remaining inventory. Legacy curve
configurations are rejected, not silently repriced.

`programs/kydos_amm` contains a compiling account/interface scaffold with source-bound
pool derivation and migration receipt types. It has no deployable entrypoint,
program ID, executable migration or swaps yet.

## Program identity and network boundaries

The checked-in program address is
`Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2` in Rust, Anchor.toml, the client
IDL and the admin launch function. Configuration tests detect divergence.
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
cargo test --workspace --lib
cargo test -p kydos_launchpad --test account_validation
```

The JavaScript suite checks RPC transport/cost estimation, confirmation,
configuration consistency and quotes. It does not execute on-chain CPIs.
`creation.test.js` is the separate local-validator suite; its old economics
assertions must be refreshed when that work resumes. Token-creation/validator
tests are explicitly deferred until AMM and graduation are resolved.
CI additionally runs `anchor build --program-name kydos_launchpad`; a host
build alone is not proof of SBF build or deployment readiness. Historical handoffs
such as `creation-checkpoint.md` and `implementation-resume.md` describe earlier
snapshots; their scaffold status and old economics are superseded here.
