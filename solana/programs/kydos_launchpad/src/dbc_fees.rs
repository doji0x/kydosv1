//! DBC launch registration and atomic fee custody. No LP withdrawal, arbitrary
//! CPI, destination override, authority rotation or account-close entrypoint.
//! Policy is pinned to the exact tested SDK 1.5.13 configuration, not a caller
//! assertion. New program versions must review any change to that policy.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{hash::hash, instruction::{AccountMeta, Instruction},
    program::invoke_signed, program_error::ProgramError, program_option::COption,
    program_pack::Pack, pubkey};
use anchor_spl::token::{spl_token, Mint, Token, TokenAccount};
use anchor_spl::token_2022::spl_token_2022;
use spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions};
use crate::{fees::settlement::plan_fee_settlement, meteora, TREASURY, TOTAL_SUPPLY, DECIMALS};

pub const DBC: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
pub const DBC_AUTHORITY: Pubkey = pubkey!("FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM");
pub const DAMM_CONFIG: Pubkey = pubkey!("A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck");
pub const AUTHORITY_SEED: &[u8] = b"dbc_fee_authority";
pub const LAUNCH_SEED: &[u8] = b"dbc_launch";
pub const BASE_FEES_SEED: &[u8] = b"dbc_base_fees";
pub const QUOTE_FEES_SEED: &[u8] = b"dbc_quote_fees";
// SHA256 of PoolConfig[104..1048], measured from executed DBC config creation.
// Prefix holds discriminator/quote mint/fee claimer/leftover receiver, checked
// independently. The suffix pins ALL fees, supply, curve, locks and padding.
pub const CONFIG_POLICY_HASH: [u8;32] = [252,3,199,66,70,63,99,232,57,218,18,141,208,251,145,154,195,205,223,181,144,87,248,171,31,174,237,98,94,42,164,111];

