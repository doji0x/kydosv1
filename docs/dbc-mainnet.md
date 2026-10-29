# Mainnet launch UI and release preparation

## What this change enables

The existing `/launch` navigation now opens the actual DBC creation workspace,
not a Coming soon screen. `VITE_KYDOS_DBC_UI_ENABLED` is retired: setting it does
not authorize transactions. The independently reviewed release manifest is the
transaction gate. New production operations require the exact Solana mainnet identity;
unknown networks, mismatched RPCs, unapproved configurations and changed deployed
programs fail before signing.

The public flow connects Phantom, validates token details/artwork, uploads image
and JSON through the existing authenticated metadata service (or accepts an
existing hosted URI), simulates and reviews costs, then requests wallet approval.
Mainnet requires an explicit real-SOL acknowledgment. Original-creator
registration is atomic with creation. Success actions copy the mint, open the
registered DBC launch, show the correct network explorer and create another token.
The new header Connect Phantom action calls the wallet, not the profile route.

Deep links and recovery entries carry the network identity. Opening a confirmed
launch reads its registry directly and supports the existing bonding-fee and
post-migration settlement actions; it does not reinterpret a DBC mint as a legacy
market. Local confirmed launches are labeled as browser history, not an indexer.

## DBC access and approval

Ordinary SPL WSOL-quoted DBC launches do not require a Meteora team member to
approve access. Any payer may create a valid DBC configuration; the creator signs
pool initialization. The operator steps below refer to Kydos's release operator,
not a request for a private DAMM configuration. Unsupported Token-2022 quote
extensions can require a token badge, but that is not the configured WSOL path.
Source: https://docs.meteora.ag/core-products/dbc/accounts-and-permissions

## Mainnet configuration (operator-owned, no secrets in the browser)

1. Independently review and approve the exact Kydos SBF build and controller
   policy; deploy/upgrade through the operator's established approval procedure.
   This code change does not perform a deployment. Keep the Kydos program ID,
   compiled IDL, treasury, DBC/DAMM authorities and economic fingerprint consistent.
2. Provision and independently verify the approved DBC configuration on mainnet.
   Fee and leftover rights must belong to the Kydos fee-authority PDA. Do not use
   a test fixture account or substitute an externally owned wallet as fee claimer.
3. Set **server-side** `HELIUS_RPC_URL` to a trusted mainnet HTTPS RPC. Keep the
   credential out of VITE variables and source. Configure `PINATA_JWT` in the
   server secret manager for image/metadata uploads. The existing hosted-URI
   option works without the upload service or website authentication; Phantom
   authorization is still required. Use HTTPS for the app so wallet integration,
   Web Crypto, clipboard and Web Locks can operate.
4. Prepare a public JSON release manifest with `enabled: true`,
   `genesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"`, the independently
   verified `config` public key, and a `programDataHashes` object. Its keys are:

   - `GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE` (Kydos)
   - `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` (DBC)
   - `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` (DAMM)
   - `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` (Metaplex)

   Each value is the lowercase SHA256 of the **complete verified ProgramData
   account**, including loader header, deployment slot, upgrade authority and
   allocation padding. These are not merely `.so` hashes. Do not generate pins
   by blindly accepting whatever an unreviewed RPC currently reports. No live
   manifest, placeholder hash that authorizes signing, or private key is supplied
   by this PR.
5. With the trusted RPC in the environment, run the read-only checker against
   the operator's approved binary and manifest:

   ```sh
   node solana/scripts/check-dbc-release.mjs --manifest release.json --program solana/target/deploy/kydos_launchpad.so
   ```

   It checks loader/PDA ownership, all four pinned deployments, the full DBC
   policy, the network, and the exact approved Kydos ELF bytes plus zero padding.
   It has no signing or sending path and does not create or modify the manifest.
   A passing report describes an observation, not protection against a future
   upgrade after the last RPC read. Transport failures are not printed with
   credential-bearing RPC URLs.
6. Supply that reviewed JSON as the **build-time** `VITE_KYDOS_DBC_RELEASE`, build
   and publish through the normal deployment process. A missing/disabled manifest
   leaves the form visible but approval blocked. Use Verify launch readiness on
   the deployed site and conduct an explicitly approved, funded wallet rehearsal
   before broad public use. Changing Phantom's selected network alone does not
   change the server RPC or release manifest.

## Transaction and upload safeguards

The approved controller economics are unchanged: nominal 793.1M curve / 206.9M
migration allocation from 1B initial supply; bonding partner fees to Kydos;
newly claimed DAMM base burned; net quote split equally between the original
registry creator and Kydos, with protected rounding dust. Quote payouts remain
WSOL. Sponsor rent/network costs are never taken from anticipated fee revenue.

Priority price is chosen explicitly and bound to the review (0 to 1,000,000
micro-lamports/CU). At the fixed 600,000 CU launch limit the maximum priority
portion is 600,000 lamports; fee operations use 300,000 CU. The network quote
already includes that priority amount, so the displayed total does not add it
twice. This is a bounded user choice, not a dynamic fee prediction or a guarantee
of inclusion. Higher execution budgets require a new review.

Every review is single-use; the ephemeral mint secret stays in memory. Full
release verification and simulation precede signing, and release/network checks
run again after wallet approval. Expired blockhashes are rejected before broadcast.
Wallet-account and message changes abort. A durable journal records the signature
and submitting marker before the single send attempt. Ambiguous outcomes retain
the recovery lock across reloads/tabs; there is no automatic resend.

Image content/type/size and UTF-8 metadata lengths are validated. Invalid network
or release settings block uploads. A successful image CID survives a failed JSON
upload in memory; unchanged successful metadata is reused on review/rejection.
Changing the artwork never reuses another file's CID. Changing the wallet, user,
form or route invalidates an outstanding review. Uploads are public and are not
rolled back when wallet approval is cancelled.

## Verification and remaining release boundaries

Focused local checks: `node --test tests/dbc-browser.test.mjs tests/dbc-metadata.test.mjs tests/dbc-release.test.mjs`.
The `DBC mainnet UI actions` workflow adds actual Chromium interaction tests using
the real React/provider/review code with isolated wallet, RPC and upload fixtures.
It exercises mainnet launch, copy/open actions, upload retry, rejected approvals,
ambiguous recovery, missing configuration, mismatched networks, rejection of devnet releases,
fee settlement, funding failures, signed-out hosted metadata and mobile layout.
No public RPC or real-wallet approval is used in those tests. Existing independent
controller/lifecycle validators and compatibility workflows remain enabled.

Creation does not include an initial purchase. DBC/DAMM buy/sell screens,
production DBC indexing/discovery, graduation/settlement keepers, leftover handling
and optional SOL unwrapping are not supplied by this UI change. The legacy admin
server-wallet launch path is not silently repointed. The full frontend compiler and coverage checks now pass and run in CI. Maintained backend/shared and Node-tooling coverage now have separate frozen
checks and regressions; see [backend-tooling.md](backend-tooling.md) for the
explicit boundaries. Passing types is not live deployment verification or a
strict-mode security audit. See [mainnet-readiness.md](mainnet-readiness.md).

Primary protocol references: https://solana.com/docs/core/fees/fee-structure,
https://solana.com/docs/rpc/http/getgenesishash,
https://solana.com/docs/rpc/http/simulatetransaction.
