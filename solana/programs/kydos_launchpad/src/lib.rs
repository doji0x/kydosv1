use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::pubkey;
use anchor_spl::metadata::{
    create_metadata_accounts_v3, mpl_token_metadata,
    CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use mpl_token_metadata::types::DataV2;

declare_id!("GnWBA3sdhKYCAZt2TnBEQmFiF7mvP7ydzUyjcompioQE");

pub mod math;
pub mod fees;
pub mod meteora;
pub mod migration;

pub const FEE_POLICY_VERSION: u8 = 1;
pub const TREASURY: Pubkey = pubkey!("5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg");

pub const DECIMALS: u8 = 6;
pub const SCALE: u64 = 1_000_000;
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * SCALE;
pub const CURVE_TOKEN_ALLOCATION: u64 = 793_100_000 * SCALE;
pub const LIQUIDITY_TOKEN_ALLOCATION: u64 = 206_900_000 * SCALE;
pub const VIRTUAL_TOKEN_RESERVES: u64 = 1_073_000_000 * SCALE;
pub const VIRTUAL_SOL_RESERVES: u64 = 30_000_000_000;
// Indicative one-shot completion cost, not a hard SOL cutoff.
pub const GRADUATION_TARGET: u64 = 85_005_359_057;

#[program]
pub mod kydos_launchpad {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        metadata_uri: String,
    ) -> Result<()> {
        require!(name.as_bytes().len() <= 32, ErrorCode::NameTooLong);
        require!(symbol.as_bytes().len() <= 10, ErrorCode::SymbolTooLong);
        require!(metadata_uri.as_bytes().len() <= 200, ErrorCode::UriTooLong);

        let curve = &mut ctx.accounts.curve;
        curve.creator = ctx.accounts.creator.key();
        curve.mint = ctx.accounts.mint.key();
        curve.bump = ctx.bumps.curve;
        curve.decimals = DECIMALS;
        curve.name = name.clone();
        curve.symbol = symbol.clone();
        curve.metadata_uri = metadata_uri.clone();
        curve.total_supply = TOTAL_SUPPLY;
        curve.curve_token_allocation = CURVE_TOKEN_ALLOCATION;
        curve.liquidity_token_allocation = LIQUIDITY_TOKEN_ALLOCATION;
        curve.virtual_token_reserves = VIRTUAL_TOKEN_RESERVES;
        curve.virtual_sol_reserves = VIRTUAL_SOL_RESERVES;
        curve.real_token_reserves = CURVE_TOKEN_ALLOCATION;
        curve.real_sol_reserves = 0;
        curve.graduation_target = GRADUATION_TARGET;
        curve.graduated = false;

        let policy = &mut ctx.accounts.fee_policy;
        policy.version = FEE_POLICY_VERSION;
        policy.bump = ctx.bumps.fee_policy;
        policy.curve = curve.key();
        policy.treasury = TREASURY;
        policy.trading_fee_bps = fees::TRADING_FEE_BPS;

        let mint = ctx.accounts.mint.key();
        let signer_seeds: &[&[&[u8]]] = &[&[b"curve", mint.as_ref(), &[curve.bump]]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: curve.to_account_info(),
                },
                signer_seeds,
            ),
            TOTAL_SUPPLY,
        )?;
        ctx.accounts.vault.reload()?;
        let tracked_reserves = curve.real_token_reserves
            .checked_add(curve.liquidity_token_allocation)
            .ok_or(ErrorCode::MathOverflow)?;
        require_eq!(ctx.accounts.vault.amount, tracked_reserves, ErrorCode::InvalidCurve);

        create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: curve.to_account_info(),
                    payer: ctx.accounts.creator.to_account_info(),
                    update_authority: curve.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                signer_seeds,
            ),
            DataV2 {
                name,
                symbol,
                uri: metadata_uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            true,
            true,
            None,
        )?;

        for authority_type in [AuthorityType::MintTokens, AuthorityType::FreezeAccount] {
            token::set_authority(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    SetAuthority {
                        current_authority: curve.to_account_info(),
                        account_or_mint: ctx.accounts.mint.to_account_info(),
                    },
                    signer_seeds,
                ),
                authority_type,
                None,
            )?;
        }

        emit!(LaunchCreated {
            mint,
            creator: curve.creator,
            total_supply: TOTAL_SUPPLY,
        });
        Ok(())
    }

    pub fn buy(ctx: Context<Trade>, sol_in: u64, min_tokens_out: u64) -> Result<()> {
        require!(sol_in > 0, ErrorCode::ZeroAmount);
        let curve = &mut ctx.accounts.curve;
        validate_curve_configuration(curve)?;
        require!(!curve.graduated, ErrorCode::Graduated);
        let quote = fees::quote_buy(curve.real_sol_reserves, curve.real_token_reserves, sol_in)
            .map_err(map_math_error)?;
        let accepted = quote.net_sol;
        let out = quote.tokens_out;
        require!(out >= min_tokens_out && out > 0, ErrorCode::Slippage);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.trader.to_account_info(),
                    to: curve.to_account_info(),
                },
            ),
            accepted,
        )?;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.trader.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            quote.fee_sol,
        )?;
        let mint = curve.mint;
        let signer_seeds: &[&[&[u8]]] = &[&[b"curve", mint.as_ref(), &[curve.bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.trader_tokens.to_account_info(),
                    authority: curve.to_account_info(),
                },
                signer_seeds,
            ),
            out,
        )?;
        curve.real_sol_reserves = curve.real_sol_reserves.checked_add(accepted).ok_or(ErrorCode::MathOverflow)?;
        curve.real_token_reserves = curve.real_token_reserves.checked_sub(out).ok_or(ErrorCode::MathOverflow)?;
        if curve.real_token_reserves == 0 {
            curve.graduated = true;
            emit!(Graduated {
                mint: curve.mint,
                sol_reserve: curve.real_sol_reserves,
                token_reserve: curve.real_token_reserves,
            });
        }
        emit!(TradeExecuted {
            mint: curve.mint,
            trader: ctx.accounts.trader.key(),
            side: 0,
            sol_amount: accepted,
            token_amount: out,
            graduated: curve.graduated,
        });
        emit!(TradeFeePaid { mint: curve.mint, trader: ctx.accounts.trader.key(), side: 0,
            treasury: ctx.accounts.treasury.key(), gross_sol: quote.gross_sol,
            fee_sol: quote.fee_sol, net_sol: quote.net_sol });
        Ok(())
    }

    pub fn sell(ctx: Context<Trade>, tokens_in: u64, min_sol_out: u64) -> Result<()> {
        require!(tokens_in > 0, ErrorCode::ZeroAmount);
        let curve = &mut ctx.accounts.curve;
        validate_curve_configuration(curve)?;
        require!(!curve.graduated, ErrorCode::Graduated);
        let quote = fees::quote_sell(curve.real_sol_reserves, curve.real_token_reserves, tokens_in)
            .map_err(map_math_error)?;
        // Slippage protects the seller's proceeds after the treasury fee.
        require!(quote.net_sol >= min_sol_out, ErrorCode::Slippage);
        let remaining_sol = curve.real_sol_reserves.checked_sub(quote.gross_sol).ok_or(ErrorCode::Liquidity)?;
        let curve_info = curve.to_account_info();
        let remaining_lamports = curve_info.lamports().checked_sub(quote.gross_sol).ok_or(ErrorCode::Liquidity)?;
        let rent_and_reserves = Rent::get()?.minimum_balance(Curve::SPACE)
            .checked_add(remaining_sol).ok_or(ErrorCode::MathOverflow)?;
        require!(remaining_lamports >= rent_and_reserves, ErrorCode::Liquidity);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.trader_tokens.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            tokens_in,
        )?;
        transfer_curve_sol(&curve_info, &ctx.accounts.trader.to_account_info(), quote.net_sol)?;
        transfer_curve_sol(&curve_info, &ctx.accounts.treasury.to_account_info(), quote.fee_sol)?;
        curve.real_sol_reserves = remaining_sol;
        curve.real_token_reserves = curve.real_token_reserves.checked_add(tokens_in).ok_or(ErrorCode::MathOverflow)?;
        emit!(TradeExecuted {
            mint: curve.mint,
            trader: ctx.accounts.trader.key(),
            side: 1,
            sol_amount: quote.gross_sol,
            token_amount: tokens_in,
            graduated: curve.graduated,
        });
        emit!(TradeFeePaid { mint: curve.mint, trader: ctx.accounts.trader.key(), side: 1,
            treasury: ctx.accounts.treasury.key(), gross_sol: quote.gross_sol,
            fee_sol: quote.fee_sol, net_sol: quote.net_sol });
        Ok(())
    }
}