fn check(ok: bool, reason: &str) -> Result<()> {
    if !ok { msg!("Kydos DBC fees: {}", reason); return Err(ProgramError::InvalidAccountData.into()); }
    Ok(())
}
fn bytes<const N:usize>(data:&[u8], offset:usize) -> Result<[u8;N]> {
    data.get(offset..offset.checked_add(N).ok_or(ProgramError::InvalidAccountData)?)
        .ok_or(ProgramError::InvalidAccountData)?.try_into().map_err(|_| ProgramError::InvalidAccountData.into())
}
fn key(data:&[u8], offset:usize) -> Result<Pubkey> { Ok(Pubkey::new_from_array(bytes(data,offset)?)) }
fn u64_at(data:&[u8], offset:usize) -> Result<u64> { Ok(u64::from_le_bytes(bytes(data,offset)?)) }
fn u128_at(data:&[u8], offset:usize) -> Result<u128> { Ok(u128::from_le_bytes(bytes(data,offset)?)) }
fn disc(name:&str) -> [u8;8] { hash(name.as_bytes()).to_bytes()[..8].try_into().unwrap() }
fn authority() -> (Pubkey,u8) { Pubkey::find_program_address(&[AUTHORITY_SEED], &crate::ID) }
fn pool_address(mint:&Pubkey, config:&Pubkey, program:&Pubkey) -> Pubkey {
    let quote=meteora::WSOL_MINT;
    let (a,b)=if mint.to_bytes()>quote.to_bytes(){(mint,&quote)}else{(&quote,mint)};
    Pubkey::find_program_address(&[b"pool",config.as_ref(),a.as_ref(),b.as_ref()],program).0
}
fn vault_address(mint:&Pubkey,pool:&Pubkey,program:&Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"token_vault",mint.as_ref(),pool.as_ref()],program).0
}
fn event_address(program:&Pubkey)->Pubkey {Pubkey::find_program_address(&[b"__event_authority"],program).0}
fn owned(info:&AccountInfo, owner:&Pubkey, name:&str, len:usize)->Result<()> {
    check(info.owner==owner && !info.executable && info.data_len()==len,"unsupported external account")?;
    check(info.try_borrow_data()?[..8]==disc(name),"external discriminator mismatch")
}
fn config_bytes(data:&[u8], fee_authority:&Pubkey)->Result<()> {
    check(data.len()==1048,"unsupported DBC config length")?;
    check(data[..8]==disc("account:PoolConfig") && key(data,8)?==meteora::WSOL_MINT
        && key(data,40)?==*fee_authority && key(data,72)?==*fee_authority,
        "DBC config recipients or quote mint mismatch")?;
    check(hash(&data[104..]).to_bytes()==CONFIG_POLICY_HASH,"unapproved DBC configuration policy")
}
fn config(info:&AccountInfo)->Result<()> {
    owned(info,&DBC,"account:PoolConfig",1048)?;
    config_bytes(&info.try_borrow_data()?,&authority().0)
}
fn dbc_pool(info:&AccountInfo,mint:&Pubkey,configuration:&Pubkey)->Result<()> {
    owned(info,&DBC,"account:VirtualPool",424)?;
    check(info.key==&pool_address(mint,configuration,&DBC),"wrong DBC pool address")?;
    let d=info.try_borrow_data()?;
    check(key(&d,72)?==*configuration && key(&d,136)?==*mint && d[304]==0
        && key(&d,168)?==vault_address(mint,info.key,&DBC)
        && key(&d,200)?==vault_address(&meteora::WSOL_MINT,info.key,&DBC),"wrong DBC pool bindings")
}
#[inline(never)]
fn call<'info>(instruction:Instruction, infos:&[AccountInfo<'info>], seeds:&[&[&[u8]]])->Result<()> {
    let mut ordered=Vec::with_capacity(instruction.accounts.len()+1);
    for m in &instruction.accounts {ordered.push(infos.iter().find(|a| a.key==&m.pubkey)
        .ok_or(ProgramError::NotEnoughAccountKeys)?.clone());}
    let program=infos.iter().find(|a| a.key==&instruction.program_id).ok_or(ProgramError::IncorrectProgramId)?;
    check(program.executable,"CPI target must be executable")?;ordered.push(program.clone());
    invoke_signed(&instruction,&ordered,seeds).map_err(Into::into)
}
fn ro(k:Pubkey)->AccountMeta {AccountMeta::new_readonly(k,false)}
fn rw(k:Pubkey)->AccountMeta {AccountMeta::new(k,false)}
fn signer(k:Pubkey, writable:bool)->AccountMeta {if writable {AccountMeta::new(k,true)}else{AccountMeta::new_readonly(k,true)}}

#[account]
#[derive(Debug,PartialEq,Eq)]
pub struct DbcLaunch {
    pub version:u8,
    pub bump:u8,
    pub creator:Pubkey,
    pub mint:Pubkey,
    pub config:Pubkey,
    pub dbc_pool:Pubkey,
    pub damm_pool:Pubkey,
    pub quote_dust:u64,
    pub base_burned:u128,
    pub creator_quote_paid:u128,
    pub kydos_quote_paid:u128,
    pub bonding_quote_paid:u128,
}
impl DbcLaunch {pub const SPACE:usize=8+2+5*32+8+4*16;}

