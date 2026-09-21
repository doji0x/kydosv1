# Solana launchpad stages

## 1. Create

The creator connects Phantom and submits token metadata to the Anchor program. The client validates byte limits and persists recovery metadata before broadcast.

## 2. Bonding curve

Eighty percent of the one-billion-token supply is available through the constant-product curve. Quotes are snapshots, slippage limits are explicit, and confirmed balances are reloaded after each transaction.

## 3. Graduation

The curve targets 85 SOL. When the program graduation condition is reached, trading state is finalized for the liquidity transition; external migration must remain explicit and separately verified.

## 4. Liquidity

The remaining twenty percent of supply pairs with the collected 85 SOL for AMM liquidity. Authority, destination accounts, and lock behavior must be validated on chain before production activation.

## 5. Indexing and product state

Helius transaction parsing and RPC services feed bounded Base44 functions. Indexed transactions update durable activity records, while the UI always distinguishes estimated quotes from confirmed receipts.

## Safety gates

- Phantom account must match the connected signer.
- Program-derived addresses and account owners must be validated.
- Slippage bounds and stale-market checks must block unsafe submissions.
- Mainnet deployment requires passing Anchor tests, integration tests, and an independent security review.
