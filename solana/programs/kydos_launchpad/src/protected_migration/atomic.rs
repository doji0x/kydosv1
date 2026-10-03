//! Atomic protected graduation. Not a deployment or a fee-settlement endpoint.
//! All custody changes, external CPIs, locking and receipt writes share one instruction.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed,
    program_error::ProgramError, program_option::COption, program_pack::Pack, system_instruction};
use anchor_spl::token::{spl_token, Mint, Token, TokenAccount};
use anchor_spl::token_2022::{spl_token_2022, Token2022};
use spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions};
use crate::{Curve, FeePolicy, TREASURY, DECIMALS, TOTAL_SUPPLY, LIQUIDITY_TOKEN_ALLOCATION,
    FEE_POLICY_VERSION, fees, meteora, migration, validate_curve_configuration, transfer_curve_sol};
use super::{ensure, validate_route, MigrationRoute, ROUTE_SEED, ROUTE_VERSION};

#[account]
#[derive(Debug, PartialEq, Eq)]
pub struct MigrationReceipt {
    pub version: u8,
    pub bump: u8,
    pub route_version: u8,
    pub lock_policy: u8,
    pub settlement_policy_version: u8,
    pub curve: Pubkey,
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub route: Pubkey,
    pub config: Pubkey,
    pub config_hash: [u8; 32],
    pub pool: Pubkey,
    pub position: Pubkey,
    pub position_nft_mint: Pubkey,
    pub position_owner: Pubkey,
    pub treasury: Pubkey,
    pub quote_mint: Pubkey,
    pub token_a_budget: u64,
    pub token_b_budget: u64,
    pub token_a_deposited: u64,
    pub token_b_deposited: u64,
    pub token_a_dust: u64,
    pub token_b_dust: u64,
    pub sqrt_price: u128,
    pub liquidity: u128,
    pub completed_slot: u64,
    pub damm_deployment_slot: u64,
}
impl MigrationReceipt { pub const SPACE: usize = 8 + 5 + 12 * 32 + 8 * 8 + 2 * 16; }

#[derive(Accounts)]
pub struct Migrate<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(mut, seeds = [b"curve", mint.key().as_ref()], bump = curve.bump, has_one = mint)]
    pub curve: Box<Account<'info, Curve>>,
    #[account(seeds = [b"fee_policy", curve.key().as_ref()], bump = fee_policy.bump,
        has_one = curve,
        constraint = fee_policy.version == FEE_POLICY_VERSION,
        constraint = fee_policy.treasury == TREASURY,
        constraint = fee_policy.trading_fee_bps == fees::TRADING_FEE_BPS)]
    pub fee_policy: Box<Account<'info, FeePolicy>>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump,
        token::mint = mint, token::authority = curve)]
    pub vault: Account<'info, TokenAccount>,
    #[account(seeds = [ROUTE_SEED], bump = route.bump)]
    pub route: Box<Account<'info, MigrationRoute>>,
    /// Receipt allocation is rolled back on ANY subsequent failure. Version stays
    /// zero until both the external permanent lock and all postconditions succeed.
    #[account(init_if_needed, payer = sponsor, space = MigrationReceipt::SPACE,
        seeds = [meteora::RECEIPT_SEED, curve.key().as_ref()], bump)]
    pub receipt: Box<Account<'info, MigrationReceipt>>,
    /// CHECK: canonical private configuration; fresh route guard checks bytes/owner.
    pub config: UncheckedAccount<'info>,
    /// CHECK: canonical executable and loader checked by fresh route guard.
    pub damm_program: UncheckedAccount<'info>,
    /// CHECK: loader-v3 identity/deployment checked on the fresh path, not replay.
    pub damm_program_data: UncheckedAccount<'info>,
    /// CHECK: canonical empty system PDA. Sponsor budget is isolated from principal.
    #[account(mut)]
    pub payer: UncheckedAccount<'info>,
    /// CHECK: canonical Kydos creator PDA; signed only for the approved pool CPI.
    pub pool_creator_authority: UncheckedAccount<'info>,
    /// CHECK: canonical program-custodied owner; never a caller-selected wallet.
    pub position_owner: UncheckedAccount<'info>,
    /// CHECK: canonical DAMM pool authority.
    pub pool_authority: UncheckedAccount<'info>,
    /// CHECK: canonical DAMM destination; fresh and post-CPI validation below.
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: canonical initial position; post-CPI state and lock are verified.
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: Kydos PDA mint; DAMM creates its Token-2022 position NFT.
    #[account(mut)]
    pub position_nft_mint: UncheckedAccount<'info>,
    /// CHECK: canonical DAMM NFT account, decoded and custody-checked after CPI.
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,
    #[account(address = meteora::WSOL_MINT)]
    pub quote_mint: Account<'info, Mint>,
    /// CHECK: canonical original SPL vault; owner, mint and state checked after CPI.
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,
    /// CHECK: canonical original SPL WSOL vault; principal/donations checked separately.
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,
    /// CHECK: canonical staging; may be absent on successful replay.
    #[account(mut)]
    pub token_a_staging: UncheckedAccount<'info>,
    /// CHECK: canonical staging; may be absent on successful replay.
    #[account(mut)]
    pub token_b_staging: UncheckedAccount<'info>,
    /// CHECK: canonical DAMM event authority; not arbitrary remaining accounts.
    pub event_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