#[derive(Accounts)]
pub struct LaunchDbc<'info> {
    #[account(mut)] pub payer:Signer<'info>,
    pub creator:Signer<'info>,
    /// CHECK: mint must be created by the fixed DBC CPI; signer prevents substitution.
    #[account(mut)] pub mint:Signer<'info>,
    /// CHECK: complete fixed-policy fingerprint, owner, discriminator and recipients.
    pub config:UncheckedAccount<'info>,
    #[account(init,payer=payer,space=DbcLaunch::SPACE,seeds=[LAUNCH_SEED,mint.key().as_ref()],bump)]
    pub launch:Box<Account<'info,DbcLaunch>>,
    #[account(address=meteora::WSOL_MINT)] pub quote_mint:Account<'info,Mint>,
    /// CHECK: all external destination addresses independently derived below.
    #[account(mut)] pub pool:UncheckedAccount<'info>,
    /// CHECK: canonical DBC token vault, validated after creation.
    #[account(mut)] pub base_vault:UncheckedAccount<'info>,
    /// CHECK: canonical DBC quote vault, validated after creation.
    #[account(mut)] pub quote_vault:UncheckedAccount<'info>,
    /// CHECK: canonical Metaplex PDA; initialized by DBC.
    #[account(mut)] pub metadata:UncheckedAccount<'info>,
    /// CHECK: fixed DBC global authority.
    #[account(address=DBC_AUTHORITY)] pub pool_authority:UncheckedAccount<'info>,
    /// CHECK: fixed executable DBC program, never a caller-selected CPI.
    #[account(address=DBC,executable)] pub dbc_program:UncheckedAccount<'info>,
    /// CHECK: canonical DBC event authority.
    pub event_authority:UncheckedAccount<'info>,
    pub metadata_program:Program<'info,anchor_spl::metadata::Metadata>,
    pub token_program:Program<'info,Token>,
    pub system_program:Program<'info,System>,
}
#[derive(AnchorSerialize,AnchorDeserialize)]
pub struct DbcMetadata {pub name:String,pub symbol:String,pub uri:String}

#[inline(never)]
pub fn launch(ctx:Context<LaunchDbc>, metadata:DbcMetadata)->Result<()> {
    check(ctx.remaining_accounts.is_empty(),"unexpected remaining accounts")?;
    check(metadata.name.as_bytes().len()<=32 && metadata.symbol.as_bytes().len()<=10
        && metadata.uri.as_bytes().len()<=200,"metadata exceeds supported bounds")?;
    let c=ctx.accounts;config(&c.config)?;
    let mint=c.mint.key();let cfg=c.config.key();let pool=pool_address(&mint,&cfg,&DBC);
    let meta=anchor_spl::metadata::mpl_token_metadata::accounts::Metadata::find_pda(&mint).0;
    for(actual,expected)in [(c.pool.key(),pool),(c.base_vault.key(),vault_address(&mint,&pool,&DBC)),
        (c.quote_vault.key(),vault_address(&meteora::WSOL_MINT,&pool,&DBC)),
        (c.event_authority.key(),event_address(&DBC)),(c.metadata.key(),meta)] {
        check(actual==expected,"wrong launch destination")?;
    }
    let mut data=disc("global:initialize_virtual_pool_with_spl_token").to_vec();metadata.serialize(&mut data)?;
    let infos=c.to_account_infos();
    call(Instruction{program_id:DBC,data,accounts:vec![ro(cfg),ro(DBC_AUTHORITY),signer(c.creator.key(),false),
        signer(mint,true),ro(meteora::WSOL_MINT),rw(pool),rw(c.base_vault.key()),rw(c.quote_vault.key()),
        rw(meta),ro(c.metadata_program.key()),signer(c.payer.key(),true),ro(spl_token::ID),ro(spl_token::ID),
        ro(c.system_program.key()),ro(c.event_authority.key()),ro(DBC)]},&infos,&[])?;
    dbc_pool(&c.pool,&mint,&cfg)?;
    let d=c.pool.try_borrow_data()?;
    check(key(&d,104)?==c.creator.key() && d[308]==0 && d[370]==0
        && u64_at(&d,240)?==0,"DBC creator or initial state mismatch")?;drop(d);
    check(c.mint.owner==&spl_token::ID,"wrong mint program")?;
    let m=spl_token::state::Mint::unpack(&c.mint.try_borrow_data()?)?;
    check(m.supply==TOTAL_SUPPLY && m.decimals==DECIMALS && m.mint_authority==COption::None
        && m.freeze_authority==COption::None,"creation supply or authorities mismatch")?;
    c.launch.set_inner(DbcLaunch{version:1,bump:ctx.bumps.launch,creator:c.creator.key(),mint,config:cfg,
        dbc_pool:pool,damm_pool:pool_address(&mint,&DAMM_CONFIG,&meteora::PROGRAM_ID),quote_dust:0,
        base_burned:0,creator_quote_paid:0,kydos_quote_paid:0,bonding_quote_paid:0});
    emit!(DbcLaunchRegistered{mint,creator:c.creator.key(),dbc_pool:pool,config:cfg});
    Ok(())
}

