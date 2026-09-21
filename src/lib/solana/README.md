# Application-facing Solana boundary

Public entry: `index.js` exports `readSolanaDevelopmentConfig(input)` from
`config.js`. Input is `{ cluster: 'localnet', rpcUrl: string }`; output is a
frozen copy with a normalized URL. Invalid configuration throws without echoing
URL values. Extra fields are not copied. This is a development-only parser, not
an RPC client, wallet adapter, credential sanitizer or cluster identity check.

The parser has no import-time environment access, browser globals, RPC calls,
SDK dependencies, signing or transaction methods. Tests import this entry point
through relative ESM paths, requiring no Vite alias resolver.

No existing screen, hook or provider imports this module. Future application
integration may use `@/lib/solana/index.js` under the existing Vite alias, after
separate approval. Do not reuse the ethers signer from `../WalletContext.jsx`:
that provider is EVM/MetaMask-specific, not a Solana wallet connection.

Future approved work belongs here: a Solana wallet boundary, RPC adapter, and
client generated from our own program interface. Do not add guessed instruction
signatures, mock successful trades or Pump.fun SDK calls. Keep private Helius
credentials in server configuration, never in browser modules or `VITE_*`.
Hosted metadata is an owner requirement; provider, upload/auth flow and metadata
schema remain decisions, not implemented contracts.

See [setup and remaining decisions](../../../solana/README.md).
