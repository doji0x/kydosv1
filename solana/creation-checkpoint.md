# Creation continuation checkpoint

Status: **blocked on creation economics and authority decisions**. No program or
transaction client is implemented by this continuation. This is a scoped logic
engineering handoff, not an approved architecture or security audit.

## Verified evidence

- Supplied checkpoint: `67630023501fb93a8a5dc6a39ce697498599cf61` (reference only;
  no reset). The branch tool confirmed `astra/latest` already exists and reused
  it. Current files were read from that branch before writing this new file.
- `solana/README.md`, `solana/programs/README.md` and
  `src/lib/solana/README.md` explicitly leave the Solana instruction/account
  contract, token standard, authorities and framework unresolved.
- `docs/architecture/launchpad-stages.md` is unfinished Robinhood/Pons planning,
  not a Solana creation specification. A targeted curated-reference search
  returned external technical references, not an approved Kydos creation design.
- `src/lib/solana/index.js` only exports the development config parser. The
  inspected tree has no Solana program manifest, program source or client IDL.
- `src/pages/Launch.jsx` calls `src/hooks/useKydosLaunch.js`, which uses ethers,
  EVM factory events and Robinhood persistence. Its displayed billion-token
  supply and ETH economics are not evidence of approved Solana economics.
- `.github/workflows/solana-scaffold.yml` and `solana/package.json` only schedule
  JavaScript syntax/config tests. They cannot establish Solana build correctness.

The available tools do not expose commit history, other branches/worktrees,
current head SHA, CI results or command execution. Accordingly, independent
verification of changes since the supplied checkpoint and specialist commits is
not claimed. No main-branch work was incorporated or depended on. Any such
handoff must supply its commit SHA, changed files and decision summary first.

## Decisions needed before writing creation instructions

| Blocker | Required explicit contract | Why creation cannot choose a default |
| --- | --- | --- |
| Supply | Decimals, initial supply in raw units, fixed versus extensible supply, and whether creation mints immediately | Determines mint initialization, integer bounds and supply invariants; zero supply is also a policy choice |
| Initial custody | Recipient(s)/allocation of newly minted supply and authority over any program vault | Creator custody versus program custody changes ownership and future inventory; excluding trading does not resolve it |
| Mint and freeze authority | Which signer/PDA holds each authority after creation, or whether it is irrevocably revoked; permitted later transitions | Retaining, transferring or revoking either authority changes user rights and cannot be inferred from SPL examples |
| Creation charge | Explicit zero protocol fee, or amount, denomination, recipient and authorization to change it; distinguish rent/network costs | Omitting a fee silently implements zero-fee economics |
| Metadata authority | On-chain metadata mechanism, hosted URI contract, update authority and mutability policy | Hosted images do not specify who can change a token's identity or which metadata account to create |

Also recover/approve the program boundary, SPL Token versus Token-2022 choice,
account/PDA layout, signer requirements, upgrade policy, compatible pinned
framework/toolchain and JS client/wallet interface. A program address need not be
deployed now, but test/client identity must come from our own reproducible build
configuration, not a guessed address or another protocol's interface.

Do not substitute Pump.fun interfaces, generic reference code, or the existing
EVM defaults for these decisions. Passing these choices as arbitrary client
parameters would itself grant an undocumented authority and is not a workaround.

## Next implementation and acceptance slice

Once the approved contract is linked in this repository:

1. Implement only our creation instruction and its atomic account/mint/metadata
   initialization under `solana/programs/`. Encode approved authority and supply
   invariants; reject unauthorized signers, substituted accounts, duplicate
   initialization and arithmetic overflow without partial state changes.
2. Add the matching instruction builder and Solana signing/confirmation boundary
   under `src/lib/solana/`. Do not reuse the EVM signer. Treat wallet rejection,
   on-chain failure, expiry and unknown confirmation distinctly; do not blindly
   create a second mint after a timeout. Keep chain-confirmed creation separate
   from off-chain persistence failure.
3. Add Rust/program tests and client tests for exact integer serialization,
   approved supply/custody and authority outcomes, account substitution,
   initialization replay, boundary inputs, rollback, wallet rejection and
   confirmation/persistence failure. Derive metadata length/encoding cases from
   the chosen contract, not guessed limits.
4. Run the pinned program build and local program/integration tests, plus
   `npm --prefix solana run check`, `npm --prefix solana test`, and relevant
   frontend checks if integration changes application files. Record actual
   commands, versions and results. Obtain independent review before acceptance.

Buy/sell, deployment, image inscription and Pump.fun program/SDK dependencies
remain excluded. This checkpoint does not require designing trading economics.

## Checks and final audit phase

Performed: targeted source/reference inspection and static consistency review of
creation-path evidence against the blockers above. Only this new checkpoint file
is written; existing scaffold and application files are preserved.

Not run: Node tests, Rust/Solana builds, validator tests, frontend checks or CI
inspection; no execution tool is available. No passing build/test claim is made.
Independent review remains pending; this specialist does not self-approve.
