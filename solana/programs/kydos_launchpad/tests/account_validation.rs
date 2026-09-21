//! Policy-independent checks of the existing account ABI, not approval of economics.
use anchor_lang::{prelude::*, AccountSerialize};
use anchor_spl::token::Mint;
use kydos_launchpad::Curve;

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