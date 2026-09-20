# Astra shared-delivery checkpoint

Status: repository policy and safety changes committed; executable verification,
branch inventory/integration and independent review remain pending. No deployment.

## Evidence and scope

- User-supplied last verified checkpoint:
  `67630023501fb93a8a5dc6a39ce697498599cf61`. It is a reference, not a reset target.
- Session handoff supplied working-tree proxy
  `astra/latest@a91643ccb1219ef109b6516d7adb26c9d72f567a`, base
  `bd8c4277dbc5613386a3f7a6f652ef9d940849f1`. Those ancestry claims were not
  independently checked: available tools expose no commit-history comparison.
- Inspected current `astra/latest` tree, AGENTS, README, Solana creation checkpoint,
  manager, worker, shared crew/tools/GitHub modules, role/contracts, Base44 project
  configuration and specialist workflow. Existing Solana work was not recreated.
- Checked-in worker trigger remains queued `AstraJob` -> `astraWorker(jobId,
  runToken)`. No queue mutation, cancellation or deployment was performed.

## Delivered changes

- `base44/shared/astraDelivery.ts`: common checkpoint, shared delivery, isolated
  work integration and evidence/handoff instructions.
- `base44/shared/astraCrew.ts` and `base44/functions/astraChat/entry.ts`: consume
  that policy for specialists and manager assignments respectively.
- `base44/shared/astraTools.ts`: no reset tool/schema/dispatch; shared branch
  preparation is explicit. Existing re-export in astraChat/tools.ts is compatible.
- `base44/shared/astraGithub.ts`: legacy reset fails closed without a network
  write; branch preparation returns observed commit SHA, only creates after 404,
  propagates other lookup failures and safely reads a concurrent creation winner.
  Existing commits retain parent tree and non-force ref update behavior.
- `AGENTS.md`: concise specialist handoff and integration completion requirements.
- `tests/astra-delivery.test.mjs` and `.github/workflows/astra-delivery.yml`:
  dependency-free mocked safety/contract tests on Node 22.18.0, triggered for
  relevant shared-branch pushes/PRs or manual dispatch. No deployment steps or
  cancellation/concurrency settings were added; existing CI is untouched.

Recorded delivery commit before this checkpoint:
`60dc5998fc3153bdb79292f6ee62d5ef806f44b5` (AGENTS handoff).
Implementation safety commit: `a4a57e2ef6f96ccd4e497c46d90ccd97fcc2a668`.
Tests: `69272fa3ac254f298cbaaf2d6bb3394e8bbdd941`.
CI: `45224d164496af434400c12aa1b08f42bbc6d498`.
The final response records this checkpoint's resulting commit separately.

## Checks and audit

Performed: targeted source inspection, static import/schema/worker-contract
review, and committed workflow read-back. No runtime tests, YAML validator,
typecheck, build or CI-result inspection was possible. Tests are **added, not
verified passing**. Run `node --test tests/astra-delivery.test.mjs` using Node
22.18.0; inspect the workflow result for the exact delivery SHA. Test cases cover
existing-branch reuse, lookup failure, missing-branch creation, concurrent creation,
disabled reset, branch restriction, non-force conflict propagation, common policy
wiring and unchanged Base44 queued-worker contract.

Independent audit/approval remains pending. Policy instructions are not a global
write lock or a machine-enforced integration completion gate: the worker still
marks a returned report completed. Existing non-force updates reject concurrent
ref races but do not detect content authored from a stale earlier read. Coordinate
file ownership and re-read before writes; do not assume parallel overlapping
edits are automatically safe.

## Exact limitations and next owner

This session has only reference search/read and repository tree/read/prepare/
complete-file commit tools scoped to `astra/latest`. No shell, branch listing,
worktree status, commit comparison, merge/cherry-pick, CI status, live job inventory
or deployed Base44 inspection tools are available. No existing specialist branch
inventory can be established; **no external branch work was integrated**, and no
claim that there are no such branches is made. Ownership/completion evidence for
external branches was not supplied. No main changes were depended on.

Next integration/review specialist with read-only branch/history/CI access should
inventory branches and their exact tips, obtain owner/build-intent/completion
handoffs and focused check results, and integrate only verified finished work when
safe. Record source SHA, changed files, resulting `astra/latest` SHA and integrated
checks. Report ambiguity/conflicts/failures without resetting, forcing, deleting
branches or disturbing jobs. Reinspect the actual tip first; do not reuse this
checkpoint as proof the branch has not moved.

Base44 hosted manager/worker/workflow configuration can be deployed separately
from Git. Only repository copies changed here. The deployed configuration is
inaccessible and unchanged status cannot be verified. Deployment requires a
separate authorized task; this task neither deploys nor expands application logic.

## Acceptance provenance resume — plan 6aafca03950adc548b23d387

**BLOCKED / incomplete comparison manifest. Not acceptance or audit approval.**
This addition preserves the historical entries above; their SHA lists, changed-file
claims and tooling limits apply to their own sessions, not to a verified comparison
range. Parent: `6aafc9abb6f11cfb1012dcee`. The job supplies the plan's approval;
its immutable contents and head designation were not recovered in this session.
No new economics decision, implementation or orchestration change is authorized.

### Commit-bound evidence manifest (version 1)

This manifest is bound to the Git commit containing this addition. Its immutable
URL is recorded in the token-creation resume handoff after that commit returns;
that documentation commit is not automatically the acceptance head.

