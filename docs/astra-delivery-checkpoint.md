# Astra continuity checkpoint

Architecture remains in [launchpad-build-spec.md](launchpad-build-spec.md) and
[meteora-adapter.md](meteora-adapter.md). Launch/indexer rollout remains in
[launch-and-chart-rollout.md](launch-and-chart-rollout.md).

## Current handoff — chart overlap cleanup and Jupiter SDK verification

- **Scope/status:** Owner requested removal of overlapping chart code and a correct Jupiter public SDK integration. Cleanup is verified on `codex/chart-overlap-cleanup`; no historical Jupiter SDK replacement is claimed. [Research and rollout](interactive-market-charts.md).
- **Source/base:** Main `282d7ac016d0eaa42eba101ada2b0485dd7ba250`, including PR #24 merged as `d61c693be585ebc18bd43c57f5473fe946b36487`. Preserve the later Base44 request configuration and 16-call instance budget. Historical fee work and Astra settings are untouched.
- **Changes:** Remove unreachable `src/pages/SolanaChart.jsx` and `src/components/solana/TokenPriceChart.jsx`. Coalesce `base44/shared/marketCandles.js` requests after resolving mint/pool/interval/cursor. Add two concurrency regression tests and update chart documentation. Both active chart pages retain the single shared renderer.
- **Jupiter finding:** Official Plugin docs describe an embedded swap interface. The Price API guide explicitly provides current prices only, without historical data. No supported historical chart SDK was found. Installing the swap plugin would not supply the requested charts. Existing Jupiter discovery and historical provider remain; a Jupiter-only sampled-price chart would require accepting history accumulated only from deployment onward and no historical trade volume.
- **Prepared-tree evidence:** 20 chart + 19 discovery + nine Solana chart tests pass (48 total); lint/build and diff whitespace pass. Search confirms only one active chart renderer and no references to removed components. Final delivery SHA and its CI inspection belong in chat.
- **Limits:** Coalescing fixes the reproduced overlap within one instance; separate instances can still race on a cache miss. No hosted provider/browser verification, funded transaction, validator run, merge or deployment. Earlier GeckoTerminal request returned HTTP 403 in this environment. Existing build warnings concern missing local Base44 configuration and large chunks.

## Next owner/action

Review the cleanup branch/PR and deploy its backend/frontend changes after merge.
A Jupiter chart replacement requires a supported chart/data SDK reference or an
explicit choice to collect current-price samples going forward. Preserve actual
historical charts until that replacement is viable. Hosted provider and browser
checks remain in [interactive-market-charts.md](interactive-market-charts.md).
