# Astra continuity checkpoint

## Active delivery: PR #36, frontend types and mainnet-only boundaries

Continue `codex/mainnet-readiness-typecheck`, created from merged PR #35/main
`0fe3a908b2f1169871a03f7bff3187164bd3035f`. The formerly interrupted 87-file
implementation is now committed and pushed at
`1b78c30a18812cc97d1031575c51e49fd37a1fc6`; PR #36 is open. Do not recreate the
branch, resume the older DBC branch, merge, deploy or spend public funds.

## Delivered scope

Full frontend compiler and coverage checks: 201 maintained files, zero diagnostics.
Accurate UI/ref/state/wallet/error and upload contracts; no active-source exclusions
or suppression comments. Application CI now enforces checking instead of relying
on builds. New DBC releases, launch readiness, indexing and RPC relay require
mainnet; historical labels remain intact. The bounded, sanitized relay never
retries a submission or falls back to devnet. Obsolete public protected-route
observations were retired; compatibility and local regressions remain.

Rust, canonical IDL, locked dependencies, nominal supply, creator rights and fee
policy are unchanged. No release manifest or signing credentials were supplied.
Design: docs/mainnet-readiness.md. Live-release procedure: docs/dbc-mainnet.md.

## Publication replay and compatibility correction

At 1b78c30, clean-install application CI passed the complete frontend compiler,
coverage, five contract tests, network tests, lint and build. Browser integration
passed, and mainnet UI run 38120766762 passed all 40 Node checks and 11 executed
Chromium scenarios, including devnet rejection. The downloaded artifact
11695251961 has SHA256 dff4896274e7b8e4b4d00576f67164418862e11a063cca544570b6180bd93b68.
These are isolated wallet/RPC fixtures, not mainnet or real Phantom execution.

The legacy exact-source check failed only on two compiler-only Anchor IDL casts
in client.js. This correction permits precisely those two complete annotated
lines, then compares all remaining bytes with the ORIGINAL baseline. No generic
comment/whitespace stripping or baseline replacement is introduced. Six local
mutation tests prove changed slippage, recipients, preflight, retries, added code,
other annotations and duplicate lines still fail. All original program/IDL/math
compatibility checks remain. No production code changes in this correction.

## Next action

Inspect all resulting exact-head PR checks, especially full Anchor and the repaired
compatibility job; do not reuse the prior SHA's green results as final evidence.
Record delivery SHA and completed results in PR/chat without recursive self-SHA
commits. The source work-state is historical; this checkpoint supersedes it.
Backend/Deno and Node-tooling coverage/errors remain the next approved milestone,
followed by live evidence, trading/indexing, durable workers, residual policy and
controlled release. This is FRONTEND completion, not repository-wide type safety
or production launch authorization. Main and public networks remain untouched.
