use ::kydos_launchpad::{
    meteora::*, migration::*, Curve, CURVE_TOKEN_ALLOCATION, DECIMALS, GRADUATION_TARGET, ID,
    LIQUIDITY_TOKEN_ALLOCATION, TOTAL_SUPPLY, TREASURY, VIRTUAL_SOL_RESERVES,
    VIRTUAL_TOKEN_RESERVES,
};
use anchor_lang::prelude::*;
use num_bigint::BigUint;
use serde_json::Value;
use std::str::FromStr;

fn fixture() -> Value {
    serde_json::from_str(include_str!("../../../tests/fixtures/meteora-v2.json")).unwrap()
}
fn key(v: &Value) -> Pubkey {
    Pubkey::from_str(v.as_str().unwrap()).unwrap()
}
fn number(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}
fn bytes(v: &Value) -> Vec<u8> {
    v.as_str()
        .unwrap()
        .as_bytes()
        .chunks_exact(2)
        .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap(), 16).unwrap())
        .collect()
}

#[test]
fn seed_math_matches_sdk_and_brackets_exact_root() {
    for row in fixture()["seeds"].as_array().unwrap() {
        let a = number(&row["tokenA"]) as u64;
        let b = number(&row["tokenB"]) as u64;
        let quote = seed_liquidity(a, b).unwrap();
        assert_eq!(
            quote,
            SeedLiquidity {
                sqrt_price: number(&row["sqrtPrice"]),
                liquidity: number(&row["liquidity"]),
                token_a_amount: number(&row["tokenAAmount"]) as u64,
                token_b_amount: number(&row["tokenBAmount"]) as u64,
                token_a_dust: number(&row["tokenADust"]) as u64,
                token_b_dust: number(&row["tokenBDust"]) as u64,
            },
            "{}",
            row["name"]
        );
        assert_eq!(quote.token_a_amount + quote.token_a_dust, a);
        assert_eq!(quote.token_b_amount + quote.token_b_dust, b);
        let high = BigUint::from(MAX_SQRT_PRICE);
        let low = BigUint::from(MIN_SQRT_PRICE);
        let sides = |s: BigUint| {
            (
                BigUint::from(a) * &high * &s * (&s - &low),
                (BigUint::from(b) << 128usize) * (&high - &s),
            )
        };
        let (lhs, rhs) = sides(BigUint::from(quote.sqrt_price));
        assert!(lhs <= rhs);
        let (lhs, rhs) = sides(BigUint::from(quote.sqrt_price + 1));
        assert!(lhs > rhs);
    }
    assert_eq!(seed_liquidity(0, 1), Err(MigrationError::InvalidAmount));
    assert_eq!(seed_liquidity(1, 0), Err(MigrationError::InvalidAmount));
    assert_eq!(
        seed_liquidity(u64::MAX, u64::MAX),
        Err(MigrationError::MathBounds)
    );
}

