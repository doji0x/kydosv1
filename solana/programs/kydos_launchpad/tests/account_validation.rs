//! Policy-independent checks of the existing account ABI, not approval of economics.
use anchor_lang::{prelude::*, AccountSerialize};
use anchor_spl::token::{Mint, spl_token};
use anchor_lang::solana_program::program_pack::Pack;
use kydos_launchpad::{Curve, FeePolicy, Trade, TradeBumps, TREASURY, FEE_POLICY_VERSION, fees,
    CURVE_TOKEN_ALLOCATION, LIQUIDITY_TOKEN_ALLOCATION, VIRTUAL_TOKEN_RESERVES,
    VIRTUAL_SOL_RESERVES, TOTAL_SUPPLY, GRADUATION_TARGET};
use std::collections::BTreeSet;

#[test]
fn unsigned_accounts_cannot_be_signers() {
    let key = Pubkey::new_unique();
    let owner = anchor_lang::system_program::ID;
    let mut lamports = 1;
    let mut data = [];
    let info = AccountInfo::new(&key, false, true, &mut lamports, &mut data, &owner, false, 0);
    let error = Signer::try_from(&info).err().expect("unsigned account accepted");
    let expected: anchor_lang::error::Error = anchor_lang::error::ErrorCode::AccountNotSigner.into();
    assert_eq!(error, expected);
}

#[test]
fn mint_data_cannot_substitute_for_token_program_ownership() {
    let key = Pubkey::new_unique();
    let owner = Pubkey::new_unique();
    let mut lamports = 1;
    let mut data = [0; 82];
    let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, &owner, false, 0);
    let error = Account::<Mint>::try_from(&info).err().expect("foreign-owned mint accepted");
    // Compare numeric codes: Anchor attaches the actual and expected owners.
    match error {
        anchor_lang::error::Error::AnchorError(error) => assert_eq!(
            error.error_code_number,
            anchor_lang::error::ErrorCode::AccountOwnedByWrongProgram as u32
        ),
        other => panic!("unexpected error: {other:?}"),
    }
}

#[test]
fn maximum_existing_string_fields_fit_the_allocated_curve_account() {
    // Fixture values exercise serialization only; they are not token policies.
    let curve = Curve {
        creator: Pubkey::new_unique(), mint: Pubkey::new_unique(), bump: 255,
        decimals: 6, name: "n".repeat(32), symbol: "s".repeat(10),
        metadata_uri: "u".repeat(200), total_supply: 0,
        curve_token_allocation: 0, liquidity_token_allocation: 0,
        virtual_token_reserves: 0, virtual_sol_reserves: 0,
        real_token_reserves: 0, real_sol_reserves: 0,
        graduation_target: 0, graduated: false,
    };
    let mut bytes = Vec::new();
    curve.try_serialize(&mut bytes).unwrap();
    assert_eq!(bytes.len(), Curve::SPACE);
}

// Host-only Anchor account validation: no validator, token creation or transfers.
fn fixture_account(key: Pubkey, owner: Pubkey, data: Vec<u8>, signer: bool, writable: bool, executable: bool) -> AccountInfo<'static> {
    AccountInfo::new(Box::leak(Box::new(key)), signer, writable,
        Box::leak(Box::new(10_000_000)), Box::leak(data.into_boxed_slice()),
        Box::leak(Box::new(owner)), executable, 0)
}

