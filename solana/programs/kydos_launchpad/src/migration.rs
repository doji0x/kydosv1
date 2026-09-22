//! Preparation only: no migration instruction, transfers, receipt writes or lock policy.
use anchor_lang::prelude::*;
use num_bigint::BigUint;
use num_traits::ToPrimitive;

use crate::{validate_curve_configuration, Curve, LIQUIDITY_TOKEN_ALLOCATION};

pub const MIN_SQRT_PRICE: u128 = 4_295_048_016;
pub const MAX_SQRT_PRICE: u128 = 79_226_673_521_066_979_257_578_248_091;

#[derive(Debug, PartialEq, Eq)]
pub enum MigrationError {
    InvalidAmount,
    MathBounds,
    UnsupportedCurve,
    NotComplete,
    InsufficientCustody,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SeedLiquidity {
    pub sqrt_price: u128,
    pub liquidity: u128,
    pub token_a_amount: u64,
    pub token_b_amount: u64,
    pub token_a_dust: u64,
    pub token_b_dust: u64,
}

/// Exact full-range concentrated-liquidity math, with u64 budgets and u128 outputs.
/// Token A is the coin; token B is original SPL WSOL. No decimal/floating conversion.
pub fn seed_liquidity(a: u64, b: u64) -> std::result::Result<SeedLiquidity, MigrationError> {
    if a == 0 || b == 0 {
        return Err(MigrationError::InvalidAmount);
    }
    let low = BigUint::from(MIN_SQRT_PRICE);
    let high = BigUint::from(MAX_SQRT_PRICE);
    let q128 = BigUint::from(1u8) << 128usize;
    let a_high = BigUint::from(a) * &high;
    let b_q = BigUint::from(b) * &q128;
    let a_high_low = &a_high * &low;
    let negative_beta = b_q < a_high_low;
    let beta = if negative_beta {
        &a_high_low - &b_q
    } else {
        &b_q - &a_high_low
    };
    // a*H*S² + (b*2^128 - a*H*L)*S - b*2^128*H = 0.
    // Taking floor(sqrt(discriminant)) before integer division preserves floor(S).
    let root = (&beta * &beta + BigUint::from(4u8) * &a_high * &b_q * &high).sqrt();
    let numerator = if negative_beta {
        root + beta
    } else {
        root - beta
    };
    let price = numerator / (BigUint::from(2u8) * a_high);
    if price <= low || price >= high {
        return Err(MigrationError::MathBounds);
    }
    let from_a = BigUint::from(a) * &price * &high / (&high - &price);
    let from_b = &b_q / (&price - &low);
    let liquidity = from_a.min(from_b);
    let ceil = |n: BigUint, d: BigUint| (n + &d - BigUint::from(1u8)) / d;
    let used_a = ceil(&liquidity * (&high - &price), &price * &high)
        .to_u64()
        .ok_or(MigrationError::MathBounds)?;
    let used_b = ceil(&liquidity * (&price - &low), q128)
        .to_u64()
        .ok_or(MigrationError::MathBounds)?;
    let result = SeedLiquidity {
        sqrt_price: price.to_u128().ok_or(MigrationError::MathBounds)?,
        liquidity: liquidity.to_u128().ok_or(MigrationError::MathBounds)?,
        token_a_amount: used_a,
        token_b_amount: used_b,
        token_a_dust: a.checked_sub(used_a).ok_or(MigrationError::MathBounds)?,
        token_b_dust: b.checked_sub(used_b).ok_or(MigrationError::MathBounds)?,
    };
    if result.liquidity == 0 || used_a == 0 || used_b == 0 {
        return Err(MigrationError::InvalidAmount);
    }
    Ok(result)
}

/// Reserve preflight, not account authentication. The future handler must also
/// validate source PDAs, FeePolicy, mint/vault ownership, route and receipt absence.
/// Account rent, fees and unsolicited donations are never part of the SOL budget.
pub fn seed_completed_curve(
    curve: &Curve,
    curve_lamports: u64,
    curve_rent: u64,
    vault_tokens: u64,
) -> std::result::Result<SeedLiquidity, MigrationError> {
    validate_curve_configuration(curve).map_err(|_| MigrationError::UnsupportedCurve)?;
    if !curve.graduated || curve.real_token_reserves != 0 {
        return Err(MigrationError::NotComplete);
    }
    if curve_lamports
        .checked_sub(curve_rent)
        .ok_or(MigrationError::InsufficientCustody)?
        < curve.real_sol_reserves
        || vault_tokens < LIQUIDITY_TOKEN_ALLOCATION
    {
        return Err(MigrationError::InsufficientCustody);
    }
    seed_liquidity(LIQUIDITY_TOKEN_ALLOCATION, curve.real_sol_reserves)
}

/// Proposed receipt body for the next milestone. Not an initialized account or
/// proof of migration. Promote to an Anchor account only with the atomic handler.
/// A successful receipt must bind every key to canonical addresses and account
/// state, conserve both budgets, and record the explicitly approved lock policy.
#[derive(AnchorSerialize, AnchorDeserialize, Debug, PartialEq, Eq)]
pub struct MigrationReceiptV1 {
    pub version: u8,
    pub bump: u8,
    pub curve: Pubkey,
    pub config: Pubkey,
    pub pool: Pubkey,
    pub position: Pubkey,
    pub position_nft_mint: Pubkey,
    pub position_owner: Pubkey,
    pub treasury: Pubkey,
    pub token_a_mint: Pubkey,
    pub token_a_budget: u64,
    pub token_b_budget: u64,
    pub token_a_deposited: u64,
    pub token_b_deposited: u64,
    pub token_a_dust: u64,
    pub token_b_dust: u64,
    pub sqrt_price: u128,
    pub liquidity: u128,
    pub completed_slot: u64,
    // 0 = program custody, 1 = permanently locked. No policy is selected here.
    pub lock_policy: u8,
}

impl MigrationReceiptV1 {
    pub const VERSION: u8 = 1;
    pub const BODY_LEN: usize = 2 + 8 * 32 + 7 * 8 + 2 * 16 + 1;
    pub const ACCOUNT_LEN: usize = 8 + Self::BODY_LEN;
}