fn add(a: u64, b: u64) -> Result<u64> { a.checked_add(b).ok_or_else(|| ProgramError::ArithmeticOverflow.into()) }
fn sub(a: u64, b: u64) -> Result<u64> { a.checked_sub(b).ok_or_else(|| ProgramError::InsufficientFunds.into()) }
fn local(seeds: &[&[u8]]) -> (Pubkey, u8) { Pubkey::find_program_address(seeds, &crate::ID) }

fn canonical(c: &Migrate, a: &meteora::MigrationAddresses) -> Result<()> {
    for (actual, expected) in [
        (c.curve.key(), a.curve), (c.receipt.key(), a.receipt), (c.config.key(), a.config),
        (c.payer.key(), a.payer), (c.pool_creator_authority.key(), a.pool_creator_authority),
        (c.position_owner.key(), a.position_owner), (c.pool_authority.key(), a.pool_authority),
        (c.pool.key(), a.pool), (c.position.key(), a.position),
        (c.position_nft_mint.key(), a.position_nft_mint), (c.position_nft_account.key(), a.position_nft_account),
        (c.token_a_vault.key(), a.token_a_vault), (c.token_b_vault.key(), a.token_b_vault),
        (c.token_a_staging.key(), a.token_a_staging), (c.token_b_staging.key(), a.token_b_staging),
        (c.event_authority.key(), a.event_authority), (c.damm_program.key(), meteora::PROGRAM_ID),
    ] { ensure(actual == expected, "noncanonical migration account")?; }
    Ok(())
}

fn fresh(a: &AccountInfo, key: &Pubkey) -> Result<()> {
    meteora::permissionless::validate_fresh_destination(a, key)
        .map_err(|_| ProgramError::AccountAlreadyInitialized.into())
}

/// No arbitrary instructions or metas supplied by the caller. Every instruction
/// is constructed in this module or the pinned narrow Meteora adapter.
fn call<'info>(ix: Instruction, infos: &[AccountInfo<'info>], seeds: &[&[&[u8]]]) -> Result<()> {
    let mut ordered = Vec::with_capacity(ix.accounts.len() + 1);
    for meta in &ix.accounts {
        ordered.push(infos.iter().find(|a| a.key == &meta.pubkey)
            .ok_or(ProgramError::NotEnoughAccountKeys)?.clone());
    }
    ordered.push(infos.iter().find(|a| a.key == &ix.program_id)
        .ok_or(ProgramError::IncorrectProgramId)?.clone());
    invoke_signed(&ix, &ordered, seeds).map_err(Into::into)
}

