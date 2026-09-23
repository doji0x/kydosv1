# Homepage market discovery plan

Status: **Milestones 1–2 approved and implemented on `codex/homepage-market-discovery`.**

The owner approved implementation and specified **`JUP_API_KEY`** as the existing
environment variable. The catalog uses the proposed cbBTC, Portal ETH and ANSEM
The Black Bull identities below. See [market-discovery-rollout.md](market-discovery-rollout.md)
for the implemented contract, setup and remaining hosted checks. Historical
charts and integrated swaps remain separate milestones. Research findings below
describe the source baseline, not an assertion that the new code is deployed.

Researched 23 September 2026 against `doji0x/kydosv1` main commit
`83f3f9ca6818494e8838e38e7d2f13811aecf64e`. This document proposes product and
implementation choices; it does not claim the feature or provider integrations
are deployed.

## Recommended outcome

Make the homepage a Solana market discovery screen with a persistent selection
of familiar coins, a changing trending list, and a dedicated Kydos launches tab.
Use Jupiter for discovery and current market data, retain Helius for on-chain
information, and add Birdeye when historical charts are approved. External market
browsing can ship independently of the Kydos program deployment and DAMM migration.

The recommended first delivery is **milestones 1 and 2** below: a useful homepage,
watchlist, and external token overview. Full historical charts and integrated swaps
are separate extensions with explicit dependencies.

## What the repository currently supports

| Area | Finding | Proposed change |
| --- | --- | --- |
| `src/pages/Board.jsx` | `/` polls `solanaBoard` every 30 seconds and shows a narrow list of Kydos launches. | Add discovery sections and a dedicated market-data hook. |
| `base44/functions/solanaBoard/entry.ts` | Requires a signed-in user; reads canonical Kydos events on the configured RPC cluster. Rankings cover the latest 200 indexed launches and can be partial. | Keep this source for the Kydos tab; add an external market endpoint. |
| `src/components/board/BoardTokenCard.jsx` | Every card links to `/solana/:mint`. | External rows need their own route. |
| `src/pages/SolanaMarket.jsx` | Loads Kydos curve accounts and mounts Kydos trading controls. | Add `/markets/solana/:mint` for external token overviews. |
| `src/components/solana/MarketCandleChart.jsx` | Reusable candle renderer, but labels and accessibility text assume SOL price/volume. | Later accept explicit price currency, volume unit, and series identity. |
| Navigation and authentication | `TopBar` has a narrow container; its logo links to launch. The app shell can redirect to login depending on settings/session. | Align desktop navigation with discovery; logo returns home; explicitly support public market reads. |

React Query 5, Tailwind, Radix UI, Lucide, and Lightweight Charts 4.2.3 are already
installed. The homepage work does not require a new UI framework. Hosted Base44
settings and actual deployment status were not inspected in this research.

## Initial coin selection

Treat the homepage as a list of **token markets priced in USD**. A token can trade
in many SOL/USDC pools; it should appear once, keyed by mainnet and mint. Individual
pairs/pools belong in a later market detail view.

