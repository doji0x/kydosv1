# Astra continuity checkpoint

## Active delivery: DBC fee controller, same branch

Continue `codex/meteora-dbc-integration`. Source:
`f7ea62476083b7b45e27a7267eb097580bda5e88`. Its prior DBC lifecycle CI passed.
Do not restore custom graduation, pursue operator provisioning, modify main,
or reinterpret existing legacy accounts. User requested the next implementation.

The new dbc_fees module adds atomic DBC launch/creator registration, net bonding
partner-fee claims to Kydos, and actual post-migration claim -> base burn ->
equal original-creator/Kydos WSOL payouts. Fee rights are owned by a Kydos PDA;
per-mint custody excludes donations and carries protected odd quote dust.
No raw claim, recipient override, admin sweep, NFT/LP withdrawal or registry reset.
Old program ID, instructions/account layouts, supply and fee policy are preserved.

Local compiled execution passed 23 fee-controller assertion groups, seven JS
builder/IDL tests and 37 Rust tests. Same real pinned DBC/DAMM fixtures as prior
lifecycle. No public-network transaction or paid upgrade. These are LOCAL results;
exact delivery-head CI must be inspected separately.

Save checkpoint: source blobs and runtime tests are committed before the final
browser-IDL synchronization. The workflow exports the exact generated browser
IDL as an artifact, without modifying the checkout. Download/reconcile it and
commit that output; do not invent IDL entries or disable the comparison.

Design: docs/dbc-fee-controller.md. The prior docs/dbc-transition.md is historical
lifecycle evidence; its old statement that the controller is unimplemented is
superseded by this milestone. Update work-state at the final bounded handoff.
Next finish exact-head CI and review, then frontend/indexer and keeper integration.
Surplus, leftovers and rewards are not part of trading-fee settlement. Production
configuration, deployment compatibility and paid-upgrade approval remain separate.
