//! Protected-route installation only. No migrate, reserve transfer, fee claim,
//! burn, payout, or public-network deployment is enabled by this module.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{bpf_loader_upgradeable, hash::hash, program_error::ProgramError};
use crate::meteora;

pub const ROUTE_SEED: &[u8] = b"migration_route";
pub const ROUTE_VERSION: u8 = 1;

fn ensure(condition: bool, reason: &str) -> Result<()> {
    if !condition {
        msg!("Protected migration: {}", reason);
        return Err(ProgramError::InvalidAccountData.into());
    }
    Ok(())
}

/// Loader-v3 observation. The slot is a change detector, NOT source/binary proof.
#[derive(Debug, PartialEq, Eq)]
pub struct Deployment {
    pub slot: u64,
    pub authority: Option<Pubkey>,
}

pub fn deployment(program: &AccountInfo, program_data: &AccountInfo, expected: &Pubkey)
    -> Result<Deployment>
{
    let loader = bpf_loader_upgradeable::ID;
    ensure(program.key == expected && program.owner == &loader && program.executable,
        "wrong program identity, loader, or executable flag")?;
    let canonical = Pubkey::find_program_address(&[expected.as_ref()], &loader).0;
    ensure(program_data.key == &canonical && program_data.owner == &loader && !program_data.executable,
        "wrong ProgramData identity, owner, or executable flag")?;
    let p = program.try_borrow_data()?;
    ensure(p.len() == 36, "invalid loader Program length")?;
    ensure(p[..4] == 2u32.to_le_bytes() && p[4..36] == canonical.to_bytes(),
        "invalid loader Program tag or ProgramData pointer")?;
    let d = program_data.try_borrow_data()?;
    ensure(d.len() >= 49, "short loader ProgramData")?;
    ensure(d[..4] == 3u32.to_le_bytes() && &d[45..49] == b"\x7fELF",
        "invalid ProgramData tag or missing ELF")?;
    let authority = match d[12] {
        0 => None,
        1 => {
            let key = Pubkey::new_from_array(d[13..45].try_into().map_err(|_| ProgramError::InvalidAccountData)?);
            ensure(key != Pubkey::default(), "default upgrade authority")?;
            Some(key)
        },
        _ => return Err(ProgramError::InvalidAccountData.into()),
    };
    Ok(Deployment { slot: u64::from_le_bytes(d[4..12].try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?), authority })
}

pub fn validate_install_authority(authority: &AccountInfo, observed: &Deployment) -> Result<()> {
    ensure(authority.is_signer, "installation authority must sign")?;
    ensure(observed.authority == Some(authority.key()), "signer is not current Kydos upgrade authority")
}

/// Fixed, single-install route. There is deliberately no update, close, or sweep
/// instruction. Future migration must call validate_route before moving funds.
#[account]
#[derive(Debug, PartialEq, Eq)]
pub struct MigrationRoute {
    pub version: u8,
    pub bump: u8,
    pub config: Pubkey,
    pub config_hash: [u8; 32],
    pub creator_authority: Pubkey,
    pub damm_program: Pubkey,
    pub damm_program_data: Pubkey,
    pub damm_deployment_slot: u64,
    pub quote_mint: Pubkey,
    pub treasury: Pubkey,
    pub installed_by: Pubkey,
    pub installed_slot: u64,
    pub base_fee_bps: u16,
    pub collect_fee_mode: u8,
    pub permanent_lock_policy: u8,
    pub settlement_policy_version: u8,
}
impl MigrationRoute {
    pub const SPACE: usize = 8 + 2 + 8 * 32 + 2 * 8 + 2 + 3;
}

