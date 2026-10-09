# Astra continuity checkpoint

## Active delivery: DBC merge candidate, PR #35

Continue SAME branch `codex/meteora-dbc-integration`. Latest inspected source:
`d8fb79af2d466b0bcb5858011ab5a4aef15a4e30`. User requested finishing outstanding
browser work so THEY can merge. Do not merge, create another branch, enable a
release, deploy, submit public transactions, or restore custom graduation.

Browser patch previously only delivered as an attachment is now committed and
PR #35 is open against main. It includes the owner's custom-graduation revert,
exact DBC lifecycle, fee controller and disabled/devnet-only browser workspace.
The controller code/IDL and fee economics are unchanged by browser completion.
The older active_task in astra-work-state is historical; this is the current
next-action checkpoint. Design: docs/dbc-browser.md and docs/dbc-fee-controller.md.

## Evidence already obtained

- Source controller run 37858540064 at b815a31 fully passed: Rust, safe-stack SBF,
  generated IDL, 23 executed PDA-controller groups, builders and compatibility.
- Browser PR run 37985272502 at d8fb79a fully passed with BOTH committed npm locks
  installed cleanly: browser flow/regressions, SDK differential checks, lint,
  default and opt-in builds, and no tracked-source mutation.
- Application CI 37985272507 and compatibility/evidence 37985272491 passed d8fb79a.
- Full PR checking exposed a reverted legacy-test setup: ambiguous CLI 'none'
  for DAMM authority and websocket confirmation handling of expected failures.
  This commit repairs ONLY the test harness: explicit local authority bytes,
  HTTP confirmed metadata with matching slot/error and required invocation.
  All 14 route-installation assertion groups passed locally using the already
  built b815a31 Kydos artifact and pinned DAMM bytecode. No runtime checks removed.

## Next action before declaring merge-ready

Inspect all workflows on the resulting delivery SHA and PR merge ref, especially
Solana Anchor, DBC browser, fee controller, lifecycle, application and compatibility.
No pending/skipped/failing check may be described as passing. Do not assume older
source evidence proves the whole PR. Resolve actual failures on this branch.
Record final SHA and verified results in PR/chat, not recursive own-SHA commits.

The legacy route test remains a regression for an existing interface, NOT the
selected DBC graduation engine. No program, dependency, authority policy or
production configuration was altered to fix its fixture/confirmation behavior.

## Release limits remain explicit

Public /launch stays Coming soon unless the preview build flag is set; even then
transactions require an independently verified devnet manifest. Mainnet is blocked.
Quote remains WSOL. Browser signing/RPC flow tests are mocked; controller/lifecycle
execution uses isolated validators. No real Phantom or visual-browser pass claimed.
Historical full typecheck is red (prior offline baseline 185 vs patched 182),
not a whole-project green result. Clean-install CI is the merge evidence.
Initial-buy/trading UI, production indexing, automation, leftovers, unwrapping
and live deployment verification are later milestones, not hidden release claims.
