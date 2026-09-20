# Solana scaffold tests

From the repository root, run `npm --prefix solana test`. No package installation,
validator, wallet, funds, RPC access or environment file is needed. The command
uses Node's built-in test runner, supported by the Node 20 baseline in existing
CI; it does not introduce a Solana integration-test framework.

`config.test.js` imports the real application-facing entry and the checked-in
configuration example. It covers URL normalization, immutable output, explicit
localnet selection, loopback endpoints, rejected remote/credential-bearing URLs,
redacted errors and omission of unrelated values. These tests are not on-chain
or end-to-end tests.

After approved program/toolchain decisions, add separate program and integration
tests here (and Rust unit tests alongside program source as appropriate). The
first eventual acceptance flow is Create Token -> Buy -> Sell against our own
programs with hosted metadata. Required future coverage includes wallet rejection,
account authorization, quote/execution parity, rounding, slippage, reserves/fees,
transaction expiry and confirmation, and persistence failure after chain success.
Those are a test backlog, not a selected protocol design or passing test claim.

Execution status and review limitations are recorded in [the scaffold guide](../README.md).
