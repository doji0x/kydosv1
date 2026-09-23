# Astra reliability and fine-tuning runbook

## What changed — and corrections to the original plan

Astra retains realtime activity messages and a final reply, not token streaming. Requests now have persistent identities and explicit completion/failure states; the browser remembers pending work, keeps waiting after an ambiguous transport timeout, reconciles realtime updates, and checks status every ten seconds while pending. Definitive validation/authentication/model failures remain errors, not a misleading infinite spinner. The browser stops waiting after five minutes without confirmation. Stop requests prevent subsequent tool operations, but cannot undo a commit or abort an already-running remote operation. Reloading the chat checks the original request rather than resubmitting it.

The prior review did not establish an actual browser timeout value or prove that the SDK patch difference caused a failure. Both requested handler imports are now aligned to 0.8.49. Current Base44 capability documentation lists gemini_3_8_flash as valid, contrary to the initial diagnosis. Web research uses automatic web-capable selection rather than replacing it with a stale hardcoded alias.

OpenAI's current SFT documentation uses **chat messages JSONL**, not Responses input/output training pairs. GPT-6 Astra is not listed as SFT-supported. Fine-tuning is winding down and is not available to new fine-tuning users; existing eligible accounts may still create jobs. The scripts do not promise eligibility, train unsupported models, or replace the chosen production model with a smaller model automatically.

References checked for this implementation:
- https://developers.openai.com/api/docs/guides/supervised-fine-tuning
- https://developers.openai.com/api/docs/guides/model-optimization
- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/reasoning

## Runtime configuration

Existing ASTRA_OPENAI_API_KEY authenticates the direct model call. ASTRA_OPENAI_MODEL remains the selected production model; absent a selection, the default remains gpt-6-astra.

Deployment settings (register both before deploying/testing; Base44 treats referenced secrets as required even though the runtime has defaults):
- ASTRA_REASONING_EFFORT: low, medium, high, xhigh; default medium. Invalid values fall back to medium. Applied only to recognized reasoning-model families; SFT GPT-4.1 candidates must not receive an unsupported reasoning parameter.
- ASTRA_FINETUNED_MODEL: use `none` until you have an **evaluated** fine-tuned model ID. A model ID takes priority; set it back to `none` to restore ASTRA_OPENAI_MODEL. No candidate is selected automatically, and a broken configured candidate reports an error rather than silently switching models.

Replies have a 16,000-token output cap. Model requests have abort deadlines and bounded retries, including Retry-After handling; turns use a 230-second work budget and at most 60 tool iterations. Strict tool definitions make every property required, represent optional properties as nullable, and disallow extra keys. Native Responses output items (including encrypted reasoning needed by the provider) are replayed intact within a turn; internal reasoning is never exported as training data.

At more than 50 dialogue messages, or earlier under context pressure, Astra summarizes older dialogue using Core InvokeLLM, preserves the latest 20 messages under a cumulative budget, and stores a versioned AstraMemory tied to the source boundary. Summaries are explicitly untrusted historical context, not verified current repository state. This feature consumes integration credits. The initial history window is bounded to 500 records; if older material was never summarized it is not magically recovered. The prompt and cumulative input budget prevent silently sending an oversized context. A turn that outgrows its budget ends with saved activity and a clear continue instruction.

## Authentic training data only

New successful turns capture the model-visible messages and actual assistant function calls/tool outputs to private storage, referenced by the final assistant record. The stored schema includes observable tool arguments and results but excludes provider reasoning items. Repo reads, commit outputs, branch SHAs and inspected checks form the repository evidence; no synthetic commit history is invented.

Capture/export refuses likely credentials and email addresses and applies size limits. This is a screening aid, NOT proof that a dataset is free of secrets or personal data. Private code, source licenses, wallet material and customer content still require human review. Automated training and automatic consent are deliberately not enabled.

Older activity labels do not contain full tool arguments/results. Those turns are reported as skipped, never converted into fabricated tool-use examples. Failed, stopped, incomplete and tool-error turns are excluded. Genuine historical repo changes can be manually curated as source-backed examples, with the before-state, explicit user instruction, actual tool exchanges and verified after-state; do not bulk-train raw repository dumps or unverified assistant claims.

## Export locally (Node.js 20+)

Use an authenticated administrator session token locally as ASTRA_ADMIN_TOKEN. The exporter calls the published app's admin-only export operation. Never put that token in a committed file or paste it into chat. Publish the updated backend before exporting from the published URL.

