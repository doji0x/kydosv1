# Kydos

**Kydos is a mobile-first, Solana-native social memecoin launchpad.**

Launch with Phantom, trade a constant-product bonding curve, follow market activity, and discuss tokens in one application.

## Current direction

Kydos targets Solana exclusively. The active implementation uses Anchor programs, Solana Web3, SPL Token, Phantom wallet interaction, and Helius-backed RPC/indexing services. The previous EVM implementation is retained under `archive/` for historical reference and is not part of the active product.

## Core product

- Solana token creation and market initialization
- Phantom-only signing for launch and trading flows
- Constant-product bonding curve with explicit slippage limits
- One-billion-token launch supply: 79.31% curve allocation and 20.69% liquidity allocation; 30 virtual SOL and inventory-based completion (approximately 85.005 SOL); see [the build specification](docs/launchpad-build-spec.md)
- Persistent transaction recovery and confirmed-state refreshes
- Helius transaction parsing and history ingestion
- Social posts, replies, likes, follows, profiles, and token discussion
- Astra-assisted repository operations with durable checkpoints

## Architecture

`Phantom -> React/Vite client -> Anchor instructions -> Solana program`

`Helius RPC/indexing -> Base44 functions -> Base44 entities -> market and activity views`

The on-chain workspace lives in `solana/`. Client adapters live in `src/lib/solana/`; Solana pages live in `src/pages/SolanaLaunch.jsx` and `src/pages/SolanaMarket.jsx`.

## Local development

1. Install dependencies with `npm install`.
2. Configure a local Solana validator and Anchor toolchain using `solana/README.md`.
3. Set the required Solana and Helius environment values through the platform secret manager.
4. Run the web app with `npm run dev`.
5. Connect Phantom with disposable local-development funds.

The checked-in Solana UI is intentionally explicit about confirmed state, stale quotes, slippage, and transaction recovery. Do not treat local-validator behavior as production readiness.

## Repository map

- `solana/` — Anchor program, tests, configuration, and deployment notes
- `src/lib/solana/` — client instructions, market math, activity recovery, and configuration
- `src/pages/SolanaLaunch.jsx` — token creation flow
- `src/pages/SolanaMarket.jsx` — market state and trading flow
- `base44/functions/solanaRpc/` — bounded Solana RPC access
- `base44/functions/indexSolanaTransactions/` — Helius-backed transaction indexing
- `docs/` — active Solana architecture and delivery documentation
- `archive/` — deprecated Robinhood-chain implementation, preserved but inactive

## Security

Never commit private keys or API credentials. Keep wallet checks, account validation, slippage bounds, authority validation, and transaction confirmation logic intact. Review `SECURITY.md` before contributing.

## License

MIT — see `LICENSE`.
