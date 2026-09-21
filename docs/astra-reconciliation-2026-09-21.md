# Astra reconciliation — 2026-09-21

Main is the source of truth for Astra infrastructure going forward.

- Source main head: `5b7859878dce2ecf6bfdbf278a8114503513db23`
- Starting astra/latest head: `ba60e99bfeb7a52f2a886192d700d03060a93335`
- Reconciled content head: `93d6c73f506e2f8ba936ade338833f4e2288945e`
- Selective ancestry commit: `00ca8fca70b26aeecffa71628a562206637c857d`
- Adopted main commits: `1fbce6d`, `e6854f4`, `53352c3`, `5b78598`

## Files adopted from main

- `base44/shared/astraRoles.ts`
- `base44/shared/astraCrew.ts`
- `base44/functions/astraChat/entry.ts`
- `base44/functions/astraWorker/entry.ts`
- `base44/functions/astraChat/githubChat.ts`

## Removed

- `base44/shared/astraDelivery.ts`

All other astra/latest work was preserved.
