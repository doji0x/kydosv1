# Astra continuity checkpoint

Architecture remains in [launchpad-build-spec.md](launchpad-build-spec.md) and
[meteora-adapter.md](meteora-adapter.md). Launch/indexer rollout remains in
[launch-and-chart-rollout.md](launch-and-chart-rollout.md).

## Current handoff — Solana market discovery

- **Scope/status:** Owner approved homepage milestones 1–2 and specified the existing `JUP_API_KEY`. Implementation is complete on `codex/homepage-market-discovery`; delivery is for review, not deployment or merge. [Design](homepage-market-discovery-plan.md), [rollout](market-discovery-rollout.md).
- **Source/base:** Main `83f3f9ca6818494e8838e38e7d2f13811aecf64e`. Isolated worktree `kydos-discovery-plan`; historical fee work is untouched. PR #22 remains merged as `ec825f741b249db8d5913a46a2926a32be57fbec`.
- **Changes:** Exact-mint catalog, bounded Jupiter adapter, immutable shared snapshots, protected minute refresher/optional worker, public sanitized reader, discovery UI/search/filters/watchlist, external market page and public route, navigation and CI test gate. Detailed files are in Git and the work-state scope.
- **Decisions:** Use cbBTC, Portal ETH and ANSEM The Black Bull from the approved proposal. Thirteen catalog coins, six featured. API key stays on the backend. Five upstream calls per minute with the cron, independent of visitors. Old data retains its age; wrapped BTC/ETH caps are omitted. Existing Kydos curve/indexer routes and authorization remain separate. Historical charts and embedded Jupiter swaps are later milestones.
- **Prepared-tree evidence:** 19 new discovery tests plus 68 existing offline Solana tests pass (87 total); lint/build, worker syntax, diff whitespace and eight fixture component-render smoke cases pass. The new tests execute actual read/refresh handlers with mocked auth/provider/storage. Final delivery SHA and exact-SHA CI inspection belong in the chat handoff.
- **Limits:** No local Jupiter/Helius key or hosted Base44 configuration. Keyed API reads, live mint checks, scheduler identity, app-level public access and storage quotas must be checked during rollout. Browser preview blocked localhost, so responsive browser interaction/layout checks are unrun. Initial broad test glob reached validator-only `creation.test.js`, which stopped before execution due to absent `ANCHOR_PROVIDER_URL`; the corrected offline suite passes. No funded transaction, validator run or deployment is claimed. Build has existing large-chunk/missing-local-app-ID advisories.

## Next owner/action

Review the branch/PR. After merging through the normal workflow, deploy backend
and frontend with the existing secret, seed once using the admin refresh, verify
the minute scheduler and public access, then complete the hosted browser/mint
checks in the rollout document. Use one refresh source; keep refresh authorization
intact. No additional chart-provider key is needed for this milestone.
