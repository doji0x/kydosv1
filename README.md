<h1 align="center">Kydos</h1>

<p align="center">
  <b>A mobile-first social memecoin launchpad on the Robinhood chain.</b><br/>
  Launch a token, trade the curve, and talk about it — all in one feed.
</p>

<p align="center">
  <img alt="Chain" src="https://img.shields.io/badge/chain-Robinhood%20(4663)-f2b429" />
  <img alt="Stack" src="https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20Tailwind-0ea5e9" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Base44-6366f1" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-f2b429" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e" />
</p>

---

## Contents

- [What is Kydos](#what-is-kydos)
- [Features](#features)
- [Screens](#screens)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project layout](#project-layout)
- [Data model](#data-model)
- [Backend functions](#backend-functions)
- [Configuration](#configuration)
- [Deployments](#deployments)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## What is Kydos

Kydos is a launchpad that behaves like a social network. Every token has a
bonding-curve market and a native thread, so discovery, trading and conversation
happen in the same vertical, full-bleed mobile feed instead of across three
different apps.

The design brief is deliberately narrow: **if it doesn't work with one thumb on a
390px screen, it doesn't ship.**

## Features

- **Bonding-curve launches** — constant-product curve with virtual reserves, a
  graduation target, and live market cap / price as the curve fills.
- **Social-native trading** — a sticky bottom-sheet trade panel keeps the feed in
  view while you buy or sell.
- **Token threads** — posts, replies, reposts and likes attached to each token.
- **Profiles & follows** — handles, avatars, positions, wallet balance and a
  social activity notification feed derived from likes, follows and replies.
- **Robinhood chain board** — a self-hosted market data layer for tokens trading
  on-chain, with candles, trades and holder distribution.
- **Deployment log** — every publish is tagged as a GitHub Release and rendered
  in-app, alongside a live pull-request board.

## Screens

| Screen | What it does |
| --- | --- |
| **Board** (`/`) | Vertical token feed with trending / graduating / new tabs, search, infinite scroll, plus the Robinhood chain board. |
| **Launch** (`/launch`) | Create a token: name, ticker, art, socials, live curve preview. |
| **Token** (`/token/:id`) | Price chart, curve progress, trade sheet, trades and the token's thread. |
| **Chain token** (`/rh/:address`) | Self-indexed on-chain market data: candles, trades, holders, stats. |
| **Forum** (`/forum`) | Global social feed with composer, replies, reposts and likes. |
| **Profile** (`/profile/:userId`) | Handle, bio, launched tokens, positions and wallet. |
| **Deployments** (`/releases`) | Pull requests and tagged release history straight from GitHub. |

## Architecture

Kydos runs on the Base44 platform: a React front end, JSON-schema entities for
persistence, and server-side backend functions for anything that touches the
chain or a third-party API. No secret ever reaches the browser.

Market data is **self-indexed** rather than pulled from an aggregator:

```
Robinhood RPC ──► indexRhBlockRange ──► RhTrade ──► buildRhCandles ──► RhCandle
                        │                  │
                        ├─► RhPool         └─► computeRhTokenStats ──► RhToken
                        └─► indexRhHolders ──► RhBalance
```

Scheduled workflows poll `eth_getLogs`, venue adapters (Uniswap V2/V3, Rialto)
normalize swaps into a single trade shape, and price, market cap, FDV, candles
and holder stats are all computed locally. Rate limiting is handled with request
pacing, exponential backoff and an automatic public-RPC fallback.

Why self-index? Aggregator APIs rate-limit hard, lag behind new pairs, and go
down at exactly the wrong moment. Owning the pipeline means the board is as fresh
as the chain.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18, Vite, Tailwind CSS, shadcn/ui, framer-motion |
| Charts | Recharts |
| Data | Base44 entities (Token, Trade, Post, Profile, Follow, RhToken, RhTrade, RhCandle …) |
| Server | Base44 backend functions (Deno runtime, web-standard fetch) |
| Chain | Robinhood Chain (Arbitrum Orbit L2, chain id 4663) via JSON-RPC |

## Getting started

The canonical source of truth is the Base44 app; this repository is kept in sync
with it. To run it locally:

```bash
git clone https://github.com/doji0x/kydosv1.git
cd kydosv1
npm install

npm install -g base44@latest
base44 login
base44 link

npm run dev        # Vite dev server
```

Local changes merged into `main` sync back to the Base44 app, where they can be
published.

```bash
npm run build      # production build
npm run lint       # eslint
```

## Project layout

```
src/pages/          route-level screens (Home, Launch, TokenDetail, Forum, Profile …)
src/components/     focused UI components grouped by domain
src/lib/            curve math, formatting, wallet, notifications, contexts
base44/entities/    JSON-schema data models
base44/functions/   server-side handlers (indexing, market data, GitHub)
base44/shared/      shared server modules (RPC, venue adapters, GitHub helper)
base44/workflows/   scheduled and event-driven automations
```

## Data model

| Entity | Purpose |
| --- | --- |
| `Token` | A launched token and its bonding-curve state (reserve, tokens sold, market cap, status). |
| `Trade` | A curve buy or sell, with price and market cap at fill time. |
| `Post` / `PostLike` | Social posts, replies, reposts and likes; posts optionally tag a token. |
| `Profile` / `Follow` | Handles, avatars, bios, wallet balance and the social graph. |
| `RhToken` / `RhPool` | Tracked on-chain tokens and their discovered liquidity pools. |
| `RhTrade` / `RhCandle` | Normalized on-chain swaps and the OHLCV bars rolled up from them. |
| `RhBalance` / `RhCursor` / `RhRefPrice` | Holder balances, indexer checkpoints and quote-asset USD prices. |

## Backend functions

| Function | Role |
| --- | --- |
| `discoverRhPools` | Finds liquidity pools for tracked tokens on-chain. |
| `indexRhBlockRange` | Polls swap logs and normalizes them into `RhTrade`. |
| `indexRhHolders` | Accumulates holder balances from Transfer logs. |
| `buildRhCandles` | Rolls trades up into OHLCV bars. |
| `computeRhTokenStats` | Computes price, market cap, FDV, volume and change windows. |
| `refreshRhRefPrice` | Refreshes quote-asset USD reference prices. |
| `getRhTrending` / `getRhToken` / `getRhCandles` / `getRhTrades` / `getRhHolders` | Read APIs for the front end. |
| `createGithubRelease` / `listGithubReleases` / `listGithubPullRequests` / `commitRepoFiles` | Repository and deployment integration. |

## Configuration

| Secret | Purpose |
| --- | --- |
| `RH_RPC_URL` | Private Robinhood Chain RPC endpoint used by the indexer (falls back to the public endpoint). |
| `GH_REPO` | Optional `owner/repo` override for the deployment release log. |

## Deployments

Publishing the app triggers a workflow that creates a tagged GitHub Release
(`vYYYYMMDD-HHMM`) containing the publish metadata and the commits landed since
the previous release, with a compare link. The in-app **Deployments** page reads
those releases — and the repository's open pull requests — back through the
GitHub API, so release history is browsable without leaving Kydos.

## Roadmap

- [ ] On-chain settlement for curve trades
- [ ] Live holder distribution on launched tokens
- [ ] Push notifications for social activity
- [ ] Creator fee sharing and referral rewards
- [ ] Public API for the self-indexed market data

## FAQ

**Is this financial advice or an audited product?** No. Kydos is experimental
software for launching and trading highly speculative assets. Assume you can lose
everything you put in.

**Why the Robinhood chain?** It is a low-fee Arbitrum Orbit L2 with a young token
ecosystem — the right size for a launchpad to matter.

**Can I self-host it?** The front end is standard React + Vite, but persistence,
auth and backend functions run on Base44, so a full self-host means replacing
that layer.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? Please follow [SECURITY.md](SECURITY.md) and do not open a
public issue.

## Disclaimer

Kydos is provided as is, with no warranty of any kind. Nothing here is financial
advice. Memecoins are volatile and frequently go to zero. Do your own research.

## License

[MIT](LICENSE) © Kydos contributors