#[derive(Accounts)]
pub struct FeeAccounts<'info> {
    #[account(mut)] pub payer:Signer<'info>,
    #[account(mut,seeds=[LAUNCH_SEED,mint.key().as_ref()],bump=launch.bump,has_one=mint,has_one=config,has_one=dbc_pool)]
    pub launch:Box<Account<'info,DbcLaunch>>,
    #[account(mut)] pub mint:Account<'info,Mint>,
    #[account(address=meteora::WSOL_MINT)] pub quote_mint:Account<'info,Mint>,
    /// CHECK: revalidated complete approved DBC config, not authority from caller.
    pub config:UncheckedAccount<'info>,
    /// CHECK: owned, canonical DBC pool; creator may have changed but entitlement may not.
    #[account(mut)] pub dbc_pool:UncheckedAccount<'info>,
    /// CHECK: PDA signer only for fixed fee-claim instructions.
    #[account(seeds=[AUTHORITY_SEED],bump)] pub fee_authority:UncheckedAccount<'info>,
    #[account(init_if_needed,payer=payer,seeds=[BASE_FEES_SEED,mint.key().as_ref()],bump,
        token::mint=mint,token::authority=launch)] pub base_fees:Account<'info,TokenAccount>,
    #[account(init_if_needed,payer=payer,seeds=[QUOTE_FEES_SEED,mint.key().as_ref()],bump,
        token::mint=quote_mint,token::authority=launch)] pub quote_fees:Account<'info,TokenAccount>,
    #[account(mut,token::mint=quote_mint,token::authority=launch.creator)]
    pub creator_quote:Account<'info,TokenAccount>,
    #[account(mut,token::mint=quote_mint,token::authority=TREASURY)]
    pub treasury_quote:Account<'info,TokenAccount>,
    pub token_program:Program<'info,Token>,
    pub system_program:Program<'info,System>,
}
#[derive(Accounts)]
pub struct SettleDammFees<'info> {
    pub fees:FeeAccounts<'info>,
    /// CHECK: authenticated canonical migrated pool; only fee claims, never liquidity removal.
    pub pool:UncheckedAccount<'info>,
    /// CHECK: DAMM position binding, locked amount and zero unlocked liquidity checked.
    #[account(mut)] pub position:UncheckedAccount<'info>,
    /// CHECK: canonical Token-2022 NFT mint; immutable fee controller custody checked.
    pub position_nft_mint:UncheckedAccount<'info>,
    /// CHECK: canonical token account holds one NFT with no delegate/close authority.
    pub position_nft_account:UncheckedAccount<'info>,
    /// CHECK: canonical original SPL pool vault.
    #[account(mut)] pub token_a_vault:UncheckedAccount<'info>,
    /// CHECK: canonical original SPL pool vault.
    #[account(mut)] pub token_b_vault:UncheckedAccount<'info>,
    /// CHECK: canonical DAMM authority derived under fixed program.
    pub pool_authority:UncheckedAccount<'info>,
    /// CHECK: canonical DAMM event authority.
    pub event_authority:UncheckedAccount<'info>,
    /// CHECK: fixed executable target.
    #[account(address=meteora::PROGRAM_ID,executable)] pub damm_program:UncheckedAccount<'info>,
}
#[derive(Accounts)]
pub struct ClaimDbcFees<'info> {
    pub fees:FeeAccounts<'info>,
    /// CHECK: canonical DBC token vault authenticated via DBC pool and seeds.
    #[account(mut)] pub base_vault:UncheckedAccount<'info>,
    /// CHECK: canonical DBC quote vault authenticated via DBC pool and seeds.
    #[account(mut)] pub quote_vault:UncheckedAccount<'info>,
    /// CHECK: fixed DBC pool authority.
    #[account(address=DBC_AUTHORITY)] pub pool_authority:UncheckedAccount<'info>,
    /// CHECK: canonical DBC event authority.
    pub event_authority:UncheckedAccount<'info>,
    /// CHECK: fixed executable target.
    #[account(address=DBC,executable)] pub dbc_program:UncheckedAccount<'info>,
}
fn token_state(info:&AccountInfo)->Result<spl_token::state::Account> {
    check(info.owner==&spl_token::ID && !info.executable,"wrong token account program")?;
    spl_token::state::Account::unpack(&info.try_borrow_data()?).map_err(Into::into)
}
fn validate_fees(c:&FeeAccounts)->Result<()> {
    check(c.launch.version==1 && c.launch.quote_dust<=1,"unsupported launch record")?;
    config(&c.config)?;dbc_pool(&c.dbc_pool,&c.mint.key(),&c.config.key())?;
    check(c.mint.decimals==DECIMALS && c.mint.mint_authority==COption::None
        && c.mint.freeze_authority==COption::None,"invalid mint or restored authority")?;
    let ata=|owner:&Pubkey|anchor_spl::associated_token::get_associated_token_address_with_program_id(owner,&meteora::WSOL_MINT,&spl_token::ID);
    check(c.creator_quote.key()==ata(&c.launch.creator) && c.treasury_quote.key()==ata(&TREASURY),"noncanonical payout accounts")?;
    for info in [c.base_fees.to_account_info(),c.quote_fees.to_account_info()] {
        let a=token_state(&info)?;check(a.owner==c.launch.key() && a.delegate==COption::None
            && a.delegated_amount==0 && a.close_authority==COption::None
            && a.state==spl_token::state::AccountState::Initialized,"fee vault delegated or frozen")?;
        check(info.key!=&c.creator_quote.key() && info.key!=&c.treasury_quote.key(),"payout aliases custody")?;
    }
    check(c.quote_fees.amount>=c.launch.quote_dust,"protected dust is not funded")
}
#[inline(never)]
fn position(c:&SettleDammFees)->Result<()> {
    let f=&c.fees;
    let p=&c.pool;
    check(p.key()==f.launch.damm_pool && p.key()==pool_address(&f.mint.key(),&DAMM_CONFIG,&meteora::PROGRAM_ID),"wrong migrated pool")?;
    check(f.dbc_pool.try_borrow_data()?[308]==3,"DBC has not migrated")?;
    owned(p,&meteora::PROGRAM_ID,"account:Pool",1112)?;
    owned(&c.position,&meteora::PROGRAM_ID,"account:Position",408)?;
    let d=p.try_borrow_data()?;
    check(key(&d,168)?==f.mint.key() && key(&d,200)?==meteora::WSOL_MINT
        && key(&d,232)?==c.token_a_vault.key() && key(&d,264)?==c.token_b_vault.key()
        && key(&d,648)?==DBC_AUTHORITY && d[482..485]==[0,0,0],"wrong AMM mints or fee mode")?;
    check(u64_at(&d,8)?==meteora::BASE_FEE_NUMERATOR && d[16..48].iter().all(|x|*x==0)
        && d[52..54]==[0,0] && d[56]==0,"AMM fees changed from approved fixed policy")?;
    let q=c.position.try_borrow_data()?;
    let nft=c.position_nft_mint.key();
    check(key(&q,8)?==p.key() && key(&q,40)?==nft && u128_at(&q,152)?==0
        && u128_at(&q,168)?==0 && u128_at(&q,184)?>0
        && u128_at(&d,552)?>=u128_at(&q,184)? && q[392..396]==[0;4],"position binding, delegate, or permanent lock mismatch")?;
    let damm=meteora::PROGRAM_ID;
    for(actual,expected)in[(c.position.key(),Pubkey::find_program_address(&[b"position",nft.as_ref()],&damm).0),
        (c.position_nft_account.key(),Pubkey::find_program_address(&[b"position_nft_account",nft.as_ref()],&damm).0),
        (c.pool_authority.key(),Pubkey::find_program_address(&[b"pool_authority"],&damm).0),
        (c.event_authority.key(),event_address(&damm)),
        (c.token_a_vault.key(),vault_address(&f.mint.key(),&p.key(),&damm)),
        (c.token_b_vault.key(),vault_address(&meteora::WSOL_MINT,&p.key(),&damm))] {check(actual==expected,"noncanonical AMM account")?;}
    for(info,mint)in[(&*c.token_a_vault,f.mint.key()),(&*c.token_b_vault,meteora::WSOL_MINT)]{
        let a=token_state(info)?;check(a.mint==mint && a.owner==c.pool_authority.key(),"pool vault custody mismatch")?;
    }
    check(c.position_nft_mint.owner==&spl_token_2022::ID && c.position_nft_account.owner==&spl_token_2022::ID
        && !c.position_nft_mint.executable && !c.position_nft_account.executable,"wrong NFT program")?;
    let md=c.position_nft_mint.try_borrow_data()?;
    let m=StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&md)?;
    check(m.base.supply==1 && m.base.decimals==0 && m.base.is_initialized
        && m.base.mint_authority==COption::Some(c.pool_authority.key())
        && m.base.freeze_authority==COption::Some(p.key()),"invalid position mint")?;
    for e in m.get_extension_types()?{check(matches!(e,ExtensionType::MintCloseAuthority|ExtensionType::MetadataPointer|ExtensionType::TokenMetadata),"unsupported NFT mint extension")?;}
    let ad=c.position_nft_account.try_borrow_data()?;
    let a=StateWithExtensions::<spl_token_2022::state::Account>::unpack(&ad)?;
    check(a.base.mint==nft && a.base.owner==authority().0 && a.base.amount==1
        && a.base.state==spl_token_2022::state::AccountState::Initialized && a.base.delegate==COption::None
        && a.base.delegated_amount==0 && a.base.close_authority==COption::None,"position NFT not in exclusive program custody")?;
    for e in a.get_extension_types()?{check(e==ExtensionType::ImmutableOwner,"unsupported NFT account extension")?;}
    Ok(())
}

