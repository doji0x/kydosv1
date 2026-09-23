# Solana launchpad stages

## 1. Create

The creator connects Phantom and submits token metadata to the Anchor program. The client validates byte limits and persists recovery metadata before broadcast.

## 2. Bonding curve

793.1 million tokens (79.31% of the one-billion-token supply) is available through the constant-product curve. Quotes are snapshots, slippage limits are explicit, and confirmed balances are reloaded after each transaction.

## 3. Graduation

Graduation occurs when real curve inventory is exhausted; about 85.005 SOL net reserves is indicative, not a fixed trigger. When that condition is reached, trading state is finalized for the liquidity transition; external migration must remain explicit and separately verified.

## 4. Liquidity

The 206.9 million reserved tokens pair with the collected real SOL for the planned Meteora DAMM v2 migration. Executable migration is not implemented yet. Authority, destination accounts, and lock behavior must be validated on chain before production activation.

## 5. Indexing and product state

Helius RPC supplies finalized Kydos program events to a single reconciliation worker. Chart requests read the index; they do not ingest history. Indexed transactions update durable activity records, while the UI always distinguishes estimated quotes from confirmed receipts.

## Safety gates

- Phantom account must match the connected signer.
- Program-derived addresses and account owners must be validated.
- Slippage bounds and stale-market checks must block unsafe submissions.
- Mainnet deployment requires passing Anchor tests, integration tests, and an independent security review.
