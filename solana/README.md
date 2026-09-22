# Solana program and client configuration

Kydos uses Anchor 0.31.1, Solana CLI 2.1.21 and Rust 1.90.0. The program is
`programs/kydos_launchpad/src/lib.rs`; its browser interface is
`../src/lib/solana/idl/kydos_launchpad.json`.

## Confirmed creation economics

The owner confirmed these values on 2026-09-21. They match the current program
on `main`; do not replace them with the older `astra/latest` values.

| Parameter | Value |
| --- | --- |
| Token standard | Original SPL Token |
| Decimals | 6 |
| Total supply | 1,000,000,000 tokens |
| Curve allocation | 793,100,000 tokens (79.31%) |
| Liquidity allocation | 206,900,000 tokens (20.69%) |
| Virtual SOL reserve | 30 SOL |
| Graduation target | 85 SOL |

Creation mints all supply into the curve-controlled vault, creates Metaplex
metadata from the supplied URI, and revokes mint and freeze authorities.
Liquidity allocation is accounting within that vault, not proof of an external
liquidity pool. The current graduation instruction path sets a flag; it does
not migrate to an external AMM. Client quotes use the same effective reserves
(real curve tokens plus liquidity allocation) as the checked-in program.

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

With the pinned Rust/Anchor/Solana toolchains and a verified local program
keypair/configuration, the on-chain checks are:

```sh
cd solana
cargo test -p kydos_launchpad --test account_validation
anchor build
anchor test --skip-build
```

The JavaScript suite checks RPC transport/cost estimation, confirmation,
configuration consistency and quotes. It does not execute on-chain CPIs.
`creation.test.js` is the separate local-validator suite. Historical handoffs
such as `creation-checkpoint.md` and `implementation-resume.md` describe earlier
snapshots; their scaffold status and old economics are superseded here.
