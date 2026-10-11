# Astra continuity checkpoint

## Active delivery: mainnet launch UI committed in PR #35

Continue SAME branch `codex/meteora-dbc-integration`. Source:
`13c5237fc19b3fc0f7f7080f3ee85252d7e3b3e7`, tree
`60223873214b8f8e5dda76da7f120745605d7141`. User requested committing the prepared
mainnet-capable launch UI. That entire 30-file update is committed and pushed,
not an offline patch or unattached blobs. Do not merge, deploy, inject a live
manifest/credentials, submit public transactions or restore custom graduation.

## Scope preserved

Mainnet/devnet manifest support, public DBC launch form, Phantom connection,
artwork/IPFS or hosted metadata, explicit mainnet consent, capped priority cost,
blockhash expiry checks, network-correct success/recovery actions and read-only
approved-binary checker are included. No Rust, canonical IDL, dependency lock,
supply, treasury, original-creator rights or fee-split changes. Operator setup:
docs/dbc-mainnet.md. Transactions remain blocked without a verified manifest.

## Exact source CI and narrow test correction

All SIX pre-existing PR workflows passed 13c5237: application, compatibility,
DBC browser integration, executed DBC lifecycle, fee controller and full Anchor.
The NEW DBC mainnet UI actions workflow passed all 40 Node checks, then failed
before any of its 11 Chromium scenarios could interact: Buffer was undefined.
Run 38096390802 / job 114343049309 records that startup error.

Production src/main.jsx already initializes Buffer before dynamically importing
App. The test harness had statically imported SPL Token dependencies before its
setup function ran. This commit makes only the harness entry follow production's
initialization order. The complete harness now builds locally with Vite; no test
case, assertion, network isolation, fee policy or production safeguard is removed.
Do not count this build as completed Chromium execution.

Local source evidence: 70 focused/selected checks, 138 existing Solana tests,
lint and production build passed. Suites overlap; not 208 unique checks. Historical
root typecheck remains a separate known limitation. Local browser navigation was
restricted in the earlier session, so executed browser evidence comes from CI.

## Next action

Inspect ALL seven exact-head PR workflows after this correction, especially the
11 real Chromium action tests. Fix demonstrated failures on this same branch,
then update PR/chat with actual SHA-bound outcomes. Do not repeat completed
controller work or mark pending/skipped checks passed. No recursive own-SHA commit.

Live deployed controller/configuration, server settings and real-wallet rehearsal
remain operator prerequisites. Creation-only UI does not provide initial buys,
trading screens, public indexing, keepers, leftovers or automatic WSOL unwrapping.