```json
{
  "schemaVersion": 1,
  "repository": "doji0x/kydosv1",
  "planId": "6aafca03950adc548b23d387",
  "parentId": "6aafc9abb6f11cfb1012dcee",
  "status": "blocked-incomplete-evidence",
  "baseCommit": "a6e61ab7146f735cb28e30f51492c7ec976abe79",
  "baseObjectVerified": false,
  "baseBoundary": "excluded; baseline tree",
  "designatedAcceptanceHead": null,
  "headBoundary": "included once explicitly designated and verified",
  "headDesignationEvidence": null,
  "observedWorkingHead": "ddcbb2280f8e362c1618fddad87d7c7629490fa2",
  "recordedHistoricalHead": "679e74566a673d6a1193067a928243ce859ad11b",
  "historicalHeadObjectVerified": false,
  "ancestryVerified": false,
  "exactRangeCommits": null,
  "perCommitChangedFiles": null,
  "netChangedFiles": null,
  "upstreamDependenciesReliedOnThisResume": [],
  "completeAcceptanceDependencyInventoryVerified": false,
  "hostedDeploymentEvidence": null
}
```

`null` means unavailable, not an empty range or zero changed files. The empty
reliance list means this documentation resume did not depend on upstream work;
it is not a claim that the acceptance target has no dependencies.

Range contract: let B be the exact base above and H the still-undesignated
acceptance commit. Enumerate **all** commits reachable from H but not B (`B..H`),
not merely first-parent commits; B is excluded and H included. Require verified
B-to-H ancestry; stop on divergence rather than silently substituting a merge
base. List full SHAs and parents, and each commit's exact changed paths/statuses
against every parent (label merge-parent diffs). Also record the net tree diff
B to H, with additions/deletions/renames and old/new paths. A net diff is not the
union of per-commit changes. No baseline parent (`B^`) or three-dot comparison
is implied. If the approved plan requires including B's own change, recover that
instruction and explicitly version the boundary contract before collecting it.

### Observations and blockers

1. **Head designation:** repeated durable `checkBranchStatus(astra/latest)` calls
   returned `ddcbb2280f8e362c1618fddad87d7c7629490fa2` and
   `scaffold: completed/success`. This verifies the observed delivery tip/check,
   not an acceptance designation. Neither this tip nor the historical head was
   promoted to H. An owner/authorized acceptance record must name H and plan version.
2. **Historical head:** the prior token handoff records `679e74566a673d6a1193067a928243ce859ad11b`
   with a successful `delivery-contracts` check. That is historical testimony,
   not newly verified commit/check evidence. Passing that SHA to the available
   branch-status tool returned `GitHub 404: Not Found`. Its interface accepts a
   branch name, so this does not prove the commit is absent or invalid. Need a
   commit-object lookup, ancestry evidence and SHA-bound check/run references.
3. **Plan:** exact curated search returned no results; direct read of
   `6aafca03950adc548b23d387` failed with HTTP 500. Broader provenance search
   returned unrelated references, whose bodies were not used. Recover the stored
   approved plan/version and designation evidence; no absence claim is made.
4. **Comparison:** available tools expose latest-file reads and branch checks,
   not commit objects, parent history or a paginated compare/diff API. Exact
   commits/files from B to H remain unavailable. The supplied working proxy base
   `0f87918780b998f0489db3624e275ba6c5c4ccde` and scope list are not range proof.
   Historical commit lists above cannot fill these fields.
5. **Upstream handoff:** no complete package for another agent's main/orchestration
   work was supplied or relied on. Before reliance, collect each exact SHA,
   base/parents, complete changed files, SHA-bound tests with outcomes/run links,
   owner identity and immutable scope/completion handoff. Record its integration
   mapping to H and reviewed source. Unknown inventory is a blocker, not clearance.
6. **Hosted dependencies:** Base44 manager/worker/workflow and existing hosted
   image/metadata services are potential acceptance dependencies named by the
   checkpoints. Their exact dependency inventory and deployed versions are not
   verified. For each relied-on service require an outside-Git deployment/release
   ID or immutable provider record, environment/service identity, reviewed source
   SHA or artifact digest with source mapping, test results and owner handoff.
   A Git file or commit alone is not deployment evidence. No hosted state was
   inspected, changed or asserted unchanged.

### Focused consistency checks and completion procedure

Read only AGENTS, both target checkpoints and the two relevant workflow files;
re-read target contents before edits and confirm the observed tip has not moved.
Static review checked full SHA/plan IDs, B-exclusive/H-inclusive semantics,
unknown-versus-empty fields, evidence attribution and preservation of historical
text. No executable tests were run: this interface has no shell. The observed
`scaffold` success is trusted only for its reported head; no current
`delivery-contracts` success is claimed. Its workflow uses Node 22.18.0 and
`node --test tests/astra-delivery.test.mjs`; scaffold uses Node 20 and
`npm --prefix solana run check` plus `npm --prefix solana test`.
The Solana handoff edit matches the scaffold push filter; this docs file alone
matches neither workflow's push filter. Inspect checks on the final documentation
head rather than extrapolating pre-edit success. Do not disable checks to proceed.

Next authorized provenance/integration owner must recover H, verify both boundary
objects and the historical head, export complete untruncated commit/parent/file
evidence (including pagination/completeness), attach dependency packages and
outside-Git deployment records, and bind the completed manifest to an immutable
commit/artifact. Verify focused and required integration checks against H and
record conflict-free integration evidence before acceptance. Preserve newer work;
no upstream branch was merged here and no conflict/mergeability clearance for
other branches is claimed. Static specialist audit only: independent review,
acceptance and parent closure remain blocked. Post-commit SHA/read-back/check
results belong in the external handoff; a repository write cannot resume an audit
or establish a live queue state.
