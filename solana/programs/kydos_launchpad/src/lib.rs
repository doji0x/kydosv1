use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::metadata::{
    create_metadata_accounts_v3, mpl_token_metadata,
    CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount, Transfer};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use mpl_token_metadata::types::DataV2;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZqvFmR6UJA4R9C3bZ9S2");

pub const DECIMALS: u8 = 6;
pub const SCALE: u64 = 1_000_000;
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * SCALE;
pub const CURVE_TOKEN_ALLOCATION: u64 = 793_100_000 * SCALE;
pub const LIQUIDITY_TOKEN_ALLOCATION: u64 = 206_900_000 * SCALE;
pub const VIRTUAL_TOKEN_RESERVES: u64 = CURVE_TOKEN_ALLOCATION;
pub const VIRTUAL_SOL_RESERVES: u64 = 30_000_000_000;
pub const GRADUATION_TARGET: u64 = 85_000_000_000;

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
        let accepted = if curve.graduated {
            sol_in
        } else {
            sol_in.min(curve.graduation_target.checked_sub(curve.real_sol_reserves).ok_or(ErrorCode::MathOverflow)?)
        };
        require!(accepted > 0, ErrorCode::Graduated);
        let effective_tokens = curve.real_token_reserves
            .checked_add(curve.liquidity_token_allocation)
            .ok_or(ErrorCode::MathOverflow)?;
        let quoted = if curve.graduated {
            cp_tokens(curve.real_sol_reserves, effective_tokens, accepted)?
        } else if curve.real_sol_reserves + accepted == curve.graduation_target {
            curve.real_token_reserves
        } else {
            curve_tokens(curve.virtual_sol_reserves, curve.real_sol_reserves, effective_tokens, accepted)?
        };
        let out = quoted.min(curve.real_token_reserves);
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
        if !curve.graduated && curve.real_sol_reserves == curve.graduation_target {
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
        Ok(())
    }

    pub fn sell(ctx: Context<Trade>, tokens_in: u64, min_sol_out: u64) -> Result<()> {
        require!(tokens_in > 0, ErrorCode::ZeroAmount);
        let curve = &mut ctx.accounts.curve;
        validate_curve_configuration(curve)?;
        let effective_tokens = curve.real_token_reserves
            .checked_add(curve.liquidity_token_allocation)
            .ok_or(ErrorCode::MathOverflow)?;
        let out = if curve.graduated {
            cp_sol(curve.real_sol_reserves, effective_tokens, tokens_in)?
        } else {
            curve_sol(curve.virtual_sol_reserves, curve.real_sol_reserves, effective_tokens, tokens_in)?
        };
        require!(out >= min_sol_out && out > 0 && out <= curve.real_sol_reserves, ErrorCode::Slippage);
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
        let curve_info = curve.to_account_info();
        let trader_info = ctx.accounts.trader.to_account_info();
        **curve_info.try_borrow_mut_lamports()? = curve_info.lamports().checked_sub(out).ok_or(ErrorCode::Liquidity)?;
        **trader_info.try_borrow_mut_lamports()? = trader_info.lamports().checked_add(out).ok_or(ErrorCode::MathOverflow)?;
        curve.real_sol_reserves = curve.real_sol_reserves.checked_sub(out).ok_or(ErrorCode::MathOverflow)?;
        curve.real_token_reserves = curve.real_token_reserves.checked_add(tokens_in).ok_or(ErrorCode::MathOverflow)?;
        emit!(TradeExecuted {
            mint: curve.mint,
            trader: ctx.accounts.trader.key(),
            side: 1,
            sol_amount: out,
            token_amount: tokens_in,
            graduated: curve.graduated,
        });
        Ok(())
    }
}

fn validate_curve_configuration(curve: &Curve) -> Result<()> {
    require_eq!(curve.virtual_token_reserves, curve.curve_token_allocation, ErrorCode::InvalidCurve);
    require_eq!(curve.curve_token_allocation.checked_add(curve.liquidity_token_allocation).ok_or(ErrorCode::MathOverflow)?, curve.total_supply, ErrorCode::InvalidCurve);
    Ok(())
}

fn curve_tokens(virtual_sol: u64, sol: u64, tokens: u64, input: u64) -> Result<u64> {
    let x = virtual_sol as u128 + sol as u128;
    let next = x.checked_mul(tokens as u128).ok_or(ErrorCode::MathOverflow)?
        / x.checked_add(input as u128).ok_or(ErrorCode::MathOverflow)?;
    u64::try_from(tokens as u128 - next).map_err(|_| error!(ErrorCode::MathOverflow))
}

fn curve_sol(virtual_sol: u64, sol: u64, tokens: u64, input: u64) -> Result<u64> {
    let x = virtual_sol as u128 + sol as u128;
    let next = x.checked_mul(tokens as u128).ok_or(ErrorCode::MathOverflow)?
        / (tokens as u128 + input as u128);
    u64::try_from(x - next).map_err(|_| error!(ErrorCode::MathOverflow))
}

fn cp_tokens(sol: u64, tokens: u64, input: u64) -> Result<u64> {
    let next = (sol as u128).checked_mul(tokens as u128).ok_or(ErrorCode::MathOverflow)?
        / (sol as u128 + input as u128);
    u64::try_from(tokens as u128 - next).map_err(|_| error!(ErrorCode::MathOverflow))
}

fn cp_sol(sol: u64, tokens: u64, input: u64) -> Result<u64> {
    let next = (sol as u128).checked_mul(tokens as u128).ok_or(ErrorCode::MathOverflow)?
        / (tokens as u128 + input as u128);
    u64::try_from(sol as u128 - next).map_err(|_| error!(ErrorCode::MathOverflow))
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, mint::decimals = DECIMALS, mint::authority = curve, mint::freeze_authority = curve)]
    pub mint: Account<'info, Mint>,
    #[account(init, payer = creator, seeds = [b"curve", mint.key().as_ref()], bump, space = Curve::SPACE)]
    pub curve: Account<'info, Curve>,
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
    pub graduated: bool,
}

impl Curve {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + (4 + 32) + (4 + 10) + (4 + 200) + (8 * 8) + 1;
}

#[event]
pub struct LaunchCreated { pub mint: Pubkey, pub creator: Pubkey, pub total_supply: u64 }
#[event]
pub struct TradeExecuted { pub mint: Pubkey, pub trader: Pubkey, pub side: u8, pub sol_amount: u64, pub token_amount: u64, pub graduated: bool }
#[event]
pub struct Graduated { pub mint: Pubkey, pub sol_reserve: u64, pub token_reserve: u64 }

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be positive")] ZeroAmount,
    #[msg("Slippage exceeded")] Slippage,
    #[msg("Arithmetic overflow")] MathOverflow,
    #[msg("Curve graduated")] Graduated,
    #[msg("Insufficient liquidity")] Liquidity,
    #[msg("Name too long")] NameTooLong,
    #[msg("Symbol too long")] SymbolTooLong,
    #[msg("URI too long")] UriTooLong,
    #[msg("Invalid curve configuration")] InvalidCurve,
}