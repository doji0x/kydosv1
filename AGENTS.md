# AGENTS.md

## Project Context

This is a Base44 app repository. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup, environment variables, and publish workflow.

## Astra continuity: start here

- Read `docs/astra-delivery-checkpoint.md` at the start of a resumed session, alongside current branch HEAD/checks. It is the single rolling resume note, not an append-only activity log.
- Check differences since its source SHA and read relevant files before continuing. A checkpoint is evidence, not authorization; continue only currently requested unfinished work.
- Update that note in place for an approved milestone or interrupted handoff. Record scope/status, source SHA, changed files, SHA-bound evidence, decisions, blockers, and next owner/action. Keep it roughly one page; link detailed task records instead of duplicating transcripts or creating dated status files.
- Put the resulting delivery SHA and post-edit check state in the final chat handoff. Git history identifies the checkpoint's own commit; do not make recursive commits just to write its SHA into itself.
- After the owner merges to `main`, re-inspect the actual delivery tip and merge evidence. Do not assume the old SHA, check results, or branch relationship remains current.
- Direct Astra chat work has no Builder delegation. The crew conventions below describe legacy/specialist infrastructure; they do not authorize creating jobs or imposing an unsolicited audit on direct chat work. Audit only on request. This documentation does not change deployed orchestration.

## Base44 References

- CLI overview: https://docs.base44.com/developers/references/cli/get-started/overview.md
- Agent skills: https://docs.base44.com/developers/backend/overview/skills.md

If your agent supports Agent Skills, install or update Base44 skills before Base44-specific work:

```bash
npx skills add base44/skills
```

## Key Files

- `src/`: frontend application source.
- `src/api/base44Client.js`: frontend Base44 SDK client.
- `vite.config.js`: Vite config and Base44 Vite plugin setup.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `base44 dev` as the default local development command when you need the local Base44 backend. It can run the backend and frontend together.
- When docs or code mention the frontend being started automatically, that usually means the Base44 project config includes `site.serveCommand`, for example `"serveCommand": "npm run dev"` in `base44/config.jsonc`.
- Use `npm run dev` only for frontend-only work against the hosted Base44 backend.
- Prefer the existing Base44 CLI workflow over adding new npm scripts for Base44-specific tasks.
- Reuse the existing SDK client and Vite plugin patterns before adding new Base44 integration paths.
- Run the relevant checks from `package.json` before finishing code changes.

---

## Agent and Crew Workflow Conventions

This project enforces structured crew-based workflow for all code, docs, and process improvements. Key conventions:

- **Roles:** Must correspond to strong, explicit types (see base44/functions/astraChat/roles.ts) and follow boundaries for review, commit, and audit authority.
- **Workflow objects:** All work passes as JobSpec, TaskPlan, SpecialistResult, ChangeProposal, or AuditFinding — see base44/functions/astraChat/contracts.ts for canonical structure.
- **Review and approval:** No specialist may self-approve their own commits. Reviewer and approver roles must be clearly different and tracked.
- **Audit:** All changes must finish with an explicit audit phase. Critical findings are recorded and never directly fixed without owner approval.
- **Hand-off:** Crew must pass full file context and decisions to the next specialist, to eliminate blind spots and omissions between crew phases.

- **Crew stages:** Effective crew runs use `initiate`, `assign_roles`, `agent_task`, `review`, and `finalize`; assignments and activity records identify the responsible role at each stage.
- **Termination:** Workflow results record completion time, success state, and any error explicitly.

See base44/functions/astraChat/roles.ts and contracts.ts for authoritative types and permissions.

## Shared delivery and concise specialist handoff

- **Astra specialists deliver to `astra/latest`**, not a new branch per task. This is the shared delivery branch, not deployment approval. Other agents use separate branches/worktrees.
- Before resuming, inspect the current tip, relevant upstream state, this file and task checkpoints. Continue only unfinished work. Re-read touched files before editing; coordinate overlapping ownership. Earlier assistant claims are not verified SHAs or job status.
- If isolation is necessary, record owner, purpose and base SHA. Completion includes safe integration of verified, finished, build-intended work into `astra/latest`, focused checks on the integrated result and its resulting commit SHA. Do not leave routine integration to the owner. If tooling, ownership, conflicts or failed checks block integration, report blocked delivery instead of guessing.
- Never force merges/ref updates, reset working trees, discard changes, delete unrelated branches or interrupt running jobs. Do not automatically cancel jobs for branch housekeeping. Preserve unrelated edits; unexpected changes require reinspection, not overwriting.
- Another agent's `main` changes are upstream evidence only: obtain its exact commit SHA, changed files and concise handoff before assigning dependent work.
- Handoff format: **scope/status; source/base SHA; changed files; resulting `astra/latest` SHA; checks actually run/results; blockers/next owner**. Link relevant decisions and checkpoints. Distinguish file/blob SHAs from commit SHAs and unrun checks from passing checks.
- Orchestration policy lives in `base44/shared/astraDelivery.ts`, consumed by manager and specialists. Focused checks: `node --test tests/astra-delivery.test.mjs` with Node 22.18.0 (native TypeScript stripping). CI: `.github/workflows/astra-delivery.yml`. Tests are mocked GitHub/contract checks, not live Base44 execution.
- Git and deployed Base44 configuration may differ. Report inaccessible deployed state explicitly; do not claim deployment or live job changes from a Git commit. See `docs/astra-delivery-checkpoint.md` for inspection limits and follow-up.