#[test]
fn addresses_and_initialize_bytes_and_metas_match_sdk() {
    let fixture = fixture();
    assert_eq!(fixture["schemaVersion"], 2);
    assert_eq!(fixture["feePolicy"]["baseFeeBps"], BASE_FEE_BPS);
    assert_eq!(fixture["feePolicy"]["collectFeeMode"], "BothToken");
    assert_eq!(fixture["feePolicy"]["expectedKydosFeeBps"], 80);
    assert_eq!(fixture["feePolicy"]["extraMigrationFeeBps"], 0);
    assert_eq!(fixture["feePolicy"]["lockPolicy"], "permanent");
    assert_eq!(LOCK_POLICY_PERMANENT, 1);
    for row in fixture["addressCases"].as_array().unwrap() {
        let expected = &row["addresses"];
        let a = derive_addresses(
            &key(&row["launchpad"]),
            &key(&expected["mint"]),
            &key(&expected["config"]),
        )
        .unwrap();
        let actual = [
            ("mint", a.mint),
            ("config", a.config),
            ("curve", a.curve),
            ("receipt", a.receipt),
            ("payer", a.payer),
            ("poolCreatorAuthority", a.pool_creator_authority),
            ("positionOwner", a.position_owner),
            ("positionNftMint", a.position_nft_mint),
            ("tokenAStaging", a.token_a_staging),
            ("tokenBStaging", a.token_b_staging),
            ("pool", a.pool),
            ("poolAuthority", a.pool_authority),
            ("position", a.position),
            ("positionNftAccount", a.position_nft_account),
            ("tokenAVault", a.token_a_vault),
            ("tokenBVault", a.token_b_vault),
            ("eventAuthority", a.event_authority),
        ];
        for (name, address) in actual {
            assert_eq!(address, key(&expected[name]), "{name}");
        }
        assert_eq!(config_address(number(&row["configIndex"]) as u64), a.config);
        let seed = fixture["seeds"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["name"] == row["initialize"]["seed"])
            .unwrap();
        let quote = seed_liquidity(
            number(&seed["tokenA"]) as u64,
            number(&seed["tokenB"]) as u64,
        )
        .unwrap();
        let ix = initialize_pool_instruction(&a, &quote);
        assert_eq!(ix.program_id, key(&row["initialize"]["programId"]));
        assert_eq!(ix.data, bytes(&row["initialize"]["dataHex"]));
        assert_eq!(ix.data.len(), 107);
        assert_eq!(ix.data[105], COLLECT_FEE_MODE_BOTH_TOKEN);
        let metas = row["initialize"]["accounts"].as_array().unwrap();
        assert_eq!(ix.accounts.len(), metas.len());
        for (actual, expected) in ix.accounts.iter().zip(metas) {
            assert_eq!(actual.pubkey, key(&expected["pubkey"]));
            assert_eq!(actual.is_signer, expected["isSigner"].as_bool().unwrap());
            assert_eq!(
                actual.is_writable,
                expected["isWritable"].as_bool().unwrap()
            );
        }
    }
    assert!(derive_addresses(&ID, &WSOL_MINT, &Pubkey::new_unique()).is_err());
}

#[test]
fn config_validation_rejects_unapproved_or_malformed_accounts() {
    for row in fixture()["addressCases"].as_array().unwrap() {
        let config = key(&row["addresses"]["config"]);
        let authority = key(&row["addresses"]["poolCreatorAuthority"]);
        let valid = bytes(&row["configDataHex"]);
        let validate =
            |address: Pubkey, owner: Pubkey, executable, mut data: Vec<u8>, approved, creator| {
                let mut lamports = 1;
                let account = AccountInfo::new(
                    &address,
                    false,
                    false,
                    &mut lamports,
                    &mut data,
                    &owner,
                    executable,
                    0,
                );
                validate_private_config(&account, &approved, &creator)
            };
        assert_eq!(
            validate(config, PROGRAM_ID, false, valid.clone(), config, authority).unwrap(),
            number(&row["configIndex"]) as u64
        );
        for (address, owner, executable, approved, creator) in [
            (WSOL_MINT, PROGRAM_ID, false, config, authority),
            (config, ID, false, config, authority),
            (config, PROGRAM_ID, true, config, authority),
            (config, PROGRAM_ID, false, WSOL_MINT, authority),
            (config, PROGRAM_ID, false, config, WSOL_MINT),
        ] {
            assert!(
                validate(address, owner, executable, valid.clone(), approved, creator).is_err()
            );
        }
        for offset in [0, 8, 40, 202, 208, 248] {
            let mut data = valid.clone();
            data[offset] ^= 1;
            assert!(validate(config, PROGRAM_ID, false, data, config, authority).is_err());
        }
        let mut public = valid.clone();
        public[40..72].fill(0);
        assert!(validate(config, PROGRAM_ID, false, public.clone(), config, authority).is_err());
        assert!(validate(config, PROGRAM_ID, false, public, config, Pubkey::default()).is_err());
        for len in [0, 7, 72, 327, 329] {
            let mut data = valid.clone();
            data.resize(len, 0);
            assert!(validate(config, PROGRAM_ID, false, data, config, authority).is_err());
        }
    }
}

fn completed_curve() -> Curve {
    Curve {
        creator: Pubkey::new_unique(),
        mint: Pubkey::new_unique(),
        bump: 0,
        decimals: DECIMALS,
        name: "Kydos".into(),
        symbol: "KYDO".into(),
        metadata_uri: "ipfs://fixture".into(),
        total_supply: TOTAL_SUPPLY,
        curve_token_allocation: CURVE_TOKEN_ALLOCATION,
        liquidity_token_allocation: LIQUIDITY_TOKEN_ALLOCATION,
        virtual_token_reserves: VIRTUAL_TOKEN_RESERVES,
        virtual_sol_reserves: VIRTUAL_SOL_RESERVES,
        real_token_reserves: 0,
        real_sol_reserves: GRADUATION_TARGET,
        graduation_target: GRADUATION_TARGET,
        graduated: true,
    }
}

#[test]
fn reserve_preflight_preserves_rent_and_excludes_donations_and_virtual_sol() {
    let mut curve = completed_curve();
    let rent = 4_000_000;
    let balance = curve.real_sol_reserves + rent;
    let quote = seed_completed_curve(&curve, balance, rent, LIQUIDITY_TOKEN_ALLOCATION).unwrap();
    assert_eq!(
        quote.token_b_amount + quote.token_b_dust,
        curve.real_sol_reserves
    );
    assert_eq!(
        seed_completed_curve(
            &curve,
            balance + 100_000_000_000,
            rent,
            LIQUIDITY_TOKEN_ALLOCATION + 100
        )
        .unwrap(),
        quote
    );
    for (lamports, tokens) in [
        (balance - 1, LIQUIDITY_TOKEN_ALLOCATION),
        (rent - 1, LIQUIDITY_TOKEN_ALLOCATION),
        (balance, LIQUIDITY_TOKEN_ALLOCATION - 1),
    ] {
        assert_eq!(
            seed_completed_curve(&curve, lamports, rent, tokens),
            Err(MigrationError::InsufficientCustody)
        );
    }
    curve.real_sol_reserves += 1; // Actual path-dependent proceeds, not the indicative target.
    assert_ne!(
        seed_completed_curve(&curve, balance + 1, rent, LIQUIDITY_TOKEN_ALLOCATION).unwrap(),
        quote
    );
    curve.real_token_reserves = 1;
    curve.graduated = false;
    assert_eq!(
        seed_completed_curve(&curve, balance + 1, rent, LIQUIDITY_TOKEN_ALLOCATION),
        Err(MigrationError::NotComplete)
    );
    curve.graduated = true;
    assert_eq!(
        seed_completed_curve(&curve, balance + 1, rent, LIQUIDITY_TOKEN_ALLOCATION),
        Err(MigrationError::UnsupportedCurve)
    );
    curve = completed_curve();
    curve.virtual_sol_reserves += 1;
    assert_eq!(
        seed_completed_curve(&curve, balance, rent, LIQUIDITY_TOKEN_ALLOCATION),
        Err(MigrationError::UnsupportedCurve)
    );
}

#[test]
fn proposed_receipt_serialization_has_exact_size_and_preserves_bindings() {
    let a = derive_addresses(&ID, &Pubkey::new_unique(), &config_address(1)).unwrap();
    let quote = seed_liquidity(LIQUIDITY_TOKEN_ALLOCATION, GRADUATION_TARGET).unwrap();
    let receipt = MigrationReceiptV1 {
        version: MigrationReceiptV1::VERSION,
        bump: 255,
        curve: a.curve,
        config: a.config,
        pool: a.pool,
        position: a.position,
        position_nft_mint: a.position_nft_mint,
        position_owner: a.position_owner,
        treasury: TREASURY,
        token_a_mint: a.mint,
        token_a_budget: LIQUIDITY_TOKEN_ALLOCATION,
        token_b_budget: GRADUATION_TARGET,
        token_a_deposited: quote.token_a_amount,
        token_b_deposited: quote.token_b_amount,
        token_a_dust: quote.token_a_dust,
        token_b_dust: quote.token_b_dust,
        sqrt_price: quote.sqrt_price,
        liquidity: quote.liquidity,
        completed_slot: 123,
        lock_policy: 0,
    };
    let bytes = receipt.try_to_vec().unwrap();
    assert_eq!(bytes.len(), MigrationReceiptV1::BODY_LEN);
    assert_eq!(MigrationReceiptV1::ACCOUNT_LEN, 355);
    assert_eq!(MigrationReceiptV1::try_from_slice(&bytes).unwrap(), receipt);
}
