# Astra delivery checkpoint

Astra supports the Solana-native Kydos repository through durable builder jobs, repository inspection, bounded execution windows, and checkpoint-based continuation.

## Operating rules

- `main` is authoritative for shared Astra infrastructure.
- `astra/latest` is the working branch for autonomous implementation.
- Solana program and client changes require focused tests and recorded commit SHAs.
- Specialists continue from verified checkpoints instead of rescanning the repository.
- Legacy chain code under `archive/` is reference-only and must not be reintroduced into active imports.

## Handoff contents

Each completed milestone records the head commit, changed files, checks, deployment references, blockers, and the next unfinished step. Time-bounded workers queue linked continuation jobs before the runtime limit.
