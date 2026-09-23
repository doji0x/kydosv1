# Astra continuity checkpoint

Architecture remains in [launchpad-build-spec.md](launchpad-build-spec.md) and
[meteora-adapter.md](meteora-adapter.md). Launch/indexer rollout remains in
[launch-and-chart-rollout.md](launch-and-chart-rollout.md).

## Current handoff — interactive external market charts

- **Scope/status:** Owner requested corrections for coins without visible chart data and a commit. Implementation is locally verified on `codex/interactive-market-charts`; delivery is for review. [Chart design and rollout](interactive-market-charts.md).
- **Source/base:** Main `96406b05bc707882eab41df619da7036af985177`. Discovery PR #23 is merged as `e35dcdc`; its mint catalog and Jupiter snapshot remain the foundation. Isolated worktree `kydos-discovery-plan`; historical fee work and newer Astra settings are preserved.
- **Changes:** Public bounded OHLCV function and protected cache entity, verified pool selection and pinned backfill, native interactive USD candle/line views, five intervals, volume/crosshair and older-history controls, six visible featured sparklines, stale/empty handling, CI tests and rollout documentation. The shared renderer retains SOL defaults for existing Kydos charts.
- **Decisions:** GeckoTerminal public OHLCV needs no additional secret. Jupiter still provides discovery/statistics. Actual provider candles only; no synthetic history. Shared immutable caches retain original age on failure. Eight upstream calls/minute per instance plus shared provider cooldown reduce calls but do not establish an atomic deployment-wide quota. Cold homepage charts can take an extra minute to fill.
- **Prepared-tree evidence:** 18 chart + 19 discovery + 68 offline Solana tests pass (105 total); lint/build and seven fixture-render cases pass. Exact resulting delivery SHA and its CI inspection belong in the final chat handoff.
- **Limits:** Live GeckoTerminal request returned HTTP 403 from this environment, so live pool coverage remains unverified. Hosted Base44 public access and entity quotas need rollout verification. Earlier browser preview rejected localhost; canvas pan/zoom and mobile browser checks are unrun. No funded transactions, validator tests, merge or deployment. Existing build warnings cover missing local Base44 configuration and large chunks.

## Next owner/action

Review the branch/PR, then merge through the normal workflow. Deploy the new
cache entity, shared module, function and frontend together. Check live charts
for the six featured exact mints, public access, interval/style controls,
backfill, pan/zoom and stale-data behavior using the chart rollout document.
The existing Jupiter refresh configuration remains in
[market-discovery-rollout.md](market-discovery-rollout.md).
