# Astra reconciliation — 2026-09-21

Kydos now treats `main` as the source of truth for shared Astra infrastructure and Solana as the only active launchpad chain.

The reconciled Astra worker retains its 270-second execution budget, 60-step window, durable checkpoints, and linked continuation jobs. The `astra/latest` branch preserves Solana program, client, test, and workflow work while sharing the authoritative Astra role, crew, chat, worker, and repository-inspection files from `main`.

Legacy chain implementation files have been moved to `archive/` on both branches. They are not valid active dependencies.