#[derive(Accounts)]
pub struct InstallMigrationRoute<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: checked against crate::ID, loader, executable flag, and canonical ProgramData.
    pub kydos_program: UncheckedAccount<'info>,
    /// CHECK: authenticated loader-v3 state; never a caller-supplied authority assertion.
    pub kydos_program_data: UncheckedAccount<'info>,
    /// CHECK: pinned DAMM ID and its canonical loader ProgramData are verified.
    pub damm_program: UncheckedAccount<'info>,
    /// CHECK: canonical ProgramData pointer, owner, tag, ELF, and deployment slot are verified.
    pub damm_program_data: UncheckedAccount<'info>,
    /// CHECK: validated as a private dynamic config for Kydos's derived creator authority.
    pub config: UncheckedAccount<'info>,
    #[account(init, payer = authority, seeds = [ROUTE_SEED], bump, space = MigrationRoute::SPACE)]
    pub route: Account<'info, MigrationRoute>,
    pub system_program: Program<'info, System>,
}

pub fn install(ctx: Context<InstallMigrationRoute>) -> Result<()> {
    ensure(ctx.remaining_accounts.is_empty(), "unexpected remaining accounts")?;
    let kydos = deployment(&ctx.accounts.kydos_program, &ctx.accounts.kydos_program_data, &crate::ID)?;
    validate_install_authority(&ctx.accounts.authority.to_account_info(), &kydos)?;
    let damm = deployment(&ctx.accounts.damm_program, &ctx.accounts.damm_program_data, &meteora::PROGRAM_ID)?;
    let creator_authority = Pubkey::find_program_address(&[meteora::CREATOR_SEED], &crate::ID).0;
    meteora::validate_private_config(&ctx.accounts.config, &ctx.accounts.config.key(), &creator_authority)
        .map_err(|_| { msg!("Protected migration: invalid private dynamic config"); ProgramError::InvalidAccountData })?;
    let config_hash = hash(&ctx.accounts.config.try_borrow_data()?).to_bytes();
    let slot = Clock::get()?.slot;
    ensure(kydos.slot <= slot && damm.slot <= slot, "future deployment slot")?;
    ctx.accounts.route.set_inner(MigrationRoute {
        version: ROUTE_VERSION, bump: ctx.bumps.route,
        config: ctx.accounts.config.key(), config_hash, creator_authority,
        damm_program: meteora::PROGRAM_ID, damm_program_data: ctx.accounts.damm_program_data.key(),
        damm_deployment_slot: damm.slot, quote_mint: meteora::WSOL_MINT,
        treasury: crate::TREASURY, installed_by: ctx.accounts.authority.key(), installed_slot: slot,
        base_fee_bps: meteora::BASE_FEE_BPS, collect_fee_mode: meteora::COLLECT_FEE_MODE_BOTH_TOKEN,
        permanent_lock_policy: crate::migration::LOCK_POLICY_PERMANENT,
        settlement_policy_version: crate::fees::settlement::SETTLEMENT_POLICY_VERSION,
    });
    emit!(MigrationRouteInstalled {
        route: ctx.accounts.route.key(), config: ctx.accounts.config.key(), config_hash,
        creator_authority, installed_by: ctx.accounts.authority.key(), installed_slot: slot,
        damm_deployment_slot: damm.slot,
    });
    Ok(())
}

