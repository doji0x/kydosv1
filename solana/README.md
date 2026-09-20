# Solana development scaffold

Status: isolated scaffold only on `astra/latest`; no runnable on-chain program.
The owner's current goal is an independent SOL-native launchpad with our own
programs and hosted metadata. First eventual milestone: Create Token -> Buy ->
Sell. This change establishes places and checks for that work, not that milestone.
Existing Robinhood application behavior is not switched to Solana.

## Layout and purpose

| Path | Purpose |
| --- | --- |
| `solana/programs/` | Reserved owned-program source boundary; framework/manifests pending |
| `src/lib/solana/` | Side-effect-free application-facing entry and local config parser |
| `solana/config/localnet.example.json` | Public loopback-only configuration example |
| `solana/tests/` | Executable config/import tests and future integration-test scope |
| `solana/package.json` | Dependency-free syntax/test commands, not an npm workspace |
| `.github/workflows/solana-scaffold.yml` | Isolated checks on relevant branch pushes/PRs |

There is no business logic, deployment, key generation, image inscription,
Pump.fun SDK, metadata upload or frontend redesign. No existing application file,
root dependency manifest/lockfile or existing CI workflow is changed.

## Inspected conventions and prior artifacts

Read `AGENTS.md`, root `README.md`, `package.json`, `.github/workflows/ci.yml`,
`.gitignore`, `eslint.config.js`, `jsconfig.json` and `src/lib/WalletContext.jsx`.
Reuse the existing JavaScript ESM/npm conventions and Node 20 CI baseline for
these small checks. No runtime/toolchain upgrade is made. The root frontend
lint/typecheck scope does not cover `src/lib/solana`; the dedicated syntax and
behavior checks supplement it, not replace it.

The repository tree exposed only `docs/architecture/launchpad-stages.md` as an
architecture artifact. It explicitly records incomplete, older Robinhood/Pons
planning, not a completed Solana review or toolchain decision. Targeted reference
searches returned source references but no completed Solana architecture/review.
This is a visibility limit, not a claim that no earlier specialist work exists.
Recover/link any completed off-repository artifact before choosing tools; do not
repeat the full reference study or treat the older scope as Solana approval.

Limited supplied-reference consultation (not a protocol review):

- Solana program examples, stored reference `6aafa27797c24670fa2d3bc0`:
  https://github.com/solana-foundation/program-examples — offers multiple framework
  variants, not an owner toolchain choice.
- Helius RPC guides, stored reference `6aafa1cd38e3257e4ea900c0`:
  https://www.helius.dev/docs/llms.txt — RPC/confirmation reference; no SDK or
  provider subscription is needed by this scaffold.
- Pump.fun docs, stored reference `6aafaa8cebe791f21e0b013e`:
  https://github.com/pump-fun/pump-public-docs — stored read returned GitHub HTML,
  not a usable complete protocol document. No ABI, ID or implementation was copied.
- Spunk reference located by search: `6aafa15c2ffdd092930c8c4f`,
  https://github.com/doji0x/Spunk. External reuse candidate only, excluding
  inscription; no source was copied or pinned in this job.

No browsing was available; live source revisions were not verified.

## Setup and checks

Use the existing Node/npm installation (CI uses Node 20). From repository root:

```sh
npm --prefix solana run check
npm --prefix solana test
```

These commands need no `npm install`, validator, network, wallet or credentials.
No nested lockfile is needed because no dependencies are declared. The public
client export accepts an explicitly supplied object; it does not auto-load files,
`process.env` or `import.meta.env`. Tests load the JSON example directly and
exercise that contract through `src/lib/solana/index.js`.

Optional local configuration copy:

```sh
cp solana/config/localnet.example.json solana/config/localnet.local.json
```

That copy is ignored. It is not automatically consumed. The example URL is only
a local development convention; nothing starts or contacts a validator, verifies
its identity, or makes it ready to trade. Remote clusters are intentionally
rejected until a separate integration decision. Do not add program IDs or wallet
paths merely to make this example look deployable.

For existing application regression checks, follow the root README and run:

```sh
npm ci
npm run lint
npm run typecheck
npm run build
```

Base44 local-backend development still follows `AGENTS.md` (`base44 dev`);
frontend-only development still uses `npm run dev`. No Solana config is required
for either. No Cargo/Anchor build or validator instructions can be reproducibly
given until compatible tool versions and a framework are approved.

All browser config is public. Never place Helius keys, private RPC credentials,
seed phrases or signing keys in `VITE_*`, this JSON, source or test fixtures.
Private RPC configuration belongs on the server after its boundary is approved.
Keep keys outside the repository; scoped ignore rules are not a secret scanner.

## Remaining consequential decisions

1. Recover completed review/architecture artifacts and approve the framework and
   pinned Rust/CLI/framework versions; then add real workspace manifests.
2. Select the Solana JS SDK, wallet integration and test harness. Existing
   `WalletContext.jsx` uses ethers, EIP-6963 and `window.ethereum`; it is not a
   Solana signer and must not be silently reused or replaced.
3. Approve program boundaries, token standard, instruction/account contracts,
   generated client/IDL provenance, authorities and upgrade policy. Do not invent
   addresses, curve economics, fees or graduation behavior in scaffolding.
4. Approve RPC cluster/identity checks, server/client credential boundaries,
   confirmation/expiry handling and indexing/persistence contracts.
5. Decide hosted metadata provider/schema, authentication, lifecycle and upload
   validation without inscription. Preserve the UI until integration is authorized.
6. Specify local Create Token -> Buy -> Sell acceptance criteria with rejection,
   slippage, rounding, authorization and failure-path tests before implementation.

## Validation and audit handoff

Performed: repository/artifact inspection; manual import/export and relative-path
review; comparison of parser fields with the JSON example and test expectations;
manual isolation review (all writes are new files in the paths above). Confirmed
commit tool success and read back the nested command manifest. No SDK, network
call, key material or existing-wallet import was added.

Not performed: syntax/test command execution, npm install, frontend lint/typecheck/
build, CI-result inspection, validator/program tests or end-to-end testing. This
environment exposes file/reference/commit tools but no shell or execution tool.
The new CI workflow schedules the scaffold checks; a passing run is not claimed.
Runtime validation remains pending before acceptance.

Final audit phase: integration-author static scope check only, not an independent
security audit or approval. Independent reviewer should run the commands above,
verify application isolation and review the pending choices. No self-approval or
protocol readiness is asserted.

Compact handoff: use this file plus `programs/README.md`, `tests/README.md` and
`../src/lib/solana/README.md`; refer to repository files rather than embedding
reference documents. UploadPublicFile is not available in this tool set, so no
large artifact transfer was attempted. Owner does not need to commit these files.