#[inline(never)]
pub fn settle(ctx:Context<SettleDammFees>)->Result<()> {
    check(ctx.remaining_accounts.is_empty(),"unexpected remaining accounts")?;
    validate_fees(&ctx.accounts.fees)?;position(ctx.accounts)?;
    let c=ctx.accounts;let infos=c.to_account_infos();let f=&mut c.fees;
    let base_before=f.base_fees.amount;let quote_before=f.quote_fees.amount;
    let supply_before=f.mint.supply;let creator_before=f.creator_quote.amount;let treasury_before=f.treasury_quote.amount;
    let dust_before=f.launch.quote_dust;
    let bump=[authority().1];let auth:&[&[u8]]=&[AUTHORITY_SEED,&bump];
    call(Instruction{program_id:meteora::PROGRAM_ID,data:disc("global:claim_position_fee").to_vec(),accounts:vec![
        ro(c.pool_authority.key()),ro(c.pool.key()),rw(c.position.key()),rw(f.base_fees.key()),rw(f.quote_fees.key()),
        rw(c.token_a_vault.key()),rw(c.token_b_vault.key()),ro(f.mint.key()),ro(meteora::WSOL_MINT),
        ro(c.position_nft_account.key()),signer(f.fee_authority.key(),false),ro(spl_token::ID),ro(spl_token::ID),
        ro(c.event_authority.key()),ro(meteora::PROGRAM_ID)]},&infos,&[auth])?;
    f.base_fees.reload()?;f.quote_fees.reload()?;
    let plan=plan_fee_settlement(base_before,f.base_fees.amount,quote_before,f.quote_fees.amount,dust_before)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    let mint=f.mint.key();let launch_bump=[f.launch.bump];let vault_auth:&[&[u8]]=&[LAUNCH_SEED,mint.as_ref(),&launch_bump];
    if plan.base_to_burn>0 {call(spl_token::instruction::burn_checked(&spl_token::ID,&f.base_fees.key(),&mint,
        &f.launch.key(),&[],plan.base_to_burn,DECIMALS)?,&infos,&[vault_auth])?;}
    for destination in [f.creator_quote.key(),f.treasury_quote.key()] {
        if plan.creator_quote>0 {call(spl_token::instruction::transfer_checked(&spl_token::ID,&f.quote_fees.key(),
            &meteora::WSOL_MINT,&destination,&f.launch.key(),&[],plan.creator_quote,9)?,&infos,&[vault_auth])?;}
    }
    f.mint.reload()?;f.base_fees.reload()?;f.quote_fees.reload()?;
    check(f.mint.supply.checked_add(plan.base_to_burn)==Some(supply_before) && f.base_fees.amount==base_before
        && f.quote_fees.amount==quote_before-dust_before+plan.next_quote_dust,"settlement conservation failed")?;
    payout_check(f,creator_before,treasury_before,plan.creator_quote)?;
    f.launch.quote_dust=plan.next_quote_dust;
    f.launch.base_burned=f.launch.base_burned.checked_add(plan.base_to_burn.into()).ok_or(ProgramError::ArithmeticOverflow)?;
    f.launch.creator_quote_paid=f.launch.creator_quote_paid.checked_add(plan.creator_quote.into()).ok_or(ProgramError::ArithmeticOverflow)?;
    f.launch.kydos_quote_paid=f.launch.kydos_quote_paid.checked_add(plan.kydos_quote.into()).ok_or(ProgramError::ArithmeticOverflow)?;
    emit!(DbcFeesSettled{mint,source:1,base_burned:plan.base_to_burn,quote_received:plan.quote_fees_received,
        creator_quote:plan.creator_quote,kydos_quote:plan.kydos_quote,quote_dust:plan.next_quote_dust});
    Ok(())
}
fn payout_check(f:&FeeAccounts,creator_before:u64,treasury_before:u64,each:u64)->Result<()> {
    let creator=token_state(&f.creator_quote.to_account_info())?.amount;
    let treasury=token_state(&f.treasury_quote.to_account_info())?.amount;
    let same=f.creator_quote.key()==f.treasury_quote.key();
    let expected=if same {each.checked_mul(2)}else{Some(each)}.ok_or(ProgramError::ArithmeticOverflow)?;
    check(creator.checked_sub(creator_before)==Some(expected) && treasury.checked_sub(treasury_before)==Some(expected),"quote payout conservation failed")
}

