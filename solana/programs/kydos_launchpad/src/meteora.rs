//! Narrow DAMM v2 ABI pinned to cp-amm-sdk 1.4.10 (IDL 0.2.4).
//! See docs/meteora-adapter.md and the SDK-generated parity fixtures.
//! Instruction construction only; no invoke_signed or externally callable handler.
use crate::migration::{SeedLiquidity, MAX_SQRT_PRICE, MIN_SQRT_PRICE};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey,
};
use anchor_lang::system_program;

pub const PROGRAM_ID: Pubkey = pubkey!("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
pub const CONFIG_LEN: usize = 328;
pub const CONFIG_DISCRIMINATOR: [u8; 8] = [155, 12, 170, 224, 30, 250, 204, 130];
pub const INITIALIZE_DISCRIMINATOR: [u8; 8] = [149, 82, 72, 197, 253, 252, 68, 15];
pub const BASE_FEE_BPS: u16 = 100;
pub const BASE_FEE_NUMERATOR: u64 = 10_000_000; // 1% of Meteora's 1e9 denominator.
pub const COLLECT_FEE_MODE_BOTH_TOKEN: u8 = 0;

pub const RECEIPT_SEED: &[u8] = b"migration_receipt";
pub const PAYER_SEED: &[u8] = b"migration_payer";
pub const CREATOR_SEED: &[u8] = b"meteora_pool_creator";
pub const POSITION_OWNER_SEED: &[u8] = b"meteora_position_owner";
pub const POSITION_MINT_SEED: &[u8] = b"meteora_position_mint";
pub const STAGING_SEED: &[u8] = b"migration_token";

#[derive(Debug, PartialEq, Eq)]
pub enum AdapterError {
    SameMint,
    InvalidConfig,
}

#[derive(Debug)]
pub struct MigrationAddresses {
    pub mint: Pubkey,
    pub config: Pubkey,
    pub curve: Pubkey,
    pub receipt: Pubkey,
    pub payer: Pubkey,
    pub pool_creator_authority: Pubkey,
    pub position_owner: Pubkey,
    pub position_nft_mint: Pubkey,
    pub token_a_staging: Pubkey,
    pub token_b_staging: Pubkey,
    pub pool: Pubkey,
    pub pool_authority: Pubkey,
    pub position: Pubkey,
    pub position_nft_account: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub event_authority: Pubkey,
}

pub fn config_address(index: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"config", &index.to_le_bytes()], &PROGRAM_ID).0
}

pub fn derive_addresses(
    launchpad: &Pubkey,
    mint: &Pubkey,
    config: &Pubkey,
) -> std::result::Result<MigrationAddresses, AdapterError> {
    if *mint == WSOL_MINT {
        return Err(AdapterError::SameMint);
    }
    let local = |seeds: &[&[u8]]| Pubkey::find_program_address(seeds, launchpad).0;
    let damm = |seeds: &[&[u8]]| Pubkey::find_program_address(seeds, &PROGRAM_ID).0;
    let curve = local(&[b"curve", mint.as_ref()]);
    let nft = local(&[POSITION_MINT_SEED, curve.as_ref()]);
    // PDA sorting does NOT change the A=coin, B=WSOL account orientation.
    let (first, second) = if mint.to_bytes() > WSOL_MINT.to_bytes() {
        (mint, &WSOL_MINT)
    } else {
        (&WSOL_MINT, mint)
    };
    let pool = damm(&[b"pool", config.as_ref(), first.as_ref(), second.as_ref()]);
    Ok(MigrationAddresses {
        mint: *mint,
        config: *config,
        curve,
        receipt: local(&[RECEIPT_SEED, curve.as_ref()]),
        payer: local(&[PAYER_SEED, curve.as_ref()]),
        pool_creator_authority: local(&[CREATOR_SEED]),
        position_owner: local(&[POSITION_OWNER_SEED, curve.as_ref()]),
        position_nft_mint: nft,
        token_a_staging: local(&[STAGING_SEED, curve.as_ref(), mint.as_ref()]),
        token_b_staging: local(&[STAGING_SEED, curve.as_ref(), WSOL_MINT.as_ref()]),
        pool,
        pool_authority: damm(&[b"pool_authority"]),
        position: damm(&[b"position", nft.as_ref()]),
        position_nft_account: damm(&[b"position_nft_account", nft.as_ref()]),
        token_a_vault: damm(&[b"token_vault", mint.as_ref(), pool.as_ref()]),
        token_b_vault: damm(&[b"token_vault", WSOL_MINT.as_ref(), pool.as_ref()]),
        event_authority: damm(&[b"__event_authority"]),
    })
}

