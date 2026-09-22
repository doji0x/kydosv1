//! Compile-only AMM account/interface foundation. No entrypoint or deployable ID.
//! No method initializes accounts, moves assets, mints LP shares, or enables swaps.
//! See docs/launchpad-build-spec.md for required migration constraints.
use anchor_lang::prelude::*;

pub const SCHEMA_VERSION: u8 = 1;
pub const POOL_SEED: &[u8] = b"pool";
pub const AUTHORITY_SEED: &[u8] = b"pool-authority";
pub const BASE_VAULT_SEED: &[u8] = b"base-vault";
pub const QUOTE_VAULT_SEED: &[u8] = b"quote-vault";
pub const MIGRATION_SEED: &[u8] = b"migration";

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum PoolStatus { Uninitialized, Active, Paused }

/// Planned account body (no discriminator/owner implementation until an AMM ID
/// is established). Separate from Curve: AMM reserves are real SPL balances.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct PoolState {
    pub version: u8,
    pub status: PoolStatus,
    pub bump: u8,
    pub authority_bump: u8,
    pub source_launchpad: Pubkey,
    pub source_curve: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub fee_config: Pubkey,
    pub base_reserve: u64,
    pub quote_reserve: u64,
    // Total issued shares less protocol withdrawals; external burns must not
    // silently increase another provider's withdrawal entitlement.
    pub lp_shares: u64,
}
impl PoolState {
    pub const BODY_SPACE: usize = 4 + 8 * 32 + 3 * 8;
}

/// Planned instruction data. This is a serialization contract, not an executable
/// instruction builder: no discriminator/program ID or funded operation exists.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct InitializeMigratedPoolArgs {
    pub version: u8,
    pub base_amount: u64,
    pub quote_amount: u64,
    pub minimum_lp_shares: u64,
}

/// Planned launchpad-owned receipt, written ONLY after successful AMM CPI.
/// One canonical receipt per source curve makes migration repeat-safe.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct MigrationReceipt {
    pub version: u8,
    pub source_curve: Pubkey,
    pub amm_program: Pubkey,
    pub pool: Pubkey,
    pub base_amount: u64,
    pub quote_amount: u64,
}

/// Canonical destination is bound to the source curve as well as the token pair.
/// A real AMM program ID must be selected/verified before constructing accounts.
pub fn pool_address(amm_program: &Pubkey, source_curve: &Pubkey, base: &Pubkey, quote: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[POOL_SEED, source_curve.as_ref(), base.as_ref(), quote.as_ref()], amm_program)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_body_size_and_roundtrip() {
        let key = Pubkey::new_unique();
        let state = PoolState { version: SCHEMA_VERSION, status: PoolStatus::Uninitialized,
            bump: 255, authority_bump: 254, source_launchpad: key, source_curve: key,
            base_mint: key, quote_mint: key, base_vault: key, quote_vault: key,
            lp_mint: key, fee_config: key, base_reserve: 0, quote_reserve: 0, lp_shares: 0 };
        let bytes = state.try_to_vec().unwrap();
        assert_eq!(bytes.len(), PoolState::BODY_SPACE);
        assert_eq!(PoolState::try_from_slice(&bytes).unwrap(), state);
    }
    #[test]
    fn destination_binds_source_curve_and_pair() {
        let program = Pubkey::new_unique();
        let source = Pubkey::new_unique();
        let base = Pubkey::new_unique();
        let quote = Pubkey::new_unique();
        assert_ne!(pool_address(&program, &source, &base, &quote), pool_address(&program, &Pubkey::new_unique(), &base, &quote));
        assert_ne!(pool_address(&program, &source, &base, &quote), pool_address(&program, &source, &quote, &base));
    }
}