/// Bonding-phase fees stay 100% Kydos's NET partner revenue. This endpoint may
/// also collect accrued bonding fees after migration; it does not claim DAMM fees.
#[inline(never)]
pub fn claim_bonding(ctx:Context<ClaimDbcFees>)->Result<()> {
    check(ctx.remaining_accounts.is_empty(),"unexpected remaining accounts")?;
    validate_fees(&ctx.accounts.fees)?;
    let c=ctx.accounts;let infos=c.to_account_infos();let f=&mut c.fees;let mint=f.mint.key();
    check(c.base_vault.key()==vault_address(&mint,&f.dbc_pool.key(),&DBC)
        && c.quote_vault.key()==vault_address(&meteora::WSOL_MINT,&f.dbc_pool.key(),&DBC)
        && c.event_authority.key()==event_address(&DBC),"wrong DBC fee source")?;
    let base_before=f.base_fees.amount;let quote_before=f.quote_fees.amount;let treasury_before=f.treasury_quote.amount;
    let mut data=disc("global:claim_trading_fee").to_vec();data.extend_from_slice(&0u64.to_le_bytes());data.extend_from_slice(&u64::MAX.to_le_bytes());
    let bump=[authority().1];let auth:&[&[u8]]=&[AUTHORITY_SEED,&bump];
    call(Instruction{program_id:DBC,data,accounts:vec![ro(DBC_AUTHORITY),ro(f.config.key()),rw(f.dbc_pool.key()),
        rw(f.base_fees.key()),rw(f.quote_fees.key()),rw(c.base_vault.key()),rw(c.quote_vault.key()),
        ro(mint),ro(meteora::WSOL_MINT),signer(f.fee_authority.key(),false),ro(spl_token::ID),ro(spl_token::ID),
        ro(c.event_authority.key()),ro(DBC)]},&infos,&[auth])?;
    f.base_fees.reload()?;f.quote_fees.reload()?;
    check(f.base_fees.amount==base_before,"unexpected bonding base fee")?;
    let received=f.quote_fees.amount.checked_sub(quote_before).ok_or(ProgramError::ArithmeticOverflow)?;
    let lb=[f.launch.bump];let seeds:&[&[u8]]=&[LAUNCH_SEED,mint.as_ref(),&lb];
    if received>0{call(spl_token::instruction::transfer_checked(&spl_token::ID,&f.quote_fees.key(),&meteora::WSOL_MINT,
        &f.treasury_quote.key(),&f.launch.key(),&[],received,9)?,&infos,&[seeds])?;}
    f.quote_fees.reload()?;
    check(f.quote_fees.amount==quote_before && token_state(&f.treasury_quote.to_account_info())?.amount.checked_sub(treasury_before)==Some(received),"bonding payout conservation failed")?;
    f.launch.bonding_quote_paid=f.launch.bonding_quote_paid.checked_add(received.into()).ok_or(ProgramError::ArithmeticOverflow)?;
    emit!(DbcFeesSettled{mint,source:0,base_burned:0,quote_received:received,creator_quote:0,kydos_quote:received,quote_dust:f.launch.quote_dust});
    Ok(())
}
#[event]
pub struct DbcLaunchRegistered {pub mint:Pubkey,pub creator:Pubkey,pub dbc_pool:Pubkey,pub config:Pubkey}
#[event]
pub struct DbcFeesSettled {pub mint:Pubkey,pub source:u8,pub base_burned:u64,pub quote_received:u64,pub creator_quote:u64,pub kydos_quote:u64,pub quote_dust:u64}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn record_layout_roundtrip(){let body=vec![0;DbcLaunch::SPACE-8];let r=DbcLaunch::deserialize(&mut body.as_slice()).unwrap();let mut out=vec![];r.try_serialize(&mut out).unwrap();assert_eq!(out.len(),DbcLaunch::SPACE);assert_eq!(DbcLaunch::try_deserialize(&mut out.as_slice()).unwrap(),r);}
    #[test] fn exact_config_fingerprint_rejects_every_byte_change(){let original=include_bytes!("../../../dbc/fixtures/controller-config.bin");config_bytes(original,&authority().0).unwrap();for i in 0..original.len(){let mut d=original.to_vec();d[i]^=1;assert!(config_bytes(&d,&authority().0).is_err(),"changed byte {i}");}}
    #[test] fn bounded_reads(){assert!(key(&[0;32],1).is_err());assert!(u128_at(&[0;15],0).is_err());assert!(bytes::<8>(&[0;8],usize::MAX).is_err());assert_eq!(u64_at(&u64::MAX.to_le_bytes(),0).unwrap(),u64::MAX);}
    #[test] fn discriminator_and_seeds_are_distinct(){assert_ne!(disc("global:claim_position_fee"),disc("global:claim_trading_fee"));assert_ne!(authority().0,TREASURY);assert_ne!(authority().0,Pubkey::default());}
}