```sh
node solana/scripts/export-training-data.mjs
```

Writes `astra-training/candidates.jsonl` and `astra-training/manifest.json` with restricted file permissions. The default directory is gitignored. If choosing another directory, explicitly keep it out of version control. Existing output files are not overwritten. The manifest lists source conversation/request IDs, content hashes, model/prompt versions and skipped reasons. Export paginates source turns against a stable timestamp cutoff, deduplicates request identities/content, and never submits them to OpenAI training automatically. No eligible examples means an empty file plus an explicit skip report, not a usable dataset.

## Review, split and evaluate BEFORE spending

1. Manually verify each candidate against actual repository evidence and successful outcomes. Reject inaccurate answers and instructions embedded in untrusted source material.
2. Remove credentials, personal data and code you lack rights to use; screen again locally. Never include a program keypair, wallet seed, RPC key or access token.
3. Split **whole conversations/tasks** into training and holdout sets using the manifest. Do not split adjacent turns across sets. Store as `astra-training/reviewed-train.jsonl` and `astra-training/reviewed-validation.jsonl`.
4. At least 10 training examples are required; start with 50–100 high-quality demonstrations if available. Keep a separate final evaluation set outside both training and validation.
5. Baseline the currently selected model on question answering, read-only audits, tool argument correctness, library pagination, branch-conflict handling, grounded commit claims and unfinished-work continuation. Measure task success, unwanted writes, latency and cost.

For browser flow checks use the Testing Agent: “Send an Astra question, refresh while it is processing, and confirm exactly one final reply and no stuck spinner”; “Simulate a failed request and confirm a real failure is shown, then retry successfully.” Do not authorize real repository writes merely to test transport handling. Repository-tool tests should use fixtures or a separately approved safe change.

## Explicit, paid training — eligible accounts only

The script supports the currently documented SFT base snapshots: gpt-4.1-2025-04-14, gpt-4.1-mini-2025-04-14 and gpt-4.1-nano-2025-04-14. Selecting one trains a **candidate** and is not a recommendation to replace your stronger production model. Check current provider documentation and account eligibility before use.

Set ASTRA_OPENAI_API_KEY locally, then validate without uploading or incurring training charges:

```sh
node solana/scripts/finetune-astra.mjs --training astra-training/reviewed-train.jsonl --validation astra-training/reviewed-validation.jsonl --model gpt-4.1-2025-04-14
```

It stops after validation unless you explicitly authorize the upload and cost:

```sh
node solana/scripts/finetune-astra.mjs --training astra-training/reviewed-train.jsonl --validation astra-training/reviewed-validation.jsonl --model gpt-4.1-2025-04-14 --approve-upload-and-cost
```

The script checks fine-tuning access, uploads JSONL with purpose fine-tune, creates a supervised job through `/v1/fine_tuning/jobs`, records private upload/job receipts and polls. Access or validation failures are reported without bypassing provider restrictions. A listing-access check is not a guarantee that your account may create jobs; the provider makes that final decision. Upload receipts help remove unused uploaded files if job creation fails.

If your terminal disconnects, resume with the printed job ID rather than creating another paid job:

```sh
node solana/scripts/finetune-astra.mjs --job ftjob-YOUR_JOB_ID
```

If creation has an ambiguous network outcome, inspect the provider's jobs before retrying. There is deliberately no automatic retry of job creation. Keep funding and training credentials completely separate.

## Promote only after evidence

Compare the candidate and baseline on the same untouched evaluation tasks. Require no unauthorized writes, no invented commits/checks, correct paired tool exchanges and a measurable benefit. Confirm the candidate supports the existing Responses endpoint, strict function tools and the final reply JSON format; inference compatibility is a release gate, not something the model ID alone proves.

Only after approval set ASTRA_FINETUNED_MODEL, publish the updated app/functions together, and exercise a read-only question and a safe tool interaction. Roll back by setting that override to `none`. Keep private dataset versions and evaluation records; do not store large transcripts in entity fields.

## Explicit limitations

This release builds the export/training workflow but does not run a paid job or claim a fine-tuned model exists. Provider eligibility and model support may prevent training. Legacy missing traces cannot be recovered from activity labels. Same-browser duplicate sends are blocked immediately; persisted request checks prevent ordinary retries, but the entity store is not an atomic cross-process lock, so simultaneous requests across tabs remain a concurrency limitation. Git writes retain expected-HEAD conflict checks and never force-push.