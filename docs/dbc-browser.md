# DBC browser integration

Current mainnet-capable behavior, operator setup and release boundary are in
[dbc-mainnet.md](dbc-mainnet.md). The initial devnet-only milestone was completed
at `2f5ef70b02a7da44298378a52c1176d430b72131` in PR #35; its six green workflows
are historical evidence, not a substitute for checks on the updated delivery.

The browser routes through Kydos `launch_dbc`, `claim_dbc_fees` and
`settle_damm_fees`. It authenticates original-creator registry bindings and
permanently locked PDA-held DAMM positions. It never uses raw claim instructions,
legacy creation for DBC launches, admin custody keys, automatic WSOL unwrapping,
or a hidden initial purchase. Existing token markets remain on their own routes.

Release verification checks exact mainnet/devnet genesis identity, upgradeable
program and ProgramData PDA ownership, independently approved complete deployment
hashes, and the DBC configuration's fixed economic fingerprint. Mainnet is now
supported, not implicitly enabled: a missing or invalid manifest blocks signing.
The old UI preview flag no longer determines whether the form is visible.

Creation and fee actions are reviewed and simulated, bound to a single-use
in-memory intent, and checked again before wallet approval and broadcast. Explicit
priority cost, account rent and metadata costs are included in the reviewed SOL
budget. Original creator/Kydos payouts remain WSOL; expected fee income does not
fund execution. Program/network changes, account changes, increased cost, altered
wallet messages, missing fees and expired blockhashes fail safely.

Persistent activity is scoped by wallet, chain, program and operation. A durable
signature and submitting marker precede the sole send. Ambiguous results stay
locked for history reconciliation. Confirmed DBC entries link to the DBC page
with network context, not a legacy market. The launch page exposes image upload,
hosted metadata, connect/review/approve, copy/open and creation-again actions.

For on-chain enforcement and tested economics see [dbc-fee-controller.md](dbc-fee-controller.md)
and [dbc-transition.md](dbc-transition.md). The local browser history is not a
production indexer. Do not confuse mainnet-capable code with verified live
configuration, a deployed approved binary, real-wallet rehearsal or public launch
approval. Follow the active PR's exact-SHA checks and mainnet release checklist.