/// Allocate/assign supports unsolicited lamports, unlike create_account alone.
/// Returns ONLY the rent top-up paid by this invocation's dedicated payer.
fn allocate<'info>(account: &AccountInfo<'info>, payer: &AccountInfo<'info>, owner: &Pubkey,
    size: usize, infos: &[AccountInfo<'info>], seeds: &[&[&[u8]]]) -> Result<u64>
{
    fresh(account, account.key)?;
    let topup = Rent::get()?.minimum_balance(size).saturating_sub(account.lamports());
    if topup > 0 { call(system_instruction::transfer(payer.key, account.key, topup), infos, seeds)?; }
    call(system_instruction::allocate(account.key, size as u64), infos, seeds)?;
    call(system_instruction::assign(account.key, owner), infos, seeds)?;
    Ok(topup)
}

fn token_account(info: &AccountInfo, mint: &Pubkey, owner: &Pubkey, native: bool)
    -> Result<spl_token::state::Account>
{
    ensure(info.owner == &spl_token::ID && !info.executable, "wrong original SPL account owner")?;
    let account = spl_token::state::Account::unpack(&info.try_borrow_data()?)?;
    ensure(account.mint == *mint && account.owner == *owner
        && account.state == spl_token::state::AccountState::Initialized
        && account.delegate == COption::None && account.delegated_amount == 0
        && account.close_authority == COption::None && account.is_native.is_some() == native,
        "invalid token custody or delegated/frozen token account")?;
    if let COption::Some(rent) = account.is_native {
        ensure(info.lamports() >= add(rent, account.amount)?, "unbacked wrapped SOL")?;
    }
    Ok(account)
}

fn nft(c: &Migrate, a: &meteora::MigrationAddresses) -> Result<()> {
    ensure(c.position_nft_mint.owner == &spl_token_2022::ID && !c.position_nft_mint.executable
        && c.position_nft_account.owner == &spl_token_2022::ID && !c.position_nft_account.executable,
        "wrong position NFT program")?;
    let md = c.position_nft_mint.try_borrow_data()?;
    let m = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&md)?;
    ensure(m.base.is_initialized && m.base.decimals == 0 && m.base.supply == 1
        && m.base.mint_authority == COption::Some(a.pool_authority)
        && m.base.freeze_authority == COption::Some(a.pool), "invalid position NFT mint")?;
    for e in m.get_extension_types()? {
        ensure(matches!(e, ExtensionType::MintCloseAuthority | ExtensionType::MetadataPointer | ExtensionType::TokenMetadata),
            "unexpected position mint extension")?;
    }
    let ad = c.position_nft_account.try_borrow_data()?;
    let t = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&ad)?;
    ensure(t.base.mint == a.position_nft_mint && t.base.owner == a.position_owner && t.base.amount == 1
        && t.base.state == spl_token_2022::state::AccountState::Initialized
        && t.base.delegate == COption::None && t.base.delegated_amount == 0
        && t.base.close_authority == COption::None && t.base.is_native == COption::None,
        "position NFT custody mismatch")?;
    for e in t.get_extension_types()? { ensure(e == ExtensionType::ImmutableOwner, "unexpected NFT account extension")?; }
    Ok(())
}

fn number<const N: usize>(data: &[u8], offset: usize) -> Result<[u8; N]> {
    data.get(offset..offset + N).ok_or(ProgramError::InvalidAccountData)?
        .try_into().map_err(|_| ProgramError::InvalidAccountData.into())
}
fn u64_at(data: &[u8], offset: usize) -> Result<u64> { Ok(u64::from_le_bytes(number(data, offset)?)) }
fn u128_at(data: &[u8], offset: usize) -> Result<u128> { Ok(u128::from_le_bytes(number(data, offset)?)) }
fn key_at(data: &[u8], offset: usize) -> Result<Pubkey> { Ok(Pubkey::new_from_array(number(data, offset)?)) }