/// Read-only guard for future fund-moving handlers. Caller must provide an
/// authenticated Account<MigrationRoute>; this additionally checks its PDA.
/// Do not apply this freshness check to an already-successful migration replay.
pub fn validate_route(route_key: &Pubkey, route: &MigrationRoute, config: &AccountInfo,
    damm_program: &AccountInfo, damm_program_data: &AccountInfo) -> Result<()>
{
    let (expected, bump) = Pubkey::find_program_address(&[ROUTE_SEED], &crate::ID);
    let creator = Pubkey::find_program_address(&[meteora::CREATOR_SEED], &crate::ID).0;
    ensure(route_key == &expected && route.bump == bump && route.version == ROUTE_VERSION,
        "invalid route identity or version")?;
    ensure(route.creator_authority == creator && route.damm_program == meteora::PROGRAM_ID
        && route.quote_mint == meteora::WSOL_MINT && route.treasury == crate::TREASURY
        && route.base_fee_bps == meteora::BASE_FEE_BPS
        && route.collect_fee_mode == meteora::COLLECT_FEE_MODE_BOTH_TOKEN
        && route.permanent_lock_policy == crate::migration::LOCK_POLICY_PERMANENT
        && route.settlement_policy_version == crate::fees::settlement::SETTLEMENT_POLICY_VERSION,
        "route policy mismatch")?;
    let observed = deployment(damm_program, damm_program_data, &meteora::PROGRAM_ID)?;
    ensure(route.damm_program_data == damm_program_data.key()
        && observed.slot == route.damm_deployment_slot, "DAMM deployment changed; review required")?;
    meteora::validate_private_config(config, &route.config, &creator)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    ensure(hash(&config.try_borrow_data()?).to_bytes() == route.config_hash,
        "approved config bytes changed; review required")
}