fn transfer_curve_sol(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    require_keys_neq!(from.key(), to.key(), ErrorCode::InvalidFeePolicy);
    let debit = from.lamports().checked_sub(amount).ok_or(ErrorCode::Liquidity)?;
    let credit = to.lamports().checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    **from.try_borrow_mut_lamports()? = debit;
    **to.try_borrow_mut_lamports()? = credit;
    Ok(())
}

fn validate_curve_configuration(curve: &Curve) -> Result<()> {
    // Reject legacy curve pricing; an upgrade must never silently reprice old accounts.
    require_eq!(curve.virtual_token_reserves, VIRTUAL_TOKEN_RESERVES, ErrorCode::InvalidCurve);
    require_eq!(curve.virtual_sol_reserves, VIRTUAL_SOL_RESERVES, ErrorCode::InvalidCurve);
    require_eq!(curve.curve_token_allocation, CURVE_TOKEN_ALLOCATION, ErrorCode::InvalidCurve);
    require_eq!(curve.liquidity_token_allocation, LIQUIDITY_TOKEN_ALLOCATION, ErrorCode::InvalidCurve);
    require_eq!(curve.total_supply, TOTAL_SUPPLY, ErrorCode::InvalidCurve);
    require_eq!(curve.decimals, DECIMALS, ErrorCode::InvalidCurve);
    require_eq!(curve.graduation_target, GRADUATION_TARGET, ErrorCode::InvalidCurve);
    require!(curve.real_token_reserves <= CURVE_TOKEN_ALLOCATION, ErrorCode::InvalidCurve);
    require!(curve.graduated == (curve.real_token_reserves == 0), ErrorCode::InvalidCurve);
    Ok(())
}