/// Offsets are pinned to the SDK's Pool/Position layouts and verified by SDK
/// mutation vectors in runtime tests. Never cast external bytes to Rust structs.
fn pool_and_position(c: &Migrate, a: &meteora::MigrationAddresses,
    quote: Option<&migration::SeedLiquidity>, locked: u128) -> Result<()>
{
    ensure(c.pool.owner == &meteora::PROGRAM_ID && c.position.owner == &meteora::PROGRAM_ID
        && !c.pool.executable && !c.position.executable, "wrong DAMM state owner")?;
    let p = c.pool.try_borrow_data()?;
    let t = c.position.try_borrow_data()?;
    let pool_disc = anchor_lang::solana_program::hash::hash(b"account:Pool").to_bytes();
    let position_disc = anchor_lang::solana_program::hash::hash(b"account:Position").to_bytes();
    ensure(p.len() == 1112 && t.len() == 408 && p[..8] == pool_disc[..8]
        && t[..8] == position_disc[..8], "unsupported DAMM state layout")?;
    ensure(key_at(&p, 168)? == a.mint && key_at(&p, 200)? == meteora::WSOL_MINT
        && key_at(&p, 232)? == a.token_a_vault && key_at(&p, 264)? == a.token_b_vault
        && key_at(&p, 648)? == a.position_owner && key_at(&t, 8)? == a.pool
        && key_at(&t, 40)? == a.position_nft_mint, "DAMM account bindings mismatch")?;
    ensure(u128_at(&t, 184)? >= locked && u128_at(&p, 552)? >= locked,
        "initial liquidity not permanently locked")?;
    if let Some(q) = quote {
        ensure(u64_at(&p, 8)? == meteora::BASE_FEE_NUMERATOR && p[16..48].iter().all(|b| *b == 0)
            && p[48] == 20 && p[50] == 20 && p[54..152].iter().all(|b| *b == 0)
            && u128_at(&p, 152)? == q.sqrt_price, "pool fees differ from fixed approved policy")?;
        ensure(key_at(&p, 296)? == Pubkey::default() && u128_at(&p, 360)? == q.liquidity
            && u64_at(&p, 392)? == 0 && u64_at(&p, 400)? == 0
            && u128_at(&p, 424)? == migration::MIN_SQRT_PRICE
            && u128_at(&p, 440)? == migration::MAX_SQRT_PRICE
            && u128_at(&p, 456)? == q.sqrt_price && p[480..486] == [1,0,0,0,0,1]
            && u64_at(&p, 472)? == u64::try_from(Clock::get()?.unix_timestamp).map_err(|_| ProgramError::InvalidAccountData)?
            && p[488..552].iter().all(|b| *b == 0) && u64_at(&p, 632)? == 1,
            "unexpected initial pool policy, price, activation or positions")?;
        ensure(u128_at(&t, 152)? == q.liquidity.checked_sub(locked).ok_or(ProgramError::InvalidAccountData)?
            && u128_at(&t, 168)? == 0 && u128_at(&t, 184)? == locked
            && u128_at(&p, 552)? == locked && t[72..152].iter().all(|b| *b == 0)
            && t[200..408].iter().all(|b| *b == 0), "unexpected initial position or partial lock")?;
    }
    Ok(())
}

fn validate_receipt(c: &Migrate, a: &meteora::MigrationAddresses) -> Result<()> {
    let r = &c.receipt;
    ensure(r.version == 1 && r.route_version == ROUTE_VERSION && r.curve == c.curve.key()
        && r.mint == c.mint.key() && r.creator == c.curve.creator && r.route == c.route.key()
        && r.config == a.config && r.pool == a.pool && r.position == a.position
        && r.position_nft_mint == a.position_nft_mint && r.position_owner == a.position_owner
        && r.treasury == TREASURY && r.quote_mint == meteora::WSOL_MINT
        && r.lock_policy == migration::LOCK_POLICY_PERMANENT
        && r.settlement_policy_version == fees::settlement::SETTLEMENT_POLICY_VERSION,
        "invalid migration receipt binding")?;
    ensure(r.token_a_budget == LIQUIDITY_TOKEN_ALLOCATION && r.token_b_budget > 0
        && add(r.token_a_deposited, r.token_a_dust)? == r.token_a_budget
        && add(r.token_b_deposited, r.token_b_dust)? == r.token_b_budget
        && r.token_a_deposited > 0 && r.token_b_deposited > 0 && r.liquidity > 0
        && c.curve.real_sol_reserves == r.token_b_dust && c.vault.amount >= r.token_a_dust,
        "invalid receipt conservation or source remainder")?;
    Ok(())
}