#[event]
pub struct MigrationRouteInstalled {
    pub route: Pubkey,
    pub config: Pubkey,
    pub config_hash: [u8; 32],
    pub creator_authority: Pubkey,
    pub installed_by: Pubkey,
    pub installed_slot: u64,
    pub damm_deployment_slot: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn info(key: Pubkey, owner: Pubkey, executable: bool, signer: bool, data: Vec<u8>) -> AccountInfo<'static> {
        AccountInfo::new(Box::leak(Box::new(key)), signer, false,
            Box::leak(Box::new(10_000_000)), Box::leak(data.into_boxed_slice()),
            Box::leak(Box::new(owner)), executable, 0)
    }
    fn fixture(id: Pubkey, authority: Option<Pubkey>) -> (AccountInfo<'static>, AccountInfo<'static>) {
        let pd = Pubkey::find_program_address(&[id.as_ref()], &bpf_loader_upgradeable::ID).0;
        let mut p = vec![0; 36]; p[..4].copy_from_slice(&2u32.to_le_bytes()); p[4..].copy_from_slice(pd.as_ref());
        let mut d = vec![0; 53]; d[..4].copy_from_slice(&3u32.to_le_bytes()); d[4..12].copy_from_slice(&42u64.to_le_bytes());
        if let Some(a) = authority { d[12] = 1; d[13..45].copy_from_slice(a.as_ref()); }
        d[45..49].copy_from_slice(b"\x7fELF");
        (info(id, bpf_loader_upgradeable::ID, true, false, p), info(pd, bpf_loader_upgradeable::ID, false, false, d))
    }
    #[test]
    fn authority_requires_both_current_loader_record_and_signature() {
        let a = Pubkey::new_unique(); let (p,d) = fixture(crate::ID, Some(a));
        let state = deployment(&p,&d,&crate::ID).unwrap();
        assert_eq!(state, Deployment { slot:42, authority:Some(a) });
        assert!(validate_install_authority(&info(a, anchor_lang::system_program::ID, false, true, vec![]), &state).is_ok());
        assert!(validate_install_authority(&info(a, anchor_lang::system_program::ID, false, false, vec![]), &state).is_err());
        assert!(validate_install_authority(&info(Pubkey::new_unique(), anchor_lang::system_program::ID, false, true, vec![]), &state).is_err());
        let (p,d) = fixture(crate::ID, None); let immutable = deployment(&p,&d,&crate::ID).unwrap();
        assert!(validate_install_authority(&info(a, anchor_lang::system_program::ID, false, true, vec![]), &immutable).is_err());
    }
    #[test]
    fn loader_rejects_substitution_and_malformed_layouts() {
        for variant in 0..12 {
            let (mut p, mut d) = fixture(crate::ID, Some(Pubkey::new_unique()));
            match variant {
                0 => p.key = Box::leak(Box::new(Pubkey::new_unique())),
                1 => p.owner = Box::leak(Box::new(anchor_lang::system_program::ID)),
                2 => p.executable = false,
                3 => d.key = Box::leak(Box::new(Pubkey::new_unique())),
                4 => d.owner = Box::leak(Box::new(anchor_lang::system_program::ID)),
                5 => d.executable = true,
                6 => p.try_borrow_mut_data().unwrap()[0] = 3,
                7 => p.try_borrow_mut_data().unwrap()[4] ^= 1,
                8 => d.try_borrow_mut_data().unwrap()[0] = 2,
                9 => d.try_borrow_mut_data().unwrap()[12] = 2,
                10 => d.try_borrow_mut_data().unwrap()[13..45].fill(0),
                11 => d.try_borrow_mut_data().unwrap()[45] = 0,
                _ => unreachable!(),
            }
            assert!(deployment(&p,&d,&crate::ID).is_err(), "variant {variant}");
        }
        for n in 0..49 {
            let (p,d) = fixture(crate::ID, None);
            let short = info(*d.key, *d.owner, false, false, vec![0;n]);
            assert!(deployment(&p,&short,&crate::ID).is_err());
        }
    }
    fn valid_route() -> (Pubkey, MigrationRoute, AccountInfo<'static>, AccountInfo<'static>, AccountInfo<'static>) {
        let (p,d) = fixture(meteora::PROGRAM_ID, None);
        let creator = Pubkey::find_program_address(&[meteora::CREATOR_SEED], &crate::ID).0;
        let index = 77u64;
        let mut bytes = vec![0;meteora::CONFIG_LEN];
        bytes[..8].copy_from_slice(&meteora::CONFIG_DISCRIMINATOR);
        bytes[40..72].copy_from_slice(creator.as_ref()); bytes[202] = 1;
        bytes[208..216].copy_from_slice(&index.to_le_bytes());
        let fingerprint = hash(&bytes).to_bytes();
        let config = info(meteora::config_address(index), meteora::PROGRAM_ID, false, false, bytes);
        let (key,bump) = Pubkey::find_program_address(&[ROUTE_SEED], &crate::ID);
        let route = MigrationRoute { version:1, bump, config:config.key(), config_hash:fingerprint,
            creator_authority:creator, damm_program:meteora::PROGRAM_ID, damm_program_data:d.key(),
            damm_deployment_slot:42, quote_mint:meteora::WSOL_MINT, treasury:crate::TREASURY,
            installed_by:Pubkey::new_unique(), installed_slot:50, base_fee_bps:100,
            collect_fee_mode:0, permanent_lock_policy:1, settlement_policy_version:1 };
        (key, route, config, p, d)
    }
    #[test]
    fn route_serialization_matches_allocated_space() {
        let (_,r,_,_,_) = valid_route();
        let mut bytes = vec![]; r.try_serialize(&mut bytes).unwrap();
        assert_eq!(bytes.len(), MigrationRoute::SPACE);
        assert_eq!(MigrationRoute::try_deserialize(&mut bytes.as_slice()).unwrap(), r);
    }
    #[test]
    fn route_guard_rejects_changed_config_deployment_or_policy() {
        let (key,mut r,c,p,d) = valid_route();
        assert!(validate_route(&key,&r,&c,&p,&d).is_ok());
        r.base_fee_bps = 125; assert!(validate_route(&key,&r,&c,&p,&d).is_err()); r.base_fee_bps = 100;
        r.treasury = Pubkey::new_unique(); assert!(validate_route(&key,&r,&c,&p,&d).is_err()); r.treasury = crate::TREASURY;
        d.try_borrow_mut_data().unwrap()[4..12].copy_from_slice(&43u64.to_le_bytes());
        assert!(validate_route(&key,&r,&c,&p,&d).is_err());
        d.try_borrow_mut_data().unwrap()[4..12].copy_from_slice(&42u64.to_le_bytes());
        c.try_borrow_mut_data().unwrap()[300] = 1;
        assert!(validate_route(&key,&r,&c,&p,&d).is_err());
    }
}
