# Solana market discovery rollout

Milestones 1–2 add a public discovery homepage and external token overviews.
Implementation base: `83f3f9ca6818494e8838e38e7d2f13811aecf64e`.
Branch: `codex/homepage-market-discovery`. The feature is not deployed by this change.

## What ships

- Featured SOL, cbBTC, Portal/Wormhole ETH, FARTCOIN, WIF and ANSEM (The Black Bull).
  The exact-mint registry also includes JUP, JTO, RAY, BONK, PENGU, POPCAT and USDC.
- Jupiter trending lists for 5m/1h/6h/24h, curated majors/memes, liquidity and
  verification filters, sorting, catalog search and browser-local watchlists.
- `/markets/solana/:mint` shows identity and USD market statistics, with links to
  Jupiter and Solscan. It never calls Kydos curve instructions. Unknown/dropped
  tokens retain their mint identity and show unavailable values.
- The Kydos tab retains authenticated `solanaBoard` data, its own actual RPC
  network label, SOL volume and `/solana/:mint` trading route. Mainnet discovery
  does not depend on the launchpad program being deployed.
- Public routes do not prompt Phantom. Existing launch/account/admin routes keep
  their auth boundary. Hosted app settings may still require sign-in.

BTC/ETH are the named Solana wrapped assets, not their native chains. Their market
caps and FDVs are intentionally omitted. SOL uses the WSOL market identifier;
this does not equate native wallet SOL with SPL WSOL balances. Token verification
is Jupiter's listing signal. No arbitrary symbol resolution, fabricated chart
history, embedded Jupiter swaps, new dependencies or wallet transactions are added.

## Backend configuration

| Setting | Location | Purpose |
| --- | --- | --- |
| `JUP_API_KEY` | Base44 backend secrets/environment | Required. Existing owner-supplied Jupiter key; sent only as `x-api-key`. |
| `KYDOS_MARKET_REFRESH_TOKEN` | Backend and optional worker | Optional, random secret of at least 32 characters. Authenticates only the external worker. |
| `KYDOS_MARKET_REFRESH_URL` | Optional worker environment | HTTPS URL of the deployed `refreshMarketDiscovery` function, with no query parameters. |

Never prefix either secret with `VITE_`. The browser receives normalized public
market fields only. `MarketDiscoverySnapshot` denies direct client read and write
through entity RLS. Its read function uses the service role and an explicit field
allowlist; entity IDs, creator data and provider errors are not public responses.

Deploy the entity, shared modules, both backend functions, refresh function config
and frontend through the existing Base44 workflow. The checked-in cron requests
one refresh per minute. Authentication is checked using the SDK's verified
`auth.me()` result: an enabled administrator or service user with an ID may refresh.
An ordinary user's platform-injected service header is **not** authorization.
The scheduler's exact caller identity is a hosted integration check, not something
established by local mocks. A 403 must be diagnosed; do not remove the auth check.

An administrator can seed/check the snapshot using **Refresh shared market data**
at the bottom of Discover. This exposes configuration/provider failures to the
admin without exposing a key. Public Retry only reads the shared snapshot.

If the host cannot run an authorized minute schedule, disable the cron and run
exactly one supervised Node 20.3+ worker with the optional settings above:

```sh
node scripts/run-market-discovery.mjs --once
node scripts/run-market-discovery.mjs
```

The worker polls every 30 seconds, never overlaps itself, backs off failures and
stops on rejected authorization. Keep the Jupiter key on the backend; it is not
needed by this worker. Do not run cron and worker together.

## Cache and market semantics

One refresh makes five serialized requests: a 13-mint Tokens V2 search batch and
four `toptrending` calls of at most 50 rows each. Jobs have bounded responses and
6.5-second per-request timeouts. They do not retry upstream within an invocation.
The minute schedule is approximately five Jupiter requests/minute before manual
refreshes (216,000/month at 30 days). This is independent of visitor count. The
optional 30-second worker approximately doubles this. Other apps using the same
Jupiter organization share its rate limit. Base44 reads/writes and hosting have
their own usage costs.

