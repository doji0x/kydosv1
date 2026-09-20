# On-chain program source boundary

Reserved for Kydos-owned Solana programs. This directory is intentionally not a
buildable Rust workspace yet: no completed Solana toolchain decision was found
in the accessible architecture artifacts. Do not mistake this scaffold for a
program implementation.

Before adding crates, record and review:

- Framework (Anchor, native Rust, or another approved option).
- Compatible pinned Rust, Solana/Agave CLI, framework and dependency versions.
- Program boundaries, account layout, instruction interface and IDL/client generation.
- Token standard, authority model, program IDs and upgrade policy.
- Local test harness and reproducible build/test commands.

Then add the approved workspace manifests and source here, and link generated
client artifacts to `src/lib/solana/`. Do not copy Pump.fun program IDs or IDLs
as Kydos interfaces. No dummy program, deploy script or keypair is included.

See [scaffold setup and decisions](../README.md) and [test scope](../tests/README.md).