| Requested asset | Proposed display identity | Solana mint candidate | Evidence / status |
| --- | --- | --- | --- |
| SOL | SOL | `So11111111111111111111111111111111111111112` | Jupiter's SOL market identifier uses the WSOL mint. Display native SOL clearly. [Price documentation](https://developers.jup.ag/docs/price/index). |
| Bitcoin | Bitcoin · cbBTC | `cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij` | Coinbase publishes this Solana address. Proposed BTC representation, subject to current liquidity validation. [Issuer](https://www.coinbase.com/cbbtc). |
| WETH / ETH | Ether · Portal/Wormhole | `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs` | Jupiter identifies this as Ether (Portal), symbol ETH. Confirm the intended wrapper before pinning; do not resolve by the text WETH alone. [Market identity](https://jup.ag/tokens/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs). |
| FARTCOIN | Fartcoin | `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` | Documented Jupiter market candidate. [Market identity](https://jup.ag/tokens/9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump). |
| WIF | dogwifhat | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` | The project website links this exact contract. [Project](https://dogwifcoin.org/), [linked contract](https://solscan.io/token/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm). |
| ANSEM | Candidate: The Black Bull | `9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump` | **Owner confirmation required.** Jupiter has several ANSEM namesakes. This is a candidate, not a confirmed interpretation of the request. [Candidate market](https://jup.ag/tokens/9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump). |

Suggested expansion: **JUP, JTO, RAY** in the Solana ecosystem group; **BONK,
POPCAT, PENGU** in the curated meme group; **USDC** as a quote asset/search result.
Their exact mints should be verified before inclusion. These are proposed catalog
entries, not a claim about their current ranking.

Before enabling a curated entry, compare issuer/project identity, Jupiter metadata,
and Helius mainnet mint information, including decimals and token program. Symbols
are not unique. Store the verified address and provenance in a small versioned
catalog; do not assume external tokens share Kydos's six decimals or fixed supply.

BTC and ETH on this page represent specific Solana wrapped assets. Their supply,
liquidity, and valuation must not be presented as the global Bitcoin/Ethereum
market cap. Show the wrapper label and mint; omit an ambiguous market-cap figure.

## Data providers

| Provider | Role | Decision |
| --- | --- | --- |
| Jupiter Tokens V2 | Token metadata, discovery categories, verification indicators, liquidity, market cap/FDV, and interval statistics. | Primary homepage provider. [Token information](https://developers.jup.ag/docs/tokens/token-information). |
| Jupiter Price V3 | Batched current USD prices, up to 50 mints per call; some mints are omitted when a reliable price is unavailable. | Optional faster price refresh; avoid duplicating Tokens V2 calls initially. [Price API](https://developers.jup.ag/docs/price/index). |
| Existing Helius | Mint/account checks, balances, metadata, and Kydos event indexing. DAS can include token prices. | Keep it. The reviewed DAS interfaces do not replace a ready-made trending and candle service. [DAS](https://www.helius.dev/docs/das-api). |
| Birdeye | Historical token/pair OHLCV and richer market data. | Preferred chart extension; requires an API key with suitable endpoint access and usage budget. [OHLCV V3](https://data.birdeye.so/docs/data-api/price-ohlcv/get-defi-v3-ohlcv). |
| CoinGecko / GeckoTerminal | Pool-specific OHLCV and pool discovery. | Alternative if already subscribed. Pool selection adds work; plan/retention limits need checking. [Pool candles](https://docs.coingecko.com/reference/pool-ohlcv-contract-address). |
| DEX Screener | Pair metadata and market snapshots. | Useful supplementary pool lookup. Its documented reference is not the proposed candle provider, and paid boosts should not define organic trending. [API reference](https://docs.dexscreener.com/api/reference). |

For Jupiter, use the currently documented `api.jup.ag` APIs:

- `/tokens/v2/search?query=<mint-list>` for the curated catalog; up to 100 mints.
- `/tokens/v2/toptrending/{interval}?limit=50` for discovery, with `5m`, `1h`,
  `6h`, and `24h` intervals. The category maximum is 100 results.
- `/price/v3?ids=<mint-list>` only when a separate price refresh is justified.

Jupiter's category endpoint excludes generic staples such as SOL and USDC, so the
curated section is necessary. Preserve provider order and identify Jupiter as the
ranking source. [Category contract](https://developers.jup.ag/docs/api-reference/tokens/category),
[search contract](https://developers.jup.ag/docs/api-reference/tokens/search).

Jupiter currently documents a free key at **60 requests/minute**, shared across the
organisation's main API bucket. Developer is **$25/month for 600 requests/minute**;
paid credits and overages also apply. Start with a free key and measured traffic,
then upgrade if needed. Current pricing and limits must be rechecked at rollout.
[Rate limits](https://developers.jup.ag/docs/portal/rate-limits),
[plans](https://developers.jup.ag/docs/portal/plans).

No documented public spot OHLCV endpoint was found in Jupiter's reviewed API index;
its website having charts does not make its internal chart service a supported
integration. Use a documented historical provider for candles.
[Documentation index](https://developers.jup.ag/docs/llms.txt).

## FOMO-inspired frontend

The reference used is **fomo.family**. Its public desktop/mobile product previews
were visually inspected: dark surfaces, compact token rows with logos and aligned
price/change values, discovery tabs, and a larger desktop market workspace. The
signed-in application was not inspected. The official web announcement also
describes trending discovery and social context.
[Public preview](https://fomo.family/),
[web announcement](https://fomo.family/blog/announcing-fomo-web).

Proposed Kydos screen:

1. **Header:** Kydos identity, token search, clear Solana mainnet label, and account
   controls. Keep black/gold styling; reserve green/red for market movement.
2. **Featured strip:** SOL, cbBTC, Portal ETH, FARTCOIN, WIF, and the confirmed ANSEM
   asset. Curated positions stay visible even when those coins are not trending.
3. **Tabs:** Trending, Majors, Memes, Kydos, Watchlist. Trending is the default.
   The Kydos tab retains its own cluster and partial-coverage label.
4. **Trending controls:** 5m / 1h / 6h / 24h, default 24h; optional liquidity and
   verification filters. Show active filters and preserve them in URL parameters.
5. **Desktop list:** rank, logo/name/ticker, USD price, selected-period change,
   period volume, liquidity, and market cap where its meaning is clear. Add a
   star and mint-copy control without nesting buttons inside a row link.
6. **Mobile list:** logo/name plus price/change on the first line, a compact
   volume/liquidity line below, 44px tap targets, scrollable tabs, and the existing
   bottom navigation. Search and the primary metrics must fit at 360px.
7. **Details:** selecting an external token opens `/markets/solana/:mint`, initially
   with identity, price, interval stats, liquidity, source/freshness, and a clearly
   labeled link to its Jupiter page. Kydos tokens retain their existing curve route.
8. **Watchlist:** local browser persistence initially, keyed by chain and mint.
   Cross-device account synchronization is a later addition.

Start with search across the curated and downloaded discovery catalog, explicitly
labeled “Search listed tokens.” Whole-network search can follow with a bounded,
cached server endpoint and a shared provider request budget. Do not imply that
filtering 50 downloaded rows searches all Solana markets.

Use React Query for request deduplication, cached navigation, visibility-aware
polling, and cancellation/stale-response protection. Render skeletons, empty
results, missing images, partial data, and provider failures as distinct states.
Retain useful data during refreshes; announce errors without shifting the layout.
Use accessible tab/sort semantics, keyboard focus, signed percentage text, and
reduced motion. Keep row order stable while a user is interacting with controls.

The desktop container can expand to approximately 1200–1280px on market routes.
The existing forum/profile layout should keep its appropriate reading width.

## Backend and data boundaries

Add a provider adapter, curated registry, snapshot refresh function, public read
function, and a shared persisted market snapshot. Proposed paths:

- `base44/shared/jupiterMarkets.js`
- `base44/shared/marketCatalog.js`
- `base44/functions/refreshMarketDiscovery/entry.ts`
- `base44/functions/marketDiscovery/entry.ts`
- `base44/entities/MarketDiscoverySnapshot.jsonc`
- `scripts/run-market-discovery.mjs`
- `src/hooks/useMarketDiscovery.js`
- `src/components/markets/*` and `src/pages/ExternalMarket.jsx`

Normalize data into a provider-independent contract: `chain`, `mint`, `name`,
`symbol`, `logoUrl`, `decimals`, `tokenProgram`, `marketKind`, `priceUsd`,
`changePct`, `volumeUsd`, `liquidityUsd`, `marketCapUsd`, `fdvUsd`, `interval`,
`providerRank`, verification/quality flags, source timestamps, fetch timestamps,
and freshness state. Preserve nulls. A missing price is not zero; a percentage
change is not trading volume. Confirm buy/sell volume semantics in recorded API
fixtures before mapping totals.

Use one mainnet row per mint. Do not store external snapshots in `SolanaTrade`,
manufacture Kydos launch events, or route external mints into Kydos buy/sell
instructions. USD prices and external liquidity are separate from Kydos reserve
accounting. A future migrated Kydos market requires its verified migration mapping.

Suggested operating design:

- One supervised refresher obtains four trending intervals and the curated mint
  batch every minute through the included Base44 cron, then publishes one bounded
  snapshot containing token data and ranked mint lists. This is approximately
  **5 Jupiter requests/minute**
  before retries or optional services, independent of homepage visitor count.
- Browser reads return that persisted snapshot and never trigger a full refresh.
  Start with 30-second visible-tab polling. A sustained 30-day minute refresh cycle
  is about 216,000 Jupiter calls and 43,200 snapshot publications; Base44 operations
  have their own costs. The optional 30-second worker doubles those counts.
- Use a separate market-refresh credential and exactly one worker, independent
  of the canonical Kydos indexer when using the optional worker. Disable the cron
  first. Keep requests serialized/bounded and retain the last complete successful
  snapshot on failure. Failed jobs do not retry upstream within the invocation.
- A per-function in-memory cache or boolean lock is not shared coordination.
  Base44 does not enforce unique entity keys. Publish immutable complete generations
  and read the latest by start time; a slower older worker cannot overwrite a newer
  generation. Prune records older than 15 minutes after a successful publication.
  The in-process guard coalesces only one instance; operate exactly one scheduler.
  Validate snapshot size and publication behavior against the actual Base44 plan.
- Base44's documented scheduler uses minute-based schedules. If a supervised
  worker is undesirable, use the included minute cron and verify its authenticated
  caller identity on the deployed app; do not promise sub-minute freshness from cron.
- Keep `JUP_API_KEY` in Base44 secrets, with the adapter sending `x-api-key`.
  Provider keys never go into `VITE_*`, browser bundles, URLs, or user-facing logs.
  Restrict snapshot mutations to the refresh function; public reads return only
  normalized market fields. Bound inputs and reject unsupported chains/mints.

These persistence/scheduling choices follow the documented platform constraints.
[Entity uniqueness](https://docs.base44.com/developers/backend/resources/entities/entity-schemas),
[automations](https://docs.base44.com/developers/backend/resources/backend-functions/automations).

Show snapshot age and source, with an initial stale threshold of 90 seconds and
unavailable-current-data threshold of five minutes. Retain the last-good timestamp
on errors. Preserve provider timestamps/block identifiers as well: recent fetching
does not prove a token recently traded. Test thresholds against observed latency.

The default trending filter should exclude provider-flagged suspicious entries and
missing reliable prices. Tune liquidity/activity thresholds after sampling the
real response; keep curated majors separate. Verification and organic score are
provider signals, not guarantees. Jupiter describes organic score as a relative
activity measure. [Tokens API](https://developers.jup.ag/docs/tokens/index).

Public discovery requires checking both the frontend route guard and hosted Base44
app/function access. Keep login gates for existing private/account/admin actions.
Public visitors can see external market data without connecting Phantom; the
existing authenticated Kydos tab can offer sign-in until its public-read policy is
separately settled. A mainnet market feed must remain labeled mainnet even if the
launchpad RPC is configured for devnet.

## Delivery milestones and acceptance

| Milestone | Deliverable | Acceptance |
| --- | --- | --- |
| 1. Catalog and data service | Confirm mints; keyed provider smoke test; normalized snapshots; single refresher; public read API. | Requested confirmed assets resolve by mint, native/wrapped identity is correct, and concurrency does not multiply upstream refreshes. |
| 2. Homepage and overview | Featured strip, discovery tabs/filters, responsive rows, local watchlist, catalog search, external overview route. | Usable at 360/768/1440px; external clicks never load a Kydos curve; errors and stale data are visible; no wallet needed to browse. |
| 3. Historical charts — optional extension | Birdeye adapter, historical paging, real sparklines, and external candle view. | Correct USD OHLCV, timestamps, units, missing intervals, mint/timeframe reset, and historical backfill; provider access and budget verified. |
| 4. Integrated swaps — separate scope | Jupiter quote/sign/execute flow using Phantom. | Explicit quote review, fee/slippage/price-impact display, native SOL funding behavior, signing, and recovery validation before enabling buys. |

For milestone 3, reuse the candle renderer after making denomination explicit;
key the series by chain, mint, provider/pool, interval, and currency. Start with
1m/5m/15m/1h/1d views and fetch history only for the opened token. Birdeye V3
supports token OHLCV, bounded history pages, and unpadded gaps. Use its USD volume
field when displaying USD volume. Validate parameter details against actual
responses. [OHLCV V3 contract](https://data.birdeye.so/docs/data-api/price-ohlcv/get-defi-v3-ohlcv).

If CoinGecko pool candles are chosen, resolve a liquid pool containing the exact
mint and retain its base/quote orientation and pool address in the series identity.
Do not splice different pool histories invisibly. Never synthesize historical
candles from today's price or convert old SOL candles using today's SOL/USD rate.
Sparklines require actual historical observations; omit them until those exist.
[Pool OHLCV contract](https://docs.coingecko.com/reference/pool-ohlcv-contract-address).

For milestone 4, current Jupiter documentation recommends Swap V2's order/execute
flow for managed execution. Reuse the app's Phantom connection while building an
external swap adapter. Discovery data is not an executable quote, and FOMO's
embedded-wallet quick-buy experience does not establish our Phantom signing flow.
[Current swap integration](https://developers.jup.ag/docs/swap/order-and-execute).

Meaningful checks for implementation: mint/name collisions; SOL/WSOL identity;
external decimals; null/missing prices and valuations; duplicate tokens across
pools; stale success after a newer request; provider 401/403/429/timeouts; partial
snapshot failure; public versus protected routes; query/mint changes; and Kydos
regressions. Run lint/build and the relevant existing tests. Use a read-only hosted
smoke test and desktop/mobile visual review before release.

## Original approval inputs and implementation decisions

1. **Jupiter key and plan:** the owner specified an existing `JUP_API_KEY`.
   It is consumed only by the backend. The key is absent in this local checkout;
   the authenticated provider smoke check must run on the deployed backend.
2. **Asset identity:** approval proceeds with cbBTC, Portal ETH and The Black Bull
   at the exact proposed mints. Expanded catalog entries have Jupiter identity
   pages recorded in the registry. Independent Helius mint checks remain unrun.
3. **Visual reference:** this plan assumes fomo.family. A screenshot of the exact
   FOMO screen you prefer can refine the layout, but is not required for milestones
   1–2 if the described direction is accepted.
4. **Scope:** milestones 1–2 are approved. Include milestone 3 if immediate full
   charts are wanted and a suitable Birdeye/CoinGecko plan is available. Integrated
   swaps require milestone 4 approval.
5. **Operations:** default to the included minute scheduler. A supervised worker
   is an alternative. Verify scheduler identity, public browsing settings and
   Base44 usage limits on the hosted app before release.

Research limits: official documentation and public token pages were reviewed;
FOMO's public product previews were inspected. Three anonymous Jupiter API read
requests returned Cloudflare 403/error 1010 from this environment. No authenticated
provider response, Helius mint check, live swap quote, or hosted integration test
was completed. Candidate identities and API contracts still require the keyed
mainnet read checks in milestone 1. These were the limits of the planning phase;
the implemented feature and current verification limits are recorded in the rollout
document. No deployment or credential change is claimed.