/// Validate an operator-provisioned private *dynamic* config against an already
/// approved address and Kydos signer. Caller-supplied keys alone are not approval.
pub fn validate_private_config(
    account: &AccountInfo,
    approved_config: &Pubkey,
    creator_authority: &Pubkey,
) -> std::result::Result<u64, AdapterError> {
    if account.key != approved_config
        || account.owner != &PROGRAM_ID
        || account.executable
        || creator_authority == &Pubkey::default()
    {
        return Err(AdapterError::InvalidConfig);
    }
    let data = account
        .try_borrow_data()
        .map_err(|_| AdapterError::InvalidConfig)?;
    if data.len() != CONFIG_LEN || data[..8] != CONFIG_DISCRIMINATOR
        || data[8..40] != [0; 32] // no AlphaVault config
        || data[40..72] != creator_authority.to_bytes()
        || data[202] != 1 // ConfigType::Dynamic
        || data[248..264] != [0; 16]
    // do not skip mint validation
    {
        return Err(AdapterError::InvalidConfig);
    }
    let index = u64::from_le_bytes(data[208..216].try_into().unwrap());
    if config_address(index) != *account.key {
        return Err(AdapterError::InvalidConfig);
    }
    Ok(index)
}

/// Fixed policy: 100 bps, BothToken, full range, timestamp activation now, no dynamic
/// fee, schedule, compounding or AlphaVault. Payer also owns both staging accounts.
/// The future handler must rederive these addresses and recompute the seed quote.
pub fn initialize_pool_instruction(a: &MigrationAddresses, quote: &SeedLiquidity) -> Instruction {
    let mut data = INITIALIZE_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&BASE_FEE_NUMERATOR.to_le_bytes());
    data.extend_from_slice(&[0; 19]); // rest of BorshFeeTimeScheduler (27 bytes)
    data.extend_from_slice(&[0; 4]); // compounding u16, padding u8, dynamic_fee None
    data.extend_from_slice(&MIN_SQRT_PRICE.to_le_bytes());
    data.extend_from_slice(&MAX_SQRT_PRICE.to_le_bytes());
    data.push(0); // has_alpha_vault
    data.extend_from_slice(&quote.liquidity.to_le_bytes());
    data.extend_from_slice(&quote.sqrt_price.to_le_bytes());
    data.extend_from_slice(&[1, COLLECT_FEE_MODE_BOTH_TOKEN, 0]); // Timestamp, BothToken, activation_point None
    let ro = |key| AccountMeta::new_readonly(key, false);
    let rw = |key| AccountMeta::new(key, false);
    Instruction {
        program_id: PROGRAM_ID,
        data,
        accounts: vec![
            ro(a.position_owner),
            AccountMeta::new(a.position_nft_mint, true),
            rw(a.position_nft_account),
            AccountMeta::new(a.payer, true),
            AccountMeta::new_readonly(a.pool_creator_authority, true),
            ro(a.config),
            ro(a.pool_authority),
            rw(a.pool),
            rw(a.position),
            ro(a.mint),
            ro(WSOL_MINT),
            rw(a.token_a_vault),
            rw(a.token_b_vault),
            rw(a.token_a_staging),
            rw(a.token_b_staging),
            ro(anchor_spl::token::ID),
            ro(anchor_spl::token::ID),
            ro(anchor_spl::token_2022::ID),
            ro(system_program::ID),
            ro(a.event_authority),
            ro(PROGRAM_ID),
        ],
    }
}
