//! Fee-inclusive quotes. Fees never become curve reserves.
use crate::math::{self, MathError};

pub const TRADING_FEE_BPS: u16 = 100;
const BPS: u128 = 10_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote {
    pub gross_sol: u64,
    pub fee_sol: u64,
    pub net_sol: u64,
    pub tokens_out: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellQuote {
    pub gross_sol: u64,
    pub fee_sol: u64,
    pub net_sol: u64,
}

fn ceil_div(n: u128, d: u128) -> u128 { n / d + u128::from(n % d != 0) }

pub fn trading_fee(gross_sol: u64) -> u64 {
    // A u64 multiplied by 100 fits u128; the resulting fee always fits u64.
    ceil_div(gross_sol as u128 * TRADING_FEE_BPS as u128, BPS) as u64
}

fn gross_for_net(net_sol: u64) -> Result<u64, MathError> {
    u64::try_from(ceil_div(net_sol as u128 * BPS, BPS - TRADING_FEE_BPS as u128))
        .map_err(|_| MathError::Overflow)
}

pub fn quote_buy(sol: u64, tokens: u64, maximum_gross: u64) -> Result<BuyQuote, MathError> {
    let net_budget = maximum_gross - trading_fee(maximum_gross);
    let curve = math::quote_buy(sol, tokens, net_budget)?;
    // At completion charge only the minimum gross needed for the last tokens.
    let gross_sol = if curve.tokens_out == tokens { gross_for_net(curve.accepted_sol)? } else { maximum_gross };
    if gross_sol > maximum_gross { return Err(MathError::Overflow); }
    Ok(BuyQuote { gross_sol, fee_sol: gross_sol - curve.accepted_sol,
        net_sol: curve.accepted_sol, tokens_out: curve.tokens_out })
}

pub fn quote_sell(sol: u64, tokens: u64, tokens_in: u64) -> Result<SellQuote, MathError> {
    let gross_sol = math::quote_sell(sol, tokens, tokens_in)?;
    let fee_sol = trading_fee(gross_sol);
    let net_sol = gross_sol - fee_sol;
    if net_sol == 0 { return Err(MathError::ZeroAmount); }
    Ok(SellQuote { gross_sol, fee_sol, net_sol })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CURVE_TOKEN_ALLOCATION, GRADUATION_TARGET};

    #[test]
    fn shared_fee_vectors() {
        for line in include_str!("../../../tests/fixtures/fee-quotes.csv").lines().skip(1) {
            let fields: Vec<_> = line.split(',').collect();
            let n: Vec<u64> = fields[1..].iter().map(|n| n.parse().unwrap()).collect();
            let (sol, tokens, input, gross, fee, net, output) = (n[0], n[1], n[2], n[3], n[4], n[5], n[6]);
            match fields[0] {
                "buy" => assert_eq!(quote_buy(sol, tokens, input).unwrap(),
                    BuyQuote { gross_sol: gross, fee_sol: fee, net_sol: net, tokens_out: output }),
                "sell" => {
                    assert_eq!(quote_sell(sol, tokens, input).unwrap(), SellQuote { gross_sol: gross, fee_sol: fee, net_sol: net });
                    assert_eq!(output, net);
                },
                _ => panic!("unknown vector"),
            }
        }
    }

    #[test]
    fn fee_rounding_and_inverse_are_minimal() {
        for net in (1..10_001).chain([GRADUATION_TARGET, u64::MAX / 2]) {
            let gross = gross_for_net(net).unwrap();
            assert_eq!(gross - trading_fee(gross), net);
            assert!(gross - 1 - trading_fee(gross - 1) < net);
        }
        assert_eq!(trading_fee(u64::MAX), 184_467_440_737_095_517);
        assert_eq!(gross_for_net(u64::MAX), Err(MathError::Overflow));
        for input in [0, 1] {
            assert_eq!(quote_buy(0, CURVE_TOKEN_ALLOCATION, input), Err(MathError::ZeroAmount));
        }
        assert_eq!(quote_buy(u64::MAX, CURVE_TOKEN_ALLOCATION, 100), Err(MathError::Overflow));
        // A gross output of one lamport cannot pay a positive net amount.
        assert_eq!(quote_sell(1, CURVE_TOKEN_ALLOCATION - 100_000, 35_767), Err(MathError::ZeroAmount));
    }

    #[test]
    fn round_trips_account_for_both_treasury_payments() {
        for input in [1_000, 1_000_000, 1_000_000_000, 84_000_000_000] {
            let buy = quote_buy(0, CURVE_TOKEN_ALLOCATION, input).unwrap();
            let sell = quote_sell(buy.net_sol, CURVE_TOKEN_ALLOCATION - buy.tokens_out, buy.tokens_out).unwrap();
            let reserves_left = buy.net_sol - sell.gross_sol;
            assert_eq!(input, buy.fee_sol + sell.fee_sol + sell.net_sol + reserves_left);
            assert!(sell.net_sol < input);
        }
        let final_buy = quote_buy(0, CURVE_TOKEN_ALLOCATION, u64::MAX).unwrap();
        assert_eq!(final_buy.net_sol, GRADUATION_TARGET);
        assert_eq!(final_buy.gross_sol, 85_863_999_048);
        assert_eq!(final_buy.fee_sol, 858_639_991);
    }
}
