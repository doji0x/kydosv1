# Astra continuity checkpoint

Single rolling human handoff. Update in place; no transcripts or dated status files. This is evidence, not permission to resume old work. Machine-readable task routes and research cursors live in [astra-work-state.json](astra-work-state.json); source findings belong in [reference-index.md](reference-index.md).

## Minimal resume

1. Check current delivery HEAD/checks; read `AGENTS.md` and this note once. Read work state only when selecting/resuming a task.
2. Compare against the source SHA below once; separate already-completed changes from unfinished work. After an owner merge, verify upstream evidence rather than assuming branch labels moved.
3. Pick one outcome and its task route. Start with no more than five task-specific files (soft limit); expand only for a concrete dependency, relevant diff, failing check or acceptance gap. No whole-repository scan.
4. Read touched files before editing; reuse current-turn content unless changed. Stop on unexpected concurrent edits. Save actual research hashes/offsets after bounded batches, before the turn ends.
5. Report delivery SHA/checks in chat, not a recursive self-SHA commit. Update this note and work state at useful milestones, not after every read.

## Current handoff

- **Scope/status:** conversation #29 focused continuity system implemented. Added task-to-file routes, soft read budget, targeted invalidation rules, exact research cursor format and a recovered unfinished-work pointer. These are durable working instructions and state, not automated runtime enforcement.
- **Owner:** Astra direct chat on `astra/latest`; no Builder delegation. Owner plans merge to `main`.
- **Source/base:** `e683d20589587aa2601828bf519b162189a80265`. Observed upstream `main`: `1409cc3ee56be4678447a7e2e4ba53e53281dd97`. Comparison reports diverged: 3 delivery commits / 2 upstream commits. No upstream integration attempted; current documentation changes do not depend on upstream-only work. Merge compatibility is not verified by these tools.
- **Changed files:** `AGENTS.md`, `docs/astra-work-state.json`, this checkpoint. No application, deployed orchestration, wallet or transaction changes.
- **Evidence:** current branch/upstream status, baseline comparison, and reads limited to existing instructions/checkpoint plus absence check for the new state file. No tree scan or repeat library research. Previous checkpoint was stale at request #23; this update preserves completed reference work instead of restarting it.
- **Checks:** no checks reported on source HEAD. No tests executed (no shell available); these are documentation/process records. Inspect final HEAD checks and report in chat; upstream passing checks do not establish a pass on delivery.
- **Access:** repository tools, paginated library inventory/search/read and approved raw public-document fetch are now callable. The older reference index's unavailable-tool statements are historical, not current capability claims. Library completeness and deployed Base44 behavior remain unverified. No shell, merge, deployment, wallet-signing or live-job inspection tools.

## Boundaries retained

- Independent Solana launchpad using provided framework; no pump.fun SDK. Existing economics are not automatically owner-approved. Legacy `archive/` is reference-only.
- Build before transaction verification; mock/unit checks and source inspection do not prove on-chain success.
- Maximum **0.05 SOL (50,000,000 lamports) per test**, with the accepted initial plan limited to **one funded test total**, including principal, rent, network/priority fees and protocol charges. No automatic replacement/retry spending, deployments, upgrades or additional funded tests.
- Mainnet remains gated by integrated spending enforcement, bounded costs, explicit enablement, verified target program and readiness checks. Prior handoff reports unwired budget/missing enablement/unverified deployment; not re-audited or fixed here.

## Next action

- **Owner:** review/merge this process milestone as planned. Astra must verify actual delivery/upstream state afterward; no merge or deployment is claimed.
- **Astra, when research resumes:** follow `library-and-build-spec` in work state. Retrieval implementation, reference helper tests, CI wiring and partial index already have exact commit evidence there. Do not recreate them. Inventory cursor starts at 0 because previous legacy search did not establish a complete inventory; no invented progress markers. Verify existence of `docs/launchpad-build-spec.md` before treating the index's link as completed work. Research and launchpad implementation were not resumed during this milestone.
- **Blockers/limits:** complete research/specification still outstanding; test execution and branch merging are unavailable in this session. No known blocker to using this focused-read system immediately.
