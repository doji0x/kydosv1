# On-chain implementation resume

## Scope and evidence

Partial test-only delivery; policy-dependent implementation is blocked. Source
head: `f7b51af1840bf324d304dae961e50604e985cfd0` on `astra/latest`.
Durable GitHub status reported `anchor: completed/failure` at that head; no
failure logs are available through the supplied tools. Do not infer its cause.

The existing `creation-checkpoint.md` and `creation-resume-handoff.md` record
unresolved decisions. `docs/architecture/launchpad-stages.md` is unfinished EVM
planning, not the requested approved Solana architecture. A targeted curated
reference search returned technical references, not an approval record. This is
an access limitation, not proof that no off-repository handoff exists.

Unlike the older scaffold descriptions, the current source includes an Anchor
0.31.1 program. Its presence is not approval provenance: it fixes six decimals,
a billion-token supply, 200 million liquidity tokens, an 85 SOL target and
21.25 virtual SOL; revokes mint/freeze authorities; and changes to internal
constant-product trading on graduation. No fee collection or external migration
instruction is present. These are observations of the existing source, not
approved policies or verification of correctness. Existing runtime code was
preserved rather than reconstructed, endorsed or silently changed.

## Independent work delivered

- `solana/programs/kydos_launchpad/tests/account_validation.rs`: host Rust tests
  against actual Anchor account wrappers and the program's account serializer.
  Covers unsigned signer rejection, rejection of a foreign-owned mint account,
  and maximum existing string-field allocation. No supply/pricing expectations
  or new dependencies are introduced.
- `.github/workflows/solana-scaffold.yml`: adds the focused host-test command
  while retaining existing checks and the required Anchor build.
- This handoff; no other files modified by this resume.

These are host integration/unit checks, not validator transaction tests. They do
not establish PDA substitution rejection, CPI execution, rollback, trading or
successful launch creation. No interim audit was dispatched or performed.

## Blocked paths and required recovered contract

| Path | Required specification before implementation |
| --- | --- |
| Creation | Approved raw supply/decimals, allocation/custody, fixed versus extensible supply, creation charge (including explicit zero), hosted metadata schema/mechanism and mutability |
| Accounts and authorities | Approved instruction/account/PDA contract, token standard, authority holders/transitions, upgrade authority and reproducible program identity |
| Trading | Pricing equations, integer rounding, reserve accounting, slippage semantics and threshold-crossing behavior; existing math tests only restate selected constants |
| Fees | Amount/rate, denomination, payer, recipient, accrual/claim rules, rounding and change authority; absence of fees is not approval for zero fees |
| Graduation/migration | Trigger, post-trigger trading policy, liquidity venue/interface, amounts, custody/LP ownership, execution authority, idempotency and atomic failure/retry behavior; a graduation flag is not migration |

Next owner: architect/manager must supply the preceding approved immutable
handoff and its decision provenance. Recover existing decisions instead of
requesting repeated approval where it already exists. If depending on another
agent's main work, require its exact commit SHA, complete changed files,
SHA-bound checks and scope handoff first. No upstream branch was integrated.

After recovery, the implementation owner can complete only specified paths and
add real local transaction tests for authorized creation, exact approved supply
and authorities, PDA/account substitution, duplicate initialization, buy/sell
slippage and rounding, overflow, reserve solvency, threshold crossings, fees,
rollback and migration replay/failure as applicable. Do not turn missing policy
into caller-controlled parameters or copy another protocol's defaults.

## Checks and limitations

Performed: targeted source inspection, static test/ABI review, read-back of the
new test file and durable GitHub status inspection. No shell/command runner is
available. No executable test pass, validator run, independent review, deployment
or external spending is claimed.

Focused command added to CI (also runnable locally):

```sh
cd solana
cargo test -p kydos_launchpad --test account_validation
```

Required existing checks remain `npm --prefix solana run check`,
`npm --prefix solana test`, and `cd solana && anchor build`.
At intermediate commit `98cce366448b54bc1b9a16ad48a0f9cdad5b88c8`, GitHub reported
`anchor: queued`, not success. Final head and check state are reported externally;
no earlier passing checks are transferred. CI failure must be diagnosed using
actual logs before selecting toolchain changes. Acceptance remains blocked on
executable validation, recovered policy and independent review. No security
checks, branch protections, credentials, live queues or deployment were changed.