fn trade_accounts(change: &str) -> Vec<AccountInfo<'static>> {
    let mint = Pubkey::new_unique();
    let trader = if change == "treasury_trader" { TREASURY } else { Pubkey::new_unique() };
    let (curve, bump) = Pubkey::find_program_address(&[b"curve", mint.as_ref()], &kydos_launchpad::ID);
    let (vault, _) = Pubkey::find_program_address(&[b"vault", mint.as_ref()], &kydos_launchpad::ID);
    let (policy, policy_bump) = Pubkey::find_program_address(&[b"fee_policy", curve.as_ref()], &kydos_launchpad::ID);
    let curve_state = Curve {
        creator: trader, mint, bump, decimals: 6, name: "Test".into(), symbol: "T".into(), metadata_uri: "ipfs://test".into(),
        total_supply: TOTAL_SUPPLY, curve_token_allocation: CURVE_TOKEN_ALLOCATION, liquidity_token_allocation: LIQUIDITY_TOKEN_ALLOCATION,
        virtual_token_reserves: VIRTUAL_TOKEN_RESERVES, virtual_sol_reserves: VIRTUAL_SOL_RESERVES,
        real_token_reserves: CURVE_TOKEN_ALLOCATION, real_sol_reserves: 0, graduation_target: GRADUATION_TARGET, graduated: false,
    };
    let mut curve_data = Vec::new(); curve_state.try_serialize(&mut curve_data).unwrap(); curve_data.resize(Curve::SPACE, 0);
    let policy_state = FeePolicy {
        version: if change == "version" { 2 } else { FEE_POLICY_VERSION },
        bump: if change == "bump" { policy_bump.wrapping_add(1) } else { policy_bump },
        curve: if change == "curve" { mint } else { curve },
        treasury: if change == "policy_treasury" || change == "both_treasuries" { mint } else { TREASURY },
        trading_fee_bps: if change == "bps" { 0 } else { fees::TRADING_FEE_BPS },
    };
    let mut policy_data = Vec::new(); policy_state.try_serialize(&mut policy_data).unwrap();
    assert_eq!(policy_data.len(), FeePolicy::SPACE);
    if change == "missing" { policy_data.clear(); }
    let mut mint_data = vec![0; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack(spl_token::state::Mint { supply: TOTAL_SUPPLY, decimals: 6, is_initialized: true, ..Default::default() }, &mut mint_data).unwrap();
    let token_data = |owner, amount| {
        let mut data = vec![0; spl_token::state::Account::LEN];
        spl_token::state::Account::pack(spl_token::state::Account { mint, owner, amount,
            state: spl_token::state::AccountState::Initialized, ..Default::default() }, &mut data).unwrap(); data
    };
    let system = anchor_lang::system_program::ID;
    let trader_info = fixture_account(trader, system, vec![], true, true, false);
    let treasury_info = if change == "treasury_trader" { trader_info.clone() } else {
        fixture_account(if change == "recipient" || change == "both_treasuries" { mint } else { TREASURY },
            if change == "treasury_owner" { kydos_launchpad::ID } else { system }, vec![], false, true, false)
    };
    vec![
        trader_info,
        fixture_account(curve, kydos_launchpad::ID, curve_data, false, true, false),
        fixture_account(if change == "address" { mint } else { policy },
            if change == "owner" || change == "missing" { system } else { kydos_launchpad::ID }, policy_data, false, false, false),
        treasury_info,
        fixture_account(mint, spl_token::ID, mint_data, false, false, false),
        fixture_account(vault, spl_token::ID, token_data(curve, TOTAL_SUPPLY), false, true, false),
        fixture_account(Pubkey::new_unique(), spl_token::ID, token_data(trader, 0), false, true, false),
        fixture_account(spl_token::ID, system, vec![], false, false, true),
        fixture_account(system, system, vec![], false, false, true),
    ]
}

#[test]
fn trade_context_accepts_only_the_bound_policy_and_fixed_treasury() {
    for valid in ["valid", "treasury_trader"] {
        let mut accounts: &'static [AccountInfo<'static>] = Box::leak(trade_accounts(valid).into_boxed_slice());
        assert!(Trade::try_accounts(&kydos_launchpad::ID, &mut accounts, &[],
            &mut TradeBumps::default(), &mut BTreeSet::new()).is_ok(), "valid context: {valid}");
    }
    for invalid in ["version", "bps", "curve", "policy_treasury", "recipient", "both_treasuries", "bump", "address", "owner", "missing", "treasury_owner"] {
        let mut accounts: &'static [AccountInfo<'static>] = Box::leak(trade_accounts(invalid).into_boxed_slice());
        assert!(Trade::try_accounts(&kydos_launchpad::ID, &mut accounts, &[],
            &mut TradeBumps::default(), &mut BTreeSet::new()).is_err(), "accepted invalid {invalid}");
    }
}

#[test]
fn sell_slippage_checks_wallet_proceeds_before_any_transfer() {
    let mut infos: &'static [AccountInfo<'static>] = Box::leak(trade_accounts("valid").into_boxed_slice());
    let mut bumps = TradeBumps::default();
    let mut accounts = Trade::try_accounts(&kydos_launchpad::ID, &mut infos, &[], &mut bumps, &mut BTreeSet::new()).unwrap();
    let buy = fees::quote_buy(0, CURVE_TOKEN_ALLOCATION, 1_000_000_000).unwrap();
    accounts.curve.real_sol_reserves = buy.net_sol;
    accounts.curve.real_token_reserves = CURVE_TOKEN_ALLOCATION - buy.tokens_out;
    let sell = fees::quote_sell(buy.net_sol, accounts.curve.real_token_reserves, buy.tokens_out).unwrap();
    assert!(sell.net_sol < sell.gross_sol);
    let before = accounts.curve.to_account_info().lamports();
    let error = kydos_launchpad::kydos_launchpad::sell(
        Context::new(&kydos_launchpad::ID, &mut accounts, &[], bumps), buy.tokens_out, sell.gross_sol,
    ).unwrap_err();
    match error {
        anchor_lang::error::Error::AnchorError(error) => assert_eq!(error.error_code_number, 6001),
        other => panic!("expected net-output slippage rejection, got {other:?}"),
    }
    assert_eq!(accounts.curve.to_account_info().lamports(), before);
}