fn map_math_error(error: math::MathError) -> anchor_lang::error::Error {
    match error {
        math::MathError::ZeroAmount => error!(ErrorCode::ZeroAmount),
        math::MathError::Overflow => error!(ErrorCode::MathOverflow),
        math::MathError::Complete => error!(ErrorCode::Graduated),
        math::MathError::Liquidity => error!(ErrorCode::Liquidity),
        math::MathError::InvalidReserves => error!(ErrorCode::InvalidCurve),
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, mint::decimals = DECIMALS, mint::authority = curve, mint::freeze_authority = curve)]
    pub mint: Account<'info, Mint>,
    #[account(init, payer = creator, seeds = [b"curve", mint.key().as_ref()], bump, space = Curve::SPACE)]
    pub curve: Account<'info, Curve>,
    #[account(init, payer = creator, seeds = [b"fee_policy", curve.key().as_ref()], bump, space = FeePolicy::SPACE)]
    pub fee_policy: Account<'info, FeePolicy>,
    #[account(init, payer = creator, seeds = [b"vault", mint.key().as_ref()], bump, token::mint = mint, token::authority = curve)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: Canonical PDA is enforced against the executable Metaplex program.
    #[account(mut, seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), mint.key().as_ref()], bump, seeds::program = mpl_token_metadata::ID)]
    pub metadata: UncheckedAccount<'info>,
    pub metadata_program: Program<'info, Metadata>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(mut, seeds = [b"curve", mint.key().as_ref()], bump = curve.bump, has_one = mint)]
    pub curve: Account<'info, Curve>,
    #[account(seeds = [b"fee_policy", curve.key().as_ref()], bump = fee_policy.bump,
        has_one = curve, has_one = treasury,
        constraint = fee_policy.version == FEE_POLICY_VERSION @ ErrorCode::InvalidFeePolicy,
        constraint = fee_policy.trading_fee_bps == fees::TRADING_FEE_BPS @ ErrorCode::InvalidFeePolicy)]
    pub fee_policy: Account<'info, FeePolicy>,
    #[account(mut, address = TREASURY @ ErrorCode::InvalidFeePolicy)]
    pub treasury: SystemAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", mint.key().as_ref()], bump, token::mint = mint, token::authority = curve)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = trader)]
    pub trader_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Curve {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
    pub decimals: u8,
    pub name: String,
    pub symbol: String,
    pub metadata_uri: String,
    pub total_supply: u64,
    pub curve_token_allocation: u64,
    pub liquidity_token_allocation: u64,
    pub virtual_token_reserves: u64,
    pub virtual_sol_reserves: u64,
    pub real_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub graduation_target: u64,
    /// True means curve complete / awaiting migration, NOT an active AMM.
    pub graduated: bool,
}

