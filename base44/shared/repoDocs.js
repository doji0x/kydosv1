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
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e" />
</p>

---

## Contents

- [What is Kydos](#what-is-kydos)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Configuration](#configuration)
- [Deployments](#deployments)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## What is Kydos

Kydos is a launchpad that behaves like a social network. Every token has a
bonding-curve market and a native thread, so discovery, trading and conversation
happen in the same vertical, full-bleed mobile feed instead of across three
different apps.

## Features

- **Bonding-curve launches** — constant-product curve with virtual reserves, a
  graduation target, and live market cap / price as the curve fills.
- **Social-native trading** — a sticky bottom-sheet trade panel keeps the feed in
  view while you buy or sell.
- **Token threads** — posts, replies, reposts and likes attached to each token.
- **Profiles & follows** — handles, avatars, positions, wallet balance and a
  social activity notification feed.
- **Robinhood chain board** — a self-hosted market data layer for tokens trading
  on-chain, with candles, trades and holder distribution.
- **Deployment log** — every publish is tagged as a GitHub Release and rendered
  in-app on the Deployments page.

## Architecture

Kydos runs on the Base44 platform: a React front end, JSON-schema entities for
persistence, and server-side backend functions for anything that touches the
chain or a third-party API.

Market data is **self-indexed** rather than pulled from an aggregator:

\`\`\`
Robinhood RPC ──► indexRhBlockRange ──► RhTrade ──► buildRhCandles ──► RhCandle
                        │                  │
                        ├─► RhPool         └─► computeRhTokenStats ──► RhToken
                        └─► indexRhHolders ──► RhBalance
\`\`\`

Scheduled workflows poll \`eth_getLogs\`, venue adapters (Uniswap V2/V3, Rialto)
normalize swaps into a single trade shape, and price, market cap, FDV, candles
and holder stats are all computed locally.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 18, Vite, Tailwind CSS, shadcn/ui, framer-motion |
| Charts | Recharts |
| Data | Base44 entities (Token, Trade, Post, Profile, Follow, RhToken, RhTrade, RhCandle …) |
| Server | Base44 backend functions (Deno runtime, web-standard fetch) |
| Chain | Robinhood Chain (Arbitrum Orbit L2, chain id 4663) via JSON-RPC |

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

## Configuration

| Secret | Purpose |
| --- | --- |
| \`RH_RPC_URL\` | Private Robinhood Chain RPC endpoint used by the indexer (falls back to the public endpoint). |
| \`GH_REPO\` | Optional \`owner/repo\` override for the deployment release log. |

## Deployments

Publishing the app triggers a workflow that creates a tagged GitHub Release
(\`vYYYYMMDD-HHMM\`) containing the publish metadata and the commits landed since
the previous release. The in-app **Deployments** page reads those releases back
through the GitHub API, so the release history is browsable without leaving Kydos.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Found a vulnerability? Please follow [SECURITY.md](SECURITY.md) and do not open a
public issue.

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
- **No new market-data dependencies.** Chain data is self-indexed on purpose;
  prefer extending the indexer over adding a third-party aggregator.

## Workflow

1. Fork the repository and create a branch: \`git checkout -b feature/my-change\`.
2. Keep commits scoped and write imperative commit subjects
   (\`add holder distribution chart\`), since they become the release changelog.
3. Verify the affected flows end to end — launching, trading, posting, profile.
4. Open a pull request describing what changed, why, and how you verified it.
   Screenshots or a short screen recording at a mobile viewport are appreciated.

## Reporting bugs

Open an issue with the steps to reproduce, the expected and actual behavior, the
device/viewport, and a screenshot where relevant.

## Code of conduct

Be direct, be kind, and assume good faith. Harassment of any kind is not
tolerated.

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

export const FILES = [
  { path: "README.md", content: README, message: "docs: add project README" },
  { path: "LICENSE", content: LICENSE, message: "chore: add MIT license" },
  { path: "CONTRIBUTING.md", content: CONTRIBUTING, message: "docs: add contributing guide" },
  { path: "SECURITY.md", content: SECURITY, message: "docs: add security policy" },
];