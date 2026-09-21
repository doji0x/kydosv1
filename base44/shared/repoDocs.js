// Canonical documentation files committed to the Kydos GitHub repository.
export const README = "# Kydos\n\n**Kydos is a mobile-first, Solana-native social memecoin launchpad.**\n\nLaunch with Phantom, trade a constant-product bonding curve, follow market activity, and discuss tokens in one application.\n\n## Current direction\n\nKydos targets Solana exclusively. The active implementation uses Anchor programs, Solana Web3, SPL Token, Phantom wallet interaction, and Helius-backed RPC/indexing services. The previous EVM implementation is retained under `archive/` for historical reference and is not part of the active product.\n\n## Core product\n\n- Solana token creation and market initialization\n- Phantom-only signing for launch and trading flows\n- Constant-product bonding curve with explicit slippage limits\n- One-billion-token launch supply: 80% curve allocation and 20% liquidity allocation\n- Persistent transaction recovery and confirmed-state refreshes\n- Helius transaction parsing and history ingestion\n- Social posts, replies, likes, follows, profiles, and token discussion\n- Astra-assisted repository operations with durable checkpoints\n\n## Architecture\n\n`Phantom -> React/Vite client -> Anchor instructions -> Solana program`\n\n`Helius RPC/indexing -> Base44 functions -> Base44 entities -> market and activity views`\n\nThe on-chain workspace lives in `solana/`. Client adapters live in `src/lib/solana/`; Solana pages live in `src/pages/SolanaLaunch.jsx` and `src/pages/SolanaMarket.jsx`.\n\n## Local development\n\n1. Install dependencies with `npm install`.\n2. Configure a local Solana validator and Anchor toolchain using `solana/README.md`.\n3. Set the required Solana and Helius environment values through the platform secret manager.\n4. Run the web app with `npm run dev`.\n5. Connect Phantom with disposable local-development funds.\n\nThe checked-in Solana UI is intentionally explicit about confirmed state, stale quotes, slippage, and transaction recovery. Do not treat local-validator behavior as production readiness.\n\n## Repository map\n\n- `solana/` — Anchor program, tests, configuration, and deployment notes\n- `src/lib/solana/` — client instructions, market math, activity recovery, and configuration\n- `src/pages/SolanaLaunch.jsx` — token creation flow\n- `src/pages/SolanaMarket.jsx` — market state and trading flow\n- `base44/functions/solanaRpc/` — bounded Solana RPC access\n- `base44/functions/indexSolanaTransactions/` — Helius-backed transaction indexing\n- `docs/` — active Solana architecture and delivery documentation\n- `archive/` — deprecated Robinhood-chain implementation, preserved but inactive\n\n## Security\n\nNever commit private keys or API credentials. Keep wallet checks, account validation, slippage bounds, authority validation, and transaction confirmation logic intact. Review `SECURITY.md` before contributing.\n\n## License\n\nMIT — see `LICENSE`.\n";

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

export const INDEXER_WORKFLOW = "";

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
  {
    path: ".github/workflows/ci.yml",
    content: CI_WORKFLOW,
    message: "ci: lint and build on push and pull request",
  },
];