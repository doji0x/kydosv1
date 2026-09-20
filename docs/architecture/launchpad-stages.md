# Launchpad planning status

## Scope

Owner (#1) requests an independent Robinhood Chain launchpad using Pons as an architectural reference, not an SDK dependency or renamed fork. Preserve the existing frontend. No additional networks or bridges. Document architecture and a file-by-file implementation plan before implementing the protocol. Continuation requests (#2)-(#6) retain that scope. Owner (#7) should not need to commit files manually.

## Commit ownership and recovery

The inspected `base44/functions/astraChat/roles.ts` marks the architect as non-writing and documentation as writing. `base44/functions/astraChat/crew.ts` supplies `commitFile` to writing specialists. The earlier architecture-document assignment used the wrong role: inability of the architect to commit does not mean the owner must perform Git commits.

The architect plans; the documentation specialist commits documentation on the persistent `astra/latest` branch. Other writing specialists commit only within their assignments. Owner review/approval is distinct from performing Git commits. Do not reset the branch or broaden crew permissions to resolve this handoff error. A write is complete only when its tool result confirms success; this document does not itself certify that result.

## Inspected baseline and limits

The foreman's repository inspection found `base44/shared/kydosContracts.js`, which embeds token, factory and bonding-curve Solidity. That source does not provide a separate user-facing launchpad router or a fee/rewards module. Its external liquidity-router interface is not a user-facing launchpad router.

The repository tree also contains frontend launch/quote/trade hooks, deployment/indexing functions and an artifact file. Those files need a complete source review in the next stage. Presence is not proof of correctness, deployed status or end-to-end functionality. No protocol implementation is delivered by this document.

Pons reference supplied in (#1): https://github.com/ponsdotdev/pons-labs. Current Pons sources and a pinned revision have not been verified in this continuation. No additional reference attachment is visible in (#7). A completed comparison must not be claimed.

## Next planning work

1. Read complete launch, quote, trade, wallet, deployment and indexing files and map the existing UI to on-chain interfaces. Starting paths include `src/hooks/useKydosLaunch.js`, `src/hooks/useKydosQuote.js`, `src/hooks/useKydosTrade.js`, `src/lib/kydosContracts.js`, `src/pages/Launch.jsx`, `src/components/token/TradePanel.jsx`, `base44/functions/deployKydosContracts/entry.ts` and `base44/functions/indexRhBlockRange/entry.ts`. Review related schemas, authorization, artifact provenance and configuration.
2. Obtain Pons source at a pinned revision and document evidence for creation, curves, reserves, fees, creator rewards, graduation, liquidity and security. Record inaccessible sources and unresolved questions instead of inventing behavior.
3. Write proposed `docs/architecture/launchpad.md` with factory, ERC-20, curve, fee/rewards vault, graduation adapter and user-facing router boundaries. Distinguish the user-facing router from an external DEX router; decide trust and deployment boundaries explicitly.
4. Write proposed `docs/architecture/launchpad-references.md` with source paths, revision, independently chosen design decisions and unresolved assumptions.
5. Extend this plan with exact proposed contract, test, deployment, ABI, hook and indexing paths and acceptance criteria. Verify Robinhood chain configuration, wrapped-native asset and supported liquidity venue rather than inventing addresses.
6. Specify pricing equations and rounding, quote/execution parity, real versus virtual reserves, fee liabilities, claim authorization, solvency, graduation thresholds, threshold-crossing behavior, liquidity custody and failure recovery. Include unit, invariant, fuzz and adversarial tests.
7. Preserve the UI while documenting transaction rejection, failure, confirmation, stale quotes, indexing replay and reorg handling. Separate chain-confirmed success from off-chain persistence failures.
8. Complete and review documented architecture before implementation. Review throughout development and run independent audit last before release. Record audit findings and wait for owner-button approval before fixing any finding; re-test and re-review approved fixes.

## Delivery boundary

This file records planning recovery only. It is not a completed architecture, verified Pons study, protocol audit, deployment approval or implementation. The architect, logic, functions and integration stages provided read-only planning reviews for this handoff; documentation owns the scoped write, and audit follows it. Do not ask the owner to paste or commit generated files.