/// Anyone may sponsor graduation. The budget caps account/setup lamports, NOT
/// transaction fees. A conservative full receipt rent is reserved in the cap;
/// unsolicited receipt prefunding can only reduce the actual sponsor debit.
pub fn migrate(ctx: Context<Migrate>, max_setup_lamports: u64) -> Result<()> {
    ensure(ctx.remaining_accounts.is_empty(), "unexpected remaining accounts")?;
    let c = ctx.accounts;
    validate_curve_configuration(&c.curve)?;
    ensure(c.curve.graduated && c.curve.real_token_reserves == 0, "curve is not complete")?;
    let config = if c.receipt.version == 0 { c.route.config } else { c.receipt.config };
    let a = meteora::derive_addresses(&crate::ID, &c.mint.key(), &config)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    canonical(c, &a)?;
    ensure(c.receipt.bump == 0 || c.receipt.bump == ctx.bumps.receipt, "receipt bump mismatch")?;
    // Replay is intentionally BEFORE deployment freshness, rent budgets, temporary
    // account state, seed price and vault balance equality. No CPI or refund occurs.
    if c.receipt.version != 0 {
        validate_receipt(c, &a)?;
        pool_and_position(c, &a, None, c.receipt.liquidity)?;
        nft(c, &a)?;
        msg!("Protected migration already completed; no funds moved");
        return Ok(());
    }
    validate_route(&c.route.key(), &c.route, &c.config, &c.damm_program, &c.damm_program_data)?;
    ensure(c.sponsor.owner == &anchor_lang::system_program::ID && c.sponsor.data_is_empty(), "sponsor must be a system payer")?;
    ensure(c.mint.decimals == DECIMALS && c.mint.mint_authority == COption::None
        && c.mint.freeze_authority == COption::None && c.mint.supply <= TOTAL_SUPPLY,
        "unsupported mint or restored authority")?;
    for (account, key) in [
        (&*c.payer, a.payer), (&*c.pool, a.pool), (&*c.position, a.position),
        (&*c.position_nft_mint, a.position_nft_mint), (&*c.position_nft_account, a.position_nft_account),
        (&*c.token_a_vault, a.token_a_vault), (&*c.token_b_vault, a.token_b_vault),
        (&*c.token_a_staging, a.token_a_staging), (&*c.token_b_staging, a.token_b_staging),
    ] { fresh(account, &key)?; }
    let before_curve = c.curve.to_account_info().lamports();
    let before_vault = token_account(&c.vault.to_account_info(), &a.mint, &a.curve, false)?.amount;
    let rent = Rent::get()?;
    let q = migration::seed_completed_curve(&c.curve, before_curve,
        rent.minimum_balance(Curve::SPACE), before_vault).map_err(|_| ProgramError::InvalidAccountData)?;
    let budget_b = c.curve.real_sol_reserves;
    let before_payer = c.payer.lamports();
    let prefund_a = c.token_a_staging.lamports();
    let prefund_b = c.token_b_staging.lamports();
    let pool_b_donation = c.token_b_vault.lamports().saturating_sub(rent.minimum_balance(spl_token::state::Account::LEN));
    let allowance = sub(max_setup_lamports, rent.minimum_balance(MigrationReceipt::SPACE))?;
    let infos = c.to_account_infos();
    let payer_bump = [local(&[meteora::PAYER_SEED, a.curve.as_ref()]).1];
    let payer_seeds: &[&[u8]] = &[meteora::PAYER_SEED, a.curve.as_ref(), &payer_bump];
    let curve_bump = [c.curve.bump];
    let curve_seeds: &[&[u8]] = &[b"curve", a.mint.as_ref(), &curve_bump];
    let nft_bump = [local(&[meteora::POSITION_MINT_SEED, a.curve.as_ref()]).1];
    let nft_seeds: &[&[u8]] = &[meteora::POSITION_MINT_SEED, a.curve.as_ref(), &nft_bump];
    let creator_bump = [local(&[meteora::CREATOR_SEED]).1];
    let creator_seeds: &[&[u8]] = &[meteora::CREATOR_SEED, &creator_bump];
    let owner_bump = [local(&[meteora::POSITION_OWNER_SEED, a.curve.as_ref()]).1];
    let owner_seeds: &[&[u8]] = &[meteora::POSITION_OWNER_SEED, a.curve.as_ref(), &owner_bump];
    let a_bump = [local(&[meteora::STAGING_SEED, a.curve.as_ref(), a.mint.as_ref()]).1];
    let a_seeds: &[&[u8]] = &[meteora::STAGING_SEED, a.curve.as_ref(), a.mint.as_ref(), &a_bump];
    let b_bump = [local(&[meteora::STAGING_SEED, a.curve.as_ref(), meteora::WSOL_MINT.as_ref()]).1];
    let b_seeds: &[&[u8]] = &[meteora::STAGING_SEED, a.curve.as_ref(), meteora::WSOL_MINT.as_ref(), &b_bump];
    call(system_instruction::transfer(&c.sponsor.key(), &a.payer, allowance), &infos, &[])?;
    let rent_a = allocate(&c.token_a_staging, &c.payer, &spl_token::ID, spl_token::state::Account::LEN,
        &infos, &[payer_seeds, a_seeds])?;
    let rent_b = allocate(&c.token_b_staging, &c.payer, &spl_token::ID, spl_token::state::Account::LEN,
        &infos, &[payer_seeds, b_seeds])?;
    for (stage, mint) in [(a.token_a_staging, a.mint), (a.token_b_staging, meteora::WSOL_MINT)] {
        call(spl_token::instruction::initialize_account3(&spl_token::ID, &stage, &mint, &a.payer)?, &infos, &[])?;
    }
    call(spl_token::instruction::transfer(&spl_token::ID, &c.vault.key(), &a.token_a_staging,
        &a.curve, &[], q.token_a_amount)?, &infos, &[curve_seeds])?;
    transfer_curve_sol(&c.curve.to_account_info(), &c.token_b_staging, q.token_b_amount)?;
    call(spl_token::instruction::sync_native(&spl_token::ID, &a.token_b_staging)?, &infos, &[])?;
    let stage_a = token_account(&c.token_a_staging, &a.mint, &a.payer, false)?;
    let stage_b = token_account(&c.token_b_staging, &meteora::WSOL_MINT, &a.payer, true)?;
    ensure(stage_a.amount == q.token_a_amount && stage_b.amount >= q.token_b_amount,
        "staging does not cover exact principal")?;
    call(meteora::initialize_pool_instruction(&a, &q), &infos, &[payer_seeds, nft_seeds, creator_seeds])?;
    pool_and_position(c, &a, Some(&q), 0)?;
    nft(c, &a)?;
    let av = token_account(&c.token_a_vault, &a.mint, &a.pool_authority, false)?;
    let bv = token_account(&c.token_b_vault, &meteora::WSOL_MINT, &a.pool_authority, true)?;
    ensure(av.amount == q.token_a_amount && bv.amount == add(q.token_b_amount, pool_b_donation)?,
        "external vault deposits differ from principal")?;
    ensure(token_account(&c.token_a_staging, &a.mint, &a.payer, false)?.amount == 0
        && token_account(&c.token_b_staging, &meteora::WSOL_MINT, &a.payer, true)?.amount == sub(stage_b.amount, q.token_b_amount)?,
        "CPI consumed an unexpected staging amount")?;
    let mut data = meteora::permissionless::PERMANENT_LOCK_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&q.liquidity.to_le_bytes());
    call(Instruction { program_id: meteora::PROGRAM_ID, data, accounts: vec![
        AccountMeta::new(a.pool, false), AccountMeta::new(a.position, false),
        AccountMeta::new_readonly(a.position_nft_account, false), AccountMeta::new_readonly(a.position_owner, true),
        AccountMeta::new_readonly(a.event_authority, false), AccountMeta::new_readonly(meteora::PROGRAM_ID, false),
    ] }, &infos, &[owner_seeds])?;
    pool_and_position(c, &a, Some(&q), q.liquidity)?;
    // Close temporary accounts to the source, not an arbitrary sponsor. Only the
    // rent contributed by this invocation is reimbursed. Prefunding stays an
    // untracked source donation and can never become seed principal or a refund.
    for stage in [a.token_a_staging, a.token_b_staging] {
        call(spl_token::instruction::close_account(&spl_token::ID, &stage, &a.curve, &a.payer, &[])?,
            &infos, &[payer_seeds])?;
    }
    transfer_curve_sol(&c.curve.to_account_info(), &c.payer, add(rent_a, rent_b)?)?;
    ensure(c.curve.to_account_info().lamports() == add(sub(before_curve, q.token_b_amount)?, add(prefund_a, prefund_b)?)?,
        "source SOL conservation failed")?;
    c.vault.reload()?;
    ensure(c.vault.amount == sub(before_vault, q.token_a_amount)?, "source token conservation failed")?;
    // Pre-existing payer funds are never spent. Too-small sponsorship rolls back
    // the entire migration even if a pre-funded payer temporarily covered a CPI.
    let refund = sub(c.payer.lamports(), before_payer)?;
    ensure(refund <= allowance, "unexpected sponsor refund")?;
    if refund > 0 { call(system_instruction::transfer(&a.payer, &c.sponsor.key(), refund), &infos, &[payer_seeds])?; }
    ensure(c.payer.lamports() == before_payer, "payer donation conservation failed")?;
    c.curve.real_sol_reserves = q.token_b_dust;
    c.receipt.set_inner(MigrationReceipt {
        version: 1, bump: ctx.bumps.receipt, route_version: c.route.version,
        lock_policy: migration::LOCK_POLICY_PERMANENT,
        settlement_policy_version: fees::settlement::SETTLEMENT_POLICY_VERSION,
        curve: a.curve, mint: a.mint, creator: c.curve.creator, route: c.route.key(),
        config: a.config, config_hash: c.route.config_hash, pool: a.pool, position: a.position,
        position_nft_mint: a.position_nft_mint, position_owner: a.position_owner,
        treasury: TREASURY, quote_mint: meteora::WSOL_MINT,
        token_a_budget: LIQUIDITY_TOKEN_ALLOCATION, token_b_budget: budget_b,
        token_a_deposited: q.token_a_amount, token_b_deposited: q.token_b_amount,
        token_a_dust: q.token_a_dust, token_b_dust: q.token_b_dust,
        sqrt_price: q.sqrt_price, liquidity: q.liquidity, completed_slot: Clock::get()?.slot,
        damm_deployment_slot: c.route.damm_deployment_slot,
    });
    emit!(MigrationCompleted { mint: a.mint, curve: a.curve, pool: a.pool, receipt: a.receipt,
        token_a_deposited: q.token_a_amount, token_b_deposited: q.token_b_amount, locked_liquidity: q.liquidity });
    Ok(())
}

