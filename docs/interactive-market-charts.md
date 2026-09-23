# Interactive charts for Solana discovery

The external market page now displays historical price and volume inside Kydos.
Jupiter remains the discovery and summary-statistics source; GeckoTerminal supplies
pool OHLCV. This completes the chart milestone approved after discovery PR #23.
The original chart implementation merged in PR #24. Follow-up cleanup is on
`codex/chart-overlap-cleanup`. Deployment is a separate rollout step.

## Jupiter SDK verification — September 23, 2026

The owner requested Jupiter's public SDK for in-app charts. Jupiter documents
its public [Plugin](https://developers.jup.ag/docs/tool-kits/plugin) and
[`@jup-ag/plugin` React integration](https://developers.jup.ag/docs/tool-kits/plugin/react-app-example)
as an embedded swap interface. The documented customization API does not expose
a historical chart component. Its
[Price API guide](https://developers.jup.ag/docs/guides/how-to-get-token-price)
explicitly provides current prices only; historical prices must be recorded by
the integrator going forward. Those observations cannot backfill past candles
or supply historical trade volume.

Consequently no Jupiter chart SDK replacement is claimed or installed. Jupiter
continues supplying discovery/statistics, and the existing historical candle
provider remains available. A Jupiter-only sampled-price chart would be a
separate product choice with no pre-existing history, not an equivalent candle
source. A future SDK replacement requires a documented chart/data contract.

The cleanup removes the unreachable `SolanaChart.jsx` and `TokenPriceChart.jsx`.
Both active market pages continue to use `MarketCandleChart`. Candle work now
coalesces by resolved mint, pool, interval and history cursor, so automatic pool
selection and an explicit address share one refresh when they resolve to the
same page. This fixes the reproduced duplicate fetch within one function
instance; separate instances can still race on a cache miss.

## Visible behavior

- `/markets/solana/:mint` opens a chart above the market statistics. Candles and
  line views support 1m, 5m, 15m, 1h and 1d intervals, crosshair OHLC/volume,
  pan/zoom, Follow latest, refresh and older-history loading.
- The default view uses hourly candles. Each response contains up to 300 traded
  buckets; older pages keep the same pool and denomination. The browser retains
  at most 6,000 candles per view. Available history depends on the provider and
  pool age; a requested window is not a guarantee of complete lifetime coverage.
- The six featured homepage cards display actual hourly closing-price sparklines
  for up to the past 24 hours. They load when visible and share the detail-page
  query cache. Other listed coins reach their full chart through the internal
  market route. Jupiter remains an optional external link.
- Chart price and volume are USD. The chart identifies its pool and source;
  Jupiter's aggregated summary price can differ. The existing Kydos curve charts
  retain their SOL defaults and their separate event-based data feed.
- Missing history has a loading, unavailable or no-trades state. Provider failure
  keeps good cached candles with their original timestamp and a delayed-data
  label. Empty updates cannot erase good history. No prices are synthesized from
  percentage changes and no empty trading buckets are filled.

## Backend and data contract

Deploy `MarketChartCache`, `base44/shared/marketCandles.js` and the `marketCandles`
function alongside the frontend. No additional API key or scheduler is required.
Keep the existing `JUP_API_KEY` and discovery refresh configuration as documented
in [market-discovery-rollout.md](market-discovery-rollout.md).

`POST /marketCandles` accepts `{ mint, interval, pool?, before? }`. Mint and pool
are exact 32-byte Solana addresses, not symbols. Older pages require the selected
pool and a seconds-based timestamp cursor. Public requests are limited to catalog
coins, tokens in the current discovery snapshot, or previously resolved markets.
An unknown/unlisted mint receives 404 without requesting arbitrary provider data.

The adapter selects the first liquid, identity-verified pool in the provider's
ranked response. It verifies Solana pool/token relationships and the OHLCV token
metadata, including assets on the quote side. Requests explicitly select USD,
the correct base/quote token and `include_empty_intervals=false`. Results are
validated, deduplicated and sorted before reaching Lightweight Charts 4.2.
Once selected, a detail view pins the pool for refresh and backfill. Candles from
different pools, mints, intervals or currencies are never merged.

The entity denies all direct client operations. The function's service-role
access returns only normalized public fields, never entity metadata or upstream
error bodies. Incoming bodies are limited to 1 KiB; provider responses to 1 MB,
requests to 8 seconds and pages to 300 candles. The frontend has abortable
25-second requests and rejects mismatched identities/cursors.

| Cache item | Freshness policy |
| --- | --- |
| Selected pool per mint | 6 hours |
| Verified selected-pool mapping | Initially 7 days; direct resolution refreshes for 6 hours |
| Latest candle page | 60 seconds |
| Older candle page | 24 hours |
| Provider 429 cooldown | Shared, bounded Retry-After of 60–3,600 seconds |

Immutable records are selected by request start time. Publication prunes older
generations per key, retaining the newest two and concurrent timestamp ties;
each cleanup is bounded. At most once per minute per instance, another bounded
sweep removes up to 50 records expired more than 14 days ago. A failed cleanup
does not hide fetched data. Check actual entity quotas and usage during rollout.

Unlike the scheduled Jupiter snapshot reader, candle requests can initiate
provider work on cache misses. Work for the same resolved page coalesces within
an instance; the durable cache is shared. Admission is limited to 16 upstream calls per minute
**per function instance**. This is not an atomic, deployment-wide rate limiter.
The provider's free limit is variable: its OpenAPI description says approximately
10 calls/minute, while its FAQ says 30. A cold six-card homepage requires up to
12 calls; provider throttling can still delay some cards. Featured cards do
not continuously poll; detail views poll no faster than once a minute and honor
cooldowns. New instances/uncached traffic can still exhaust the provider quota.
Higher traffic requires an appropriate provider plan and shared quota control.

## Verification and hosted rollout

Cleanup checks: 20 chart tests, 19 discovery tests and nine Solana chart tests
pass (48 total), including automatic/explicit pool request coalescing and
separation of different pools, intervals and history cursors. Lint and production
build pass without adding package dependencies. Only one active `createChart`
implementation remains. The original PR #24 also passed 105 offline tests and
seven fixture-render cases; those broader checks were not repeated for this
focused cleanup. None of these checks executes browser canvas interaction.

The anonymous GeckoTerminal smoke request from this environment returned HTTP
403. Fixture tests therefore verify the documented API contract, not live pool
coverage. The earlier browser preview rejected localhost with
`ERR_BLOCKED_BY_CLIENT`; hosted drag/zoom, mobile layout and canvas checks remain
open. The build retains existing missing-local-Base44-configuration and large
chunk warnings. Build through the normal Base44 workflow with the real public
app configuration.

After merge, deploy the entity, function/shared code and frontend together, then:

1. Open SOL, cbBTC, Portal ETH, FARTCOIN, WIF and ANSEM on the hosted app. Confirm
   the selected pool contains the exact catalog mint, the displayed USD price
   agrees with that pool, and live candles/volume are returned. Allow cold-cache
   retries; inspect 403/429 responses if data remains unavailable.
2. In a signed-out session, verify function access under the app's real hosting
   settings. Direct entity reads/writes must remain denied. App-level sign-in
   requirements must be configured deliberately, not removed from unrelated APIs.
3. At 360/768/1440px, test interval and style changes, crosshair, pan/zoom, older
   pages and Follow latest. Rapidly change tokens/intervals while requests are
   pending; old responses must not appear on the new chart. Check that history
   loading preserves the viewed time window.
4. Confirm delayed/provider-limited responses retain the last good data and its
   age, empty history stays empty, quote-side assets have the correct price, and
   Kydos launch/curve charts retain SOL units. Monitor cache usage and provider
   limits before increasing traffic.

Rollback restores the prior frontend and disables the chart function. Its cache
is separate from the Jupiter snapshots, Kydos trade events and wallet state.

## Primary references

- [GeckoTerminal official OpenAPI](https://api.geckoterminal.com/docs/v2/swagger.json)
- [GeckoTerminal API FAQ and rate limits](https://apiguide.geckoterminal.com/faq)
- [CoinGecko pool OHLCV contract](https://docs.coingecko.com/reference/pool-ohlcv-contract-address)
- [CoinGecko token pool discovery](https://docs.coingecko.com/reference/top-pools-contract-address)
- [Lightweight Charts 4.2 time-scale API](https://tradingview.github.io/lightweight-charts/docs/4.2/api/interfaces/ITimeScaleApi)
- [Jupiter token information](https://developers.jup.ag/docs/tokens/token-information)