impl Curve {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + (4 + 32) + (4 + 10) + (4 + 200) + (8 * 8) + 1;
}

// Separate immutable account preserves the existing Curve layout. Older curves
// without a policy cannot trade through this interface and need a rollout plan.
#[account]
pub struct FeePolicy {
    pub version: u8,
    pub bump: u8,
    pub curve: Pubkey,
    pub treasury: Pubkey,
    pub trading_fee_bps: u16,
}

impl FeePolicy { pub const SPACE: usize = 8 + 1 + 1 + 32 + 32 + 2; }

#[event]
pub struct LaunchCreated { pub mint: Pubkey, pub creator: Pubkey, pub total_supply: u64 }
#[event]
pub struct TradeExecuted { pub mint: Pubkey, pub trader: Pubkey, pub side: u8, pub sol_amount: u64, pub token_amount: u64, pub graduated: bool }
// TradeExecuted.sol_amount remains reserve movement (buy net / sell gross).
#[event]
pub struct TradeFeePaid { pub mint: Pubkey, pub trader: Pubkey, pub side: u8, pub treasury: Pubkey, pub gross_sol: u64, pub fee_sol: u64, pub net_sol: u64 }
#[event]
pub struct Graduated { pub mint: Pubkey, pub sol_reserve: u64, pub token_reserve: u64 }

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be positive")] ZeroAmount,
    #[msg("Slippage exceeded")] Slippage,
    #[msg("Arithmetic overflow")] MathOverflow,
    #[msg("Curve complete; awaiting AMM migration")] Graduated,
    #[msg("Insufficient liquidity")] Liquidity,
    #[msg("Name too long")] NameTooLong,
    #[msg("Symbol too long")] SymbolTooLong,
    #[msg("URI too long")] UriTooLong,
    #[msg("Invalid curve configuration")] InvalidCurve,
    #[msg("Invalid or unsupported fee policy")] InvalidFeePolicy,
}

#[cfg(test)]
mod settlement_tests {
    use super::*;

    #[test]
    fn sell_payments_preserve_rent_and_handle_trader_treasury_aliasing() {
        let curve_key = Pubkey::new_unique();
        let system = system_program::ID;
        let rent = Rent::default().minimum_balance(Curve::SPACE);
        let mut curve_balance = rent + 1_000;
        let mut recipient_balance = 50;
        let mut curve_data = [];
        let mut recipient_data = [];
        let curve = AccountInfo::new(&curve_key, false, true, &mut curve_balance, &mut curve_data, &crate::ID, false, 0);
        let trader = AccountInfo::new(&TREASURY, true, true, &mut recipient_balance, &mut recipient_data, &system, false, 0);
        let treasury = trader.clone();
        transfer_curve_sol(&curve, &trader, 990).unwrap();
        transfer_curve_sol(&curve, &treasury, 10).unwrap();
        assert_eq!(curve.lamports(), rent);
        assert_eq!(trader.lamports(), 1_050);
        assert!(transfer_curve_sol(&curve, &curve, 1).is_err());
        assert_eq!(curve.lamports(), rent);
    }
}