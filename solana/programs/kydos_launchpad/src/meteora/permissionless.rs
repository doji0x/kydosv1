//! Config-free DAMM v2 CPI preparation, NOT an executable migration handler.
//! See docs/permissionless-migration.md for the unresolved collision/liveness gate.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::system_program;
use crate::migration::{seed_liquidity, SeedLiquidity, MAX_SQRT_PRICE, MIN_SQRT_PRICE};
use super::{PROGRAM_ID, WSOL_MINT, BASE_FEE_NUMERATOR, COLLECT_FEE_MODE_BOTH_TOKEN,
    RECEIPT_SEED, PAYER_SEED, POSITION_OWNER_SEED, POSITION_MINT_SEED, STAGING_SEED};

pub const INITIALIZE_CUSTOMIZABLE_DISCRIMINATOR: [u8; 8] = [20, 161, 241, 24, 189, 221, 180, 2];
pub const PERMANENT_LOCK_DISCRIMINATOR: [u8; 8] = [165, 176, 125, 6, 231, 171, 186, 213];

#[derive(Debug, PartialEq, Eq)]
pub enum PermissionlessError {
    SameMint,
    InvalidSeed,
    InvalidDestination,
    WrongDestinationCount,
}

#[derive(Debug)]
pub struct PermissionlessAddresses {
    pub mint: Pubkey,
    pub curve: Pubkey,
    pub receipt: Pubkey,
    pub payer: Pubkey,
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

pub fn derive_addresses(launchpad: &Pubkey, mint: &Pubkey)
    -> std::result::Result<PermissionlessAddresses, PermissionlessError>
{
    if *mint == WSOL_MINT { return Err(PermissionlessError::SameMint); }
    let local = |s: &[&[u8]]| Pubkey::find_program_address(s, launchpad).0;
    let damm = |s: &[&[u8]]| Pubkey::find_program_address(s, &PROGRAM_ID).0;
    let curve = local(&[b"curve", mint.as_ref()]);
    let nft = local(&[POSITION_MINT_SEED, curve.as_ref()]);
    let (first, second) = if mint.to_bytes() > WSOL_MINT.to_bytes() {
        (mint, &WSOL_MINT)
    } else { (&WSOL_MINT, mint) };
    // No config or creator namespace. Anyone holding both assets can occupy it.
    let pool = damm(&[b"cpool", first.as_ref(), second.as_ref()]);
    Ok(PermissionlessAddresses {
        mint: *mint, curve,
        receipt: local(&[RECEIPT_SEED, curve.as_ref()]),
        payer: local(&[PAYER_SEED, curve.as_ref()]),
        position_owner: local(&[POSITION_OWNER_SEED, curve.as_ref()]),
        position_nft_mint: nft,
        token_a_staging: local(&[STAGING_SEED, curve.as_ref(), mint.as_ref()]),
        token_b_staging: local(&[STAGING_SEED, curve.as_ref(), WSOL_MINT.as_ref()]),
        pool, pool_authority: damm(&[b"pool_authority"]),
        position: damm(&[b"position", nft.as_ref()]),
        position_nft_account: damm(&[b"position_nft_account", nft.as_ref()]),
        token_a_vault: damm(&[b"token_vault", mint.as_ref(), pool.as_ref()]),
        token_b_vault: damm(&[b"token_vault", WSOL_MINT.as_ref(), pool.as_ref()]),
        event_authority: damm(&[b"__event_authority"]),
    })
}

#[derive(Debug)]
pub struct PreparedPool {
    pub addresses: PermissionlessAddresses,
    pub seed: SeedLiquidity,
    pub initialize: Instruction,
    pub permanent_lock: Instruction,
}

/// Caller must obtain budgets from an authenticated, completed curve, not a wallet
/// balance. This function only builds two CPIs; submitting them as ordinary wallet
/// instructions cannot sign the launchpad PDAs. No RPC or fund movement occurs.
pub fn prepare_pool(launchpad: &Pubkey, mint: &Pubkey, token_a_budget: u64, token_b_budget: u64)
    -> std::result::Result<PreparedPool, PermissionlessError>
{
    let a = derive_addresses(launchpad, mint)?;
    let seed = seed_liquidity(token_a_budget, token_b_budget)
        .map_err(|_| PermissionlessError::InvalidSeed)?;
    let mut data = INITIALIZE_CUSTOMIZABLE_DISCRIMINATOR.to_vec();
    data.extend_from_slice(&BASE_FEE_NUMERATOR.to_le_bytes());
    data.extend_from_slice(&[0; 19]); // fixed time-scheduler payload remainder
    data.extend_from_slice(&[0; 4]); // zero compounding/padding, no dynamic fee
    data.extend_from_slice(&MIN_SQRT_PRICE.to_le_bytes());
    data.extend_from_slice(&MAX_SQRT_PRICE.to_le_bytes());
    data.push(0); // no AlphaVault
    data.extend_from_slice(&seed.liquidity.to_le_bytes());
    data.extend_from_slice(&seed.sqrt_price.to_le_bytes());
    data.extend_from_slice(&[1, COLLECT_FEE_MODE_BOTH_TOKEN, 0]);
    let ro = |key| AccountMeta::new_readonly(key, false);
    let rw = |key| AccountMeta::new(key, false);
    let initialize = Instruction { program_id: PROGRAM_ID, data, accounts: vec![
        ro(a.position_owner), AccountMeta::new(a.position_nft_mint, true),
        rw(a.position_nft_account), AccountMeta::new(a.payer, true),
        ro(a.pool_authority), rw(a.pool), rw(a.position), ro(a.mint), ro(WSOL_MINT),
        rw(a.token_a_vault), rw(a.token_b_vault), rw(a.token_a_staging), rw(a.token_b_staging),
        ro(anchor_spl::token::ID), ro(anchor_spl::token::ID), ro(anchor_spl::token_2022::ID),
        ro(system_program::ID), ro(a.event_authority), ro(PROGRAM_ID),
    ] };
    let mut lock_data = PERMANENT_LOCK_DISCRIMINATOR.to_vec();
    // Lock the ENTIRE initial position, never a caller-selected fraction.
    lock_data.extend_from_slice(&seed.liquidity.to_le_bytes());
    let permanent_lock = Instruction { program_id: PROGRAM_ID, data: lock_data, accounts: vec![
        rw(a.pool), rw(a.position), ro(a.position_nft_account),
        AccountMeta::new_readonly(a.position_owner, true), ro(a.event_authority), ro(PROGRAM_ID),
    ] };
    Ok(PreparedPool { addresses: a, seed, initialize, permanent_lock })
}

/// Reject occupied or substituted destination accounts. Prefunded, empty system
/// accounts remain candidates; actual prefunded creation still needs runtime tests.
/// This check does NOT validate reserves, program binaries, mint state or receipts.
pub fn validate_fresh_destination(account: &AccountInfo, expected: &Pubkey)
    -> std::result::Result<(), PermissionlessError>
{
    if account.key != expected || account.owner != &system_program::ID
        || account.executable || !account.is_writable
    { return Err(PermissionlessError::InvalidDestination); }
    let data = account.try_borrow_data().map_err(|_| PermissionlessError::InvalidDestination)?;
    if !data.is_empty() { return Err(PermissionlessError::InvalidDestination); }
    Ok(())
}

impl PermissionlessAddresses {
    /// Order: receipt, pool, position, NFT mint, NFT token account, A vault, B vault.
    /// Existing receipt replay is deliberately NOT accepted in this fresh-only path.
    pub fn validate_fresh_destinations(&self, accounts: &[AccountInfo])
        -> std::result::Result<(), PermissionlessError>
    {
        let expected = [self.receipt, self.pool, self.position, self.position_nft_mint,
            self.position_nft_account, self.token_a_vault, self.token_b_vault];
        if accounts.len() != expected.len() { return Err(PermissionlessError::WrongDestinationCount); }
        for (account, key) in accounts.iter().zip(expected.iter()) {
            validate_fresh_destination(account, key)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    fn key(v: &Value) -> Pubkey { v.as_str().unwrap().parse().unwrap() }
    fn check_ix(ix: &Instruction, expected: &Value) {
        assert_eq!(ix.program_id, key(&expected["programId"]));
        let hex: String = ix.data.iter().map(|b| format!("{:02x}", b)).collect();
        assert_eq!(hex, expected["dataHex"].as_str().unwrap());
        let accounts = expected["accounts"].as_array().unwrap();
        assert_eq!(ix.accounts.len(), accounts.len());
        for (actual, wanted) in ix.accounts.iter().zip(accounts) {
            assert_eq!(actual.pubkey, key(&wanted["pubkey"]));
            assert_eq!(actual.is_signer, wanted["isSigner"].as_bool().unwrap());
            assert_eq!(actual.is_writable, wanted["isWritable"].as_bool().unwrap());
        }
    }
    #[test]
    fn shared_source_vectors_for_both_mint_orders() {
        let f: Value = serde_json::from_str(include_str!("../../../../tests/fixtures/meteora-permissionless.json")).unwrap();
        for c in f["cases"].as_array().unwrap() {
            let expected = &c["addresses"];
            let plan = prepare_pool(&key(&c["launchpad"]), &key(&expected["mint"]),
                c["tokenA"].as_str().unwrap().parse().unwrap(),
                c["tokenB"].as_str().unwrap().parse().unwrap()).unwrap();
            let a = &plan.addresses;
            for (name, actual) in [
                ("mint", a.mint), ("curve", a.curve), ("receipt", a.receipt), ("payer", a.payer),
                ("positionOwner", a.position_owner), ("positionNftMint", a.position_nft_mint),
                ("tokenAStaging", a.token_a_staging), ("tokenBStaging", a.token_b_staging),
                ("pool", a.pool), ("poolAuthority", a.pool_authority), ("position", a.position),
                ("positionNftAccount", a.position_nft_account), ("tokenAVault", a.token_a_vault),
                ("tokenBVault", a.token_b_vault), ("eventAuthority", a.event_authority),
            ] { assert_eq!(actual, key(&expected[name]), "{}", name); }
            assert_eq!(plan.seed.sqrt_price.to_string(), c["sqrtPrice"].as_str().unwrap());
            assert_eq!(plan.seed.liquidity.to_string(), c["liquidity"].as_str().unwrap());
            check_ix(&plan.initialize, &c["initialize"]);
            check_ix(&plan.permanent_lock, &c["permanentLock"]);
            assert_eq!(plan.initialize.accounts.len(), 19);
            assert_eq!(plan.permanent_lock.accounts.len(), 6);
        }
    }
    #[test]
    fn rejects_same_mint_and_zero_budgets() {
        let program = Pubkey::new_unique(); let mint = Pubkey::new_unique();
        assert!(matches!(prepare_pool(&program, &WSOL_MINT, 1, 1), Err(PermissionlessError::SameMint)));
        for (a, b) in [(0, 1), (1, 0), (0, 0)] {
            assert!(matches!(prepare_pool(&program, &mint, a, b), Err(PermissionlessError::InvalidSeed)));
        }
    }
    fn destination(owner: Pubkey, size: usize, executable: bool, writable: bool,
        same_key: bool, mut lamports: u64) -> std::result::Result<(), PermissionlessError>
    {
        let expected = Pubkey::new_unique();
        let actual = if same_key { expected } else { Pubkey::new_unique() };
        let mut data = vec![0u8; size];
        let account = AccountInfo::new(&actual, false, writable, &mut lamports, &mut data, &owner, executable, 0);
        validate_fresh_destination(&account, &expected)
    }
    #[test]
    fn rejects_occupied_wrong_owner_substituted_executable_and_readonly_destinations() {
        for args in [(PROGRAM_ID, 0, false, true, true), (system_program::ID, 1, false, true, true),
            (system_program::ID, 0, true, true, true), (system_program::ID, 0, false, false, true),
            (system_program::ID, 0, false, true, false)] {
            assert_eq!(destination(args.0,args.1,args.2,args.3,args.4,1), Err(PermissionlessError::InvalidDestination));
        }
    }
    #[test]
    fn empty_system_destinations_can_have_unsolicited_lamports() {
        for balance in [0, 1, u64::MAX] {
            assert_eq!(destination(system_program::ID, 0, false, true, true, balance), Ok(()));
        }
    }
    #[test]
    fn fresh_destination_set_rejects_account_reordering() {
        let a = derive_addresses(&Pubkey::new_unique(), &Pubkey::new_unique()).unwrap();
        let keys = [a.receipt, a.pool, a.position, a.position_nft_mint,
            a.position_nft_account, a.token_a_vault, a.token_b_vault];
        let owner = system_program::ID;
        let mut lamports = [1u64; 7];
        let mut data: [Vec<u8>; 7] = Default::default();
        let mut accounts: Vec<_> = keys.iter().zip(lamports.iter_mut()).zip(data.iter_mut())
            .map(|((key, balance), bytes)| AccountInfo::new(key, false, true, balance, bytes, &owner, false, 0))
            .collect();
        assert_eq!(a.validate_fresh_destinations(&accounts), Ok(()));
        accounts.swap(0, 1);
        assert_eq!(a.validate_fresh_destinations(&accounts), Err(PermissionlessError::InvalidDestination));
    }
    #[test]
    fn fresh_check_requires_all_seven_destinations() {
        let a = derive_addresses(&Pubkey::new_unique(), &Pubkey::new_unique()).unwrap();
        assert_eq!(a.validate_fresh_destinations(&[]), Err(PermissionlessError::WrongDestinationCount));
    }
}
