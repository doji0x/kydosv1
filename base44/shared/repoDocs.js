// Canonical documentation files committed to the Kydos GitHub repository.
export const README = `<h1 align="center">Kydos</h1>

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
| **Board** (\`/\`) | Vertical token feed with trending / graduating / new tabs, search, infinite scroll, plus the Robinhood chain board. |
| **Launch** (\`/launch\`) | Create a token: name, ticker, art, socials, live curve preview. |
| **Token** (\`/token/:id\`) | Price chart, curve progress, trade sheet, trades and the token's thread. |
| **Chain token** (\`/rh/:address\`) | Self-indexed on-chain market data: candles, trades, holders, stats. |
| **Forum** (\`/forum\`) | Global social feed with composer, replies, reposts and likes. |
| **Profile** (\`/profile/:userId\`) | Handle, bio, launched tokens, positions and wallet. |
| **Deployments** (\`/releases\`) | Pull requests and tagged release history straight from GitHub. |

## Architecture

Kydos runs on the Base44 platform: a React front end, JSON-schema entities for
persistence, and server-side backend functions for anything that touches the
chain or a third-party API. No secret ever reaches the browser.

Market data is **self-indexed** rather than pulled from an aggregator:

\`\`\`
Robinhood RPC ──► indexRhBlockRange ──► RhTrade ──► buildRhCandles ──► RhCandle
                        │                  │
                        ├─► RhPool         └─► computeRhTokenStats ──► RhToken
                        └─► indexRhHolders ──► RhBalance
\`\`\`

Scheduled workflows poll \`eth_getLogs\`, venue adapters (Uniswap V2/V3, Rialto)
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

\`\`\`bash
git clone https://github.com/doji0x/kydosv1.git
cd kydosv1
npm install

npm install -g base44@latest
base44 login
base44 link

npm run dev        # Vite dev server
\`\`\`

Local changes merged into \`main\` sync back to the Base44 app, where they can be
published.

\`\`\`bash
npm run build      # production build
npm run lint       # eslint
\`\`\`

## Project layout

\`\`\`
src/pages/          route-level screens (Home, Launch, TokenDetail, Forum, Profile …)
src/components/     focused UI components grouped by domain
src/lib/            curve math, formatting, wallet, notifications, contexts
base44/entities/    JSON-schema data models
base44/functions/   server-side handlers (indexing, market data, GitHub)
base44/shared/      shared server modules (RPC, venue adapters, GitHub helper)
base44/workflows/   scheduled and event-driven automations
\`\`\`

## Data model

| Entity | Purpose |
| --- | --- |
| \`Token\` | A launched token and its bonding-curve state (reserve, tokens sold, market cap, status). |
| \`Trade\` | A curve buy or sell, with price and market cap at fill time. |
| \`Post\` / \`PostLike\` | Social posts, replies, reposts and likes; posts optionally tag a token. |
| \`Profile\` / \`Follow\` | Handles, avatars, bios, wallet balance and the social graph. |
| \`RhToken\` / \`RhPool\` | Tracked on-chain tokens and their discovered liquidity pools. |
| \`RhTrade\` / \`RhCandle\` | Normalized on-chain swaps and the OHLCV bars rolled up from them. |
| \`RhBalance\` / \`RhCursor\` / \`RhRefPrice\` | Holder balances, indexer checkpoints and quote-asset USD prices. |

## Backend functions

| Function | Role |
| --- | --- |
| \`discoverRhPools\` | Finds liquidity pools for tracked tokens on-chain. |
| \`indexRhBlockRange\` | Polls swap logs and normalizes them into \`RhTrade\`. |
| \`indexRhHolders\` | Accumulates holder balances from Transfer logs. |
| \`buildRhCandles\` | Rolls trades up into OHLCV bars. |
| \`computeRhTokenStats\` | Computes price, market cap, FDV, volume and change windows. |
| \`refreshRhRefPrice\` | Refreshes quote-asset USD reference prices. |
| \`getRhTrending\` / \`getRhToken\` / \`getRhCandles\` / \`getRhTrades\` / \`getRhHolders\` | Read APIs for the front end. |
| \`createGithubRelease\` / \`listGithubReleases\` / \`listGithubPullRequests\` / \`commitRepoFiles\` | Repository and deployment integration. |

## Configuration

| Secret | Purpose |
| --- | --- |
| \`RH_RPC_URL\` | Private Robinhood Chain RPC endpoint used by the indexer (falls back to the public endpoint). |
| \`GH_REPO\` | Optional \`owner/repo\` override for the deployment release log. |

## Deployments

Publishing the app triggers a workflow that creates a tagged GitHub Release
(\`vYYYYMMDD-HHMM\`) containing the publish metadata and the commits landed since
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
`;

export const LICENSE = `MIT License

Copyright (c) 2026 Kydos contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export const CONTRIBUTING = `# Contributing to Kydos

Thanks for taking the time to contribute. Kydos is a mobile-first social
memecoin launchpad, and contributions of every size are welcome.

## Ground rules

- **Mobile first.** Every change must look and feel right at a 390–440px
  viewport before anything else.