#[event]
pub struct MigrationCompleted {
    pub mint: Pubkey, pub curve: Pubkey, pub pool: Pubkey, pub receipt: Pubkey,
    pub token_a_deposited: u64, pub token_b_deposited: u64, pub locked_liquidity: u128,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn receipt_has_exact_fixed_size_and_roundtrips() {
        let body = vec![0u8; MigrationReceipt::SPACE - 8];
        let r = MigrationReceipt::deserialize(&mut body.as_slice()).unwrap();
        let mut bytes = vec![]; r.try_serialize(&mut bytes).unwrap();
        assert_eq!(bytes.len(), MigrationReceipt::SPACE);
        assert_eq!(MigrationReceipt::try_deserialize(&mut bytes.as_slice()).unwrap(), r);
    }
    #[test]
    fn external_reads_are_bounded_and_preserve_full_integer_range() {
        assert!(u128_at(&[0; 15], 0).is_err());
        assert!(key_at(&[0; 32], 1).is_err());
        assert_eq!(u64_at(&u64::MAX.to_le_bytes(), 0).unwrap(), u64::MAX);
        assert_eq!(u128_at(&u128::MAX.to_le_bytes(), 0).unwrap(), u128::MAX);
        assert!(add(u64::MAX, 1).is_err()); assert!(sub(0, 1).is_err());
    }
}
