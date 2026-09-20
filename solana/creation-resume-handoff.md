# Token-creation resume handoff

## Scope/status

**Blocked; no runtime implementation or tests added.** The approved milestone is
creation through our own Solana program with existing hosted image/metadata
services. It does not resolve the missing token parameters. This resume does
not repeat the architecture review or change the existing scaffold.

Source/base inspected: `astra/latest@4ff6df4fc97ecd9e5a064646d8f9936196c1208f`.
`checkBranchStatus` returned that exact head twice before this documentation
commit, with `checks: []`. No newer branch changes were observed and no upstream
work was incorporated. Changed file: `solana/creation-resume-handoff.md` only.
The resulting commit SHA is returned by the commit tool and included in the
external handoff, rather than a self-referential value here.

## Precise approval blocker

The existing [creation checkpoint](creation-checkpoint.md) remains unresolved.
Recover an owner-approved decision record (repository path or curated reference
ID, with approval provenance) specifying:

- Decimals, initial raw supply, whether creation mints immediately and whether
  supply is fixed or extensible.
- Initial recipients/allocation and custody or vault authority.
- Mint and freeze authority holders or revocation, and allowed transitions.
- Explicit zero creation fee, or its amount, denomination, recipient and change
  authority; rent/network costs are separate.
- On-chain metadata mechanism, hosted URI/schema contract, update authority and
  mutability. Reuse the existing hosting service, not a new upload service.

Also resolve the token standard, owned-program instruction/account/PDA contract,
signer requirements, upgrade policy, pinned framework/toolchain, client/wallet
interface and reproducible test program identity before dependent implementation.
Do not substitute EVM display defaults, Pump.fun parameters, zero-valued defaults
or arbitrary caller-controlled economics for approval.

## Evidence and checks

Read only `AGENTS.md`, the existing creation checkpoint, `solana/README.md`,
`solana/programs/README.md`, `src/lib/solana/README.md` and its `index.js`.
These still describe unresolved contracts and a config-only public client entry.
A targeted curated-library search for approved Kydos creation parameters returned
external references, not an approval record; unrelated reference bodies were not
read. This is a visibility limit, not proof that no off-repository approval exists.

Performed: targeted source inspection, two durable branch-status queries and a
static scope/consistency review. No checks were reported by GitHub; none are
claimed passing. No command-execution tool is available. Node, Rust/Solana,
validator, frontend and integration checks were not run. No code changed, and
adding policy-dependent creation tests now would encode unapproved expectations.
The historical tooling limitations in the earlier checkpoint describe that run;
branch status is available in this resume, command execution is not.

## Remaining work / next owner

Owner or manager: supply the approved decision record, or obtain the explicit
missing decisions above. If relying on another agent's work, supply its commit
SHA, changed files, test results and handoff first.

Logic/client engineer then implements the creation-only program and matching
client, preserving hosting and isolating the Solana signer from the EVM wallet.
Follow the existing checkpoint's test slice: exact supply and authority outcomes,
unauthorized signers, substituted accounts, duplicate creation, malformed/boundary
inputs, overflow and atomic rollback; client serialization, wallet rejection,
expiry/unknown confirmation and persistence failure without duplicate creation.
Run pinned program build/local integration tests, scaffold checks and affected
frontend checks, then obtain independent review before integration/acceptance.

Final audit phase: specialist static review only; no self-approval, independent
security audit or completion claim. No buy/sell, spending, credentials, deployment,
inscription, wallet-creation service or Pump.fun dependency was added.