All five requests must succeed before an immutable snapshot is published. Reader
queries select the latest complete generation by **job start time**. That avoids
an older, slower job replacing a newer one without claiming unsupported atomic
locks or unique entity constraints. A 25-second freshness check and an in-process
promise reduce repeat work; they are not distributed quota enforcement. After a
successful publication, cleanup deletes up to 50 snapshots older than 15 minutes.
Failed refreshes leave the last good record and its original timestamp intact.

Public readers never initiate provider calls. React Query shares one mainnet
snapshot across pages and polls visible tabs every 30 seconds. Freshness is also
recomputed locally: delayed after 90 seconds, unavailable-current-data after five
minutes. Old values remain visible with a historical-data warning. Missing prices
are `null`/`—`, never zero; genuine zero volume stays zero. Token-level provider
timestamps and price block IDs are retained. A recent fetch does not imply a
recent trade.

Interval volume is `buyVolume + sellVolume` only when both fields are known.
`volumeChange` is a percentage, never a dollar volume. Price changes remain in
Jupiter's percentage units. Trending preserves provider order and excludes
provider-flagged suspicious or unpriced entries. Curated lists stay available
when staples are absent from category results. Search is limited to the downloaded
catalog, explicitly labeled in the UI. Watchlist identity survives a feed dropout;
unsupported browser storage falls back to the current page's memory with notice.

## Verification and rollout checks

Local fixture checks cover identity collisions, null/zero/unit handling, fixed
requests, bounded responses, provider failures, stale data, concurrent publication,
public reads, protected refresh authorization, watchlist persistence rules and
external route targets. Run:

```sh
node --test tests/market-discovery.test.mjs
npm run lint
npm run build
```

The 68 existing offline Solana tests also pass. An initial broad test glob included
the validator-only `creation.test.js`; that test stopped before execution because
`ANCHOR_PROVIDER_URL` was absent. No validator deployment, funded transaction or
live creation test was performed. A fixture component-render smoke check covers
populated, guest Kydos, empty watchlist, external, unknown mint, invalid mint and
stale states. This is not a browser interaction or pixel-layout check.

Local limits: neither `JUP_API_KEY` nor `HELIUS_RPC_URL` is available in this
checkout. Hosted Base44 credentials/settings are not configured locally. The
browser preview rejected localhost access (`ERR_BLOCKED_BY_CLIENT`), so real
360/768/1440px browser verification remains open. Production build succeeds with
the existing large-chunk advisory and a missing-local-app-ID warning; Base44 must
inject the real public app configuration when building for deployment.

Before enabling the release on the hosted app:

1. Confirm `JUP_API_KEY` exists on the backend. Use the admin refresh once; check
   its response and the stored snapshot's size against the actual Base44 plan.
   Verify the exact catalog mints, token programs, decimals and metadata with
   Jupiter and the existing Helius mainnet RPC. No independent live mint check is
   claimed by the static registry.
2. Confirm the scheduled invocation authenticates and advances `fetchedAt` on
   subsequent minutes. If not, correct its platform identity or use the worker;
   leave authorization intact. Operate a single refresh source.
3. In a signed-out session, verify `marketDiscovery` reads are permitted by app
   settings and direct entity writes/refresh requests are denied. Account, launch
   and admin actions must continue to require their existing authorization.
4. At 360/768/1440px, check search, intervals, filters, stars, keyboard navigation,
   mobile scrolling and external navigation. Confirm `/markets/solana/:mint`
   never opens Kydos trading, while the Kydos tab does. Check wrapper labels.
5. Pause the refresher to verify delayed/historical states, then restore it. A
   failing provider must not replace good data or expose credentials.

Rollback: restore the previous frontend and disable the market refresh automation
or worker. The feature writes only its own snapshot entity; it does not alter
Kydos events, balances, program configuration or curve state.

## Primary references

- [Jupiter token information](https://developers.jup.ag/docs/tokens/token-information)
- [Search contract](https://developers.jup.ag/docs/api-reference/tokens/search)
- [Category contract](https://developers.jup.ag/docs/api-reference/tokens/category)
- [Jupiter rate limits](https://developers.jup.ag/docs/portal/rate-limits)
- [Base44 entity schemas](https://docs.base44.com/developers/backend/resources/entities/entity-schemas)
- [Base44 scheduled functions](https://docs.base44.com/developers/backend/resources/backend-functions/automations)
- [Original design and provider research](homepage-market-discovery-plan.md)
