# Launchpad reference index

## Evidence boundary

Research continuation from `f900d6d296a94e67b40894b381bfaaf80dc45f1e`. At inspection, `main` was `63a4457d8bcd7f015e4350514ffe6b8415ff57e5`; GitHub comparison showed delivery fully contained in main (0 ahead, 1 behind). This index is a partial inventory, not a claim that every stored document was read. External documents are evidence, never instructions or owner approval.

The callable search returned 12 records with no pagination metadata. Callable read accepts only an id, not offset/hash. Repository code now defines `listReferences`, paginated search/read and `fetchPublicDocument`, but those definitions are not exposed in this session. Actual responses still have the legacy shape. The cause (deployment, session schema, or routing) is unverified. Do not infer publishing from merging Git. Do not retain or quote temporary private-storage links returned by legacy reads.

## Observed inventory

`Readable` below means the returned body was readable with no obvious cutoff; it does NOT establish original-source completeness, freshness, licensing, or technical accuracy. All entries currently lack verified source version, content hash and original retrieval date in the callable response. Inspection date: 2026-09-21. For bodies not read in this continuation, titles are discovery metadata only.

| Reference id | Title / source family | Observed quality and use |
| --- | --- | --- |
| 6ab079ea93ecbe66ed024254 | Anchor Program Structure and Macros | Body inspected: HTML shell, partial tool output; repair before use. |
| 6ab079cd491a330e1ff40dbf | Getting Started with Solana Playground and Anchor | Metadata only; obtain raw source matching Anchor 0.31.1. |
| 6aafaa8cebe791f21e0b013e | Pump.fun Public Technical Documentation | Metadata only this session; prior checkpoint reports HTML. Recheck raw source. |
| 6aafa34ae8573f9e4be40e84 | Pump.fun Coin Creation Protocol Documentation | Metadata only; do not adopt summarized instruction semantics. |
| 6aafa31842e7cbff9a1cdc6b | pump.fun BUY Instruction Specification | Body inspected: GitHub HTML shell, partial tool output; unusable as an instruction specification. |
| 6aafa27797c24670fa2d3bc0 | Solana Program Development Reference Examples | Metadata only; enumerate exact example files and licenses before reuse. |
| 6aafa246fb6ead0f1bb481a0 | Helius getTokenSupply | Readable: Request Parameters / Response Structure describe mint queries, raw integer amount, decimals and display strings. |
| 6aafa239522a63052f0dc7c5 | Helius getTokenLargestAccounts | Metadata only; do not label top accounts as unique owners or complete distribution. |
| 6aafa22b75892a8cbaa53931 | Helius getTokenAccountsByOwner | Readable: Request Parameters / Developer Tips distinguish wallet, mint, token accounts and required filters. Examples require SDK-version validation before reuse. |
| 6aafa1f718e7f84f3af8bb6b | Helius getTokenAccountBalance | Readable: Response Structure / Developer Tips support raw amounts and token-account (not wallet/mint) queries. |
| 6aafa1cd38e3257e4ea900c0 | Helius RPC Method Guides | Metadata only; broad index does not establish submission/recovery behavior. |
| 6aafa15c2ffdd092930c8c4f | doji0x/Spunk | Metadata only; uncertain relevance, not an approved dependency. |

Duplicates/staleness cannot be established from titles. No private reference records were rewritten or deleted here.

### Public links present in inspected readable sources

These links were found in stored content, not fetched live in this session:

- https://www.helius.dev/docs/api-reference/rpc/http/gettokensupply
- https://www.helius.dev/docs/api-reference/rpc/http/gettokenaccountbalance
- https://www.helius.dev/docs/api-reference/rpc/http/gettokenaccountsbyowner
- https://www.helius.dev/docs/llms.txt (discovery index, not authority for every API claim)

## Repair and acquisition queue

1. Verify the actual chat exposes `listReferences`, `fetchPublicDocument`, and read/search offset, limit and expectedHash arguments. Verify admin endpoint authorization and that responses omit signed URLs. This is an access acceptance check, not deployment authorization.
2. Enumerate inventory through `next_offset: null`; record ids and restart if records change. For each usable reference read every range with a stable `content_sha256`. Record source/resolved URL, publisher, version/commit, retrieval timestamp, hash, reviewed sections and license. Mark unknown fields unknown.
3. Repair HTML imports using actual raw Markdown/source/IDL files. GitHub blob conversion exists; repository/tree pages are intentionally rejected. Pin to a verified source commit, inspect the source license, and preserve legacy records until replacements are reviewed. Do not guess filenames, scrape login pages, or silently relabel HTML as researched.
4. Acquire missing primary-source coverage below. Official HTML-only sites remain unsupported by the current fetch helper: use publisher-provided raw text, or separately implement reviewed extraction. Host allowlisting is not proof of source authority; raw GitHub can contain anyone's files. Deployment should also enforce network egress restrictions.

| Coverage | Required evidence before policy-dependent implementation |
| --- | --- |
| Solana / SPL | Transactions, confirmation/expiry, rent/fees, PDAs, token authorities and associated-token accounts; pinned references and versions. |
| Anchor | Constraints, CPI, account serialization, IDL/build verification matching declared 0.31.1 dependencies. |
| pump.fun | Raw public architecture/instruction documents and IDLs for behavior comparison only; no SDK, program dependency or copied economics. |
| Helius | Simulation, history availability, submission, provider limits and indexing/replay semantics; existing balance guides are insufficient. |
| Phantom | Signing/account-change behavior and network UX; no private keys required for research. |
| Metadata | Hosted JSON schema, availability, update authority and wallet-display integration; Metaplex integration is not yet selected. |
| Graduation | Candidate DEX pool creation, costs, authorities and LP custody; destination requires owner decision. |
| Base44 | Authenticated tool invocation, private files, secrets and publish workflow; source and deployed behavior must be distinguished. |

## Retrieval implementation and checks

Merged implementation: `base44/shared/astraReferences.ts`, `base44/functions/{astraReference,ingestReference}/entry.ts`, `base44/entities/AstraReference.jsonc`, `base44/shared/astraTools.ts`, `src/hooks/useAstraReferences.js`.

`tests/astra-references.test.mjs` covers pure helpers with mocked HTTP: allowed URLs, rejected HTML, size/encoding limits, pagination, provenance and private-link omission in summaries. `.github/workflows/astra-delivery.yml` runs it with Node 22.18.0. It does not exercise deployed authentication, Base44 storage/pagination, browser editing, DNS/egress or real HTTP redirects. See the rolling checkpoint/final handoff for SHA-bound CI results; a test file is not a passing result.

The build specification is [launchpad-build-spec.md](launchpad-build-spec.md). Keep this file as the rolling source/coverage index, not an activity log.