- **Small, focused files.** Components stay short and live in their own file
  under \`src/components/<domain>/\`.
- **Design tokens only.** Use the semantic Tailwind classes backed by the tokens
  in \`src/index.css\` — no hardcoded hex values or inline font families.
- **Secrets stay server-side.** Anything touching an API key or the chain belongs
  in a backend function under \`base44/functions/\`.
- **No new market-data dependencies.** Chain data is self-indexed on purpose;
  prefer extending the indexer over adding a third-party aggregator.

## Development setup

\`\`\`bash
git clone https://github.com/doji0x/kydosv1.git
cd kydosv1
npm install
npm run dev
\`\`\`

Before opening a pull request:

\`\`\`bash
npm run lint
npm run build
\`\`\`

## Commit convention

Commit subjects are imperative, lower-case and scoped, because they become the
release changelog:

\`\`\`
add holder distribution chart
fix curve rounding on small buys
docs: expand indexer architecture notes
\`\`\`

## Workflow

1. Fork the repository and create a branch: \`git checkout -b feature/my-change\`.
2. Keep commits scoped and messages meaningful.
3. Verify the affected flows end to end — launching, trading, posting, profile.
4. Open a pull request describing what changed, why, and how you verified it.
   Screenshots or a short screen recording at a mobile viewport are appreciated.

Pull requests are squash-merged into \`main\`, which syncs back to the Base44 app
and is then published.

## Reporting bugs

Open an issue with the steps to reproduce, the expected and actual behavior, the
device/viewport, and a screenshot where relevant.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). Be direct, be
kind, and assume good faith.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](LICENSE).
`;

export const SECURITY = `# Security Policy

## Supported versions

Kydos is a continuously deployed application. Only the currently deployed
release — the most recent tag on the [Releases](../../releases) page — is
supported.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](../../security/advisories/new) on this
repository. Include:

- a description of the issue and its impact,
- the steps or proof of concept needed to reproduce it,
- any affected contract address, endpoint, or route.

We aim to acknowledge reports within 72 hours and to ship a fix or a mitigation
plan before any public disclosure. Please give us a reasonable window to remediate
before disclosing publicly.

## Scope

In scope: this application's front end, its backend functions, and the
Robinhood Chain indexing pipeline.

Out of scope: third-party infrastructure (the Base44 platform, RPC providers,
GitHub), and issues that require a compromised user device or browser extension.
`;

export const CODE_OF_CONDUCT = `# Code of Conduct

## Our pledge

We pledge to make participation in Kydos a harassment-free experience for
everyone, regardless of age, body size, disability, ethnicity, gender identity
and expression, level of experience, nationality, personal appearance, race,
religion, or sexual identity and orientation.

## Our standards

Examples of behavior that contributes to a positive environment:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Giving and gracefully accepting constructive feedback
- Focusing on what is best for the project and its users

Examples of unacceptable behavior:

- Harassment, insults, or derogatory comments, public or private
- Publishing others' private information without permission
- Sexualized language or imagery, and unwelcome sexual attention
- Shilling, spam, or coordinated market manipulation in project spaces
- Any other conduct that would reasonably be considered inappropriate

## Enforcement

Maintainers are responsible for clarifying these standards and may remove, edit,
or reject comments, commits, code, issues, and other contributions that do not
align with this Code of Conduct, or temporarily or permanently ban any
contributor for behavior they deem inappropriate.

Report unacceptable behavior privately to the maintainers through GitHub. All
reports are reviewed and investigated, and reporters' privacy is respected.

## Attribution

Adapted from the [Contributor Covenant](https://www.contributor-covenant.org),
version 2.1.
`;

export const PR_TEMPLATE = `## What changed

<!-- A short summary of the change. -->

## Why

<!-- The problem this solves, or the issue it closes (Closes #123). -->

## How it was verified

<!-- Flows exercised: launching, trading, posting, profile, chain board … -->

## Screenshots

<!-- Mobile-viewport screenshots or a short recording for any UI change. -->

## Checklist

- [ ] Looks and works correctly at a 390–440px viewport
- [ ] Uses design tokens — no hardcoded colors or font families
- [ ] No secrets or API keys in front-end code
- [ ] \`npm run lint\` and \`npm run build\` pass
- [ ] No new third-party market-data dependency
`;

export const BUG_TEMPLATE = `---
name: Bug report
about: Something is broken in Kydos
labels: bug
---

**What happened**

**What you expected**

**Steps to reproduce**

1.
2.
3.

**Where**

- Screen / route:
- Device and viewport:
- Browser:

**Screenshot or recording**
`;

export const FEATURE_TEMPLATE = `---
name: Feature request
about: Suggest an idea for Kydos
labels: enhancement
---

**The problem**

<!-- What is hard or missing today? -->

**The proposal**

<!-- What should Kydos do instead? -->

**Why it matters**

<!-- Who benefits, and how does this fit a mobile-first social launchpad? -->

**Alternatives considered**
`;

export const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    name: Lint and build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run build
`;

export const FILES = [
  { path: "README.md", content: README, message: "docs: expand project README" },
  { path: "LICENSE", content: LICENSE, message: "chore: add MIT license" },
  { path: "CONTRIBUTING.md", content: CONTRIBUTING, message: "docs: add contributing guide" },
  { path: "SECURITY.md", content: SECURITY, message: "docs: add security policy" },
  { path: "CODE_OF_CONDUCT.md", content: CODE_OF_CONDUCT, message: "docs: add code of conduct" },
  {
    path: ".github/PULL_REQUEST_TEMPLATE.md",
    content: PR_TEMPLATE,
    message: "chore: add pull request template",
  },
  {
    path: ".github/ISSUE_TEMPLATE/bug_report.md",
    content: BUG_TEMPLATE,
    message: "chore: add bug report template",
  },
  {
    path: ".github/ISSUE_TEMPLATE/feature_request.md",
    content: FEATURE_TEMPLATE,
    message: "chore: add feature request template",
  },
];