//! Integer-only launch-curve math. No RPC, signer, fees or token creation.
use crate::{CURVE_TOKEN_ALLOCATION, VIRTUAL_SOL_RESERVES, VIRTUAL_TOKEN_RESERVES};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError { ZeroAmount, Overflow, Complete, Liquidity, InvalidReserves }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote { pub accepted_sol: u64, pub tokens_out: u64 }

fn u64_checked(value: u128) -> Result<u64, MathError> {
    u64::try_from(value).map_err(|_| MathError::Overflow)
}

fn reserves(sol: u64, tokens: u64) -> Result<(u128, u128), MathError> {
    if tokens > CURVE_TOKEN_ALLOCATION { return Err(MathError::InvalidReserves); }
    let x = sol.checked_add(VIRTUAL_SOL_RESERVES).ok_or(MathError::Overflow)?;
    let y = tokens.checked_add(VIRTUAL_TOKEN_RESERVES - CURVE_TOKEN_ALLOCATION)
        .ok_or(MathError::Overflow)?;
    Ok((x as u128, y as u128))
}

pub fn quote_buy(sol: u64, tokens: u64, maximum_sol: u64) -> Result<BuyQuote, MathError> {
    if maximum_sol == 0 { return Err(MathError::ZeroAmount); }
    if tokens == 0 { return Err(MathError::Complete); }
    let (x, y) = reserves(sol, tokens)?;
    // Exact cost of the remaining real inventory, rounded UP. Excess input stays
    // in the wallet. No special price or giveaway when crossing a SOL threshold.
    let numerator = x.checked_mul(tokens as u128).ok_or(MathError::Overflow)?;
    let denominator = y - tokens as u128;
    let finish_cost = numerator / denominator + u128::from(numerator % denominator != 0);
    let (accepted_sol, tokens_out) = if maximum_sol as u128 >= finish_cost {
        (u64_checked(finish_cost)?, tokens)
    } else {
        let out = y.checked_mul(maximum_sol as u128).ok_or(MathError::Overflow)?
            / (x + maximum_sol as u128);
        (maximum_sol, u64_checked(out)?)
    };
    if tokens_out == 0 { return Err(MathError::ZeroAmount); }
    sol.checked_add(accepted_sol).ok_or(MathError::Overflow)?;
    Ok(BuyQuote { accepted_sol, tokens_out })
}

pub fn quote_sell(sol: u64, tokens: u64, tokens_in: u64) -> Result<u64, MathError> {
    if tokens_in == 0 { return Err(MathError::ZeroAmount); }
    if tokens == 0 { return Err(MathError::Complete); }
    let (x, y) = reserves(sol, tokens)?;
    if tokens_in > CURVE_TOKEN_ALLOCATION - tokens { return Err(MathError::InvalidReserves); }
    let out = u64_checked(x.checked_mul(tokens_in as u128).ok_or(MathError::Overflow)?
        / (y + tokens_in as u128))?;
    if out == 0 { return Err(MathError::ZeroAmount); }
    if out > sol { return Err(MathError::Liquidity); }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_vectors() {
        for line in include_str!("../../../tests/fixtures/curve-quotes.csv").lines().skip(1) {
            let fields: Vec<_> = line.split(',').collect();
            let numbers: Vec<u64> = fields[1..].iter().map(|n| n.parse().unwrap()).collect();
            let (sol, tokens, input, accepted, output) = (numbers[0], numbers[1], numbers[2], numbers[3], numbers[4]);
            match fields[0] {
                "buy" => assert_eq!(quote_buy(sol, tokens, input).unwrap(), BuyQuote { accepted_sol: accepted, tokens_out: output }),
                "sell" => assert_eq!(quote_sell(sol, tokens, input).unwrap(), output),
                _ => panic!("unknown vector"),
            }
        }
    }

    #[test]
    fn round_trips_never_create_sol_and_preserve_inventory() {
        for input in [1, 10, 1_000, 1_000_000, 1_000_000_000, 84_000_000_000] {
            let q = quote_buy(0, CURVE_TOKEN_ALLOCATION, input).unwrap();
            let remaining = CURVE_TOKEN_ALLOCATION - q.tokens_out;
            let (x, y) = reserves(q.accepted_sol, remaining).unwrap();
            assert!(x * y >= VIRTUAL_SOL_RESERVES as u128 * VIRTUAL_TOKEN_RESERVES as u128);
            match quote_sell(q.accepted_sol, remaining, q.tokens_out) {
                Ok(out) => assert!(out <= q.accepted_sol),
                Err(MathError::ZeroAmount) => {},
                result => panic!("unexpected: {result:?}"),
            }
        }
    }

    #[test]
    fn final_partial_fill_and_boundary_rejections() {
        let q = quote_buy(0, CURVE_TOKEN_ALLOCATION, 100_000_000_000).unwrap();
        assert_eq!(q.accepted_sol, 85_005_359_057);
        assert_eq!(q.tokens_out, CURVE_TOKEN_ALLOCATION);
        assert_eq!(quote_buy(q.accepted_sol, 0, 1), Err(MathError::Complete));
        assert_eq!(quote_sell(q.accepted_sol, 0, 1), Err(MathError::Complete));
        assert_eq!(quote_buy(0, CURVE_TOKEN_ALLOCATION, 0), Err(MathError::ZeroAmount));
        assert_eq!(quote_buy(u64::MAX, CURVE_TOKEN_ALLOCATION, 1), Err(MathError::Overflow));
        assert_eq!(quote_sell(0, CURVE_TOKEN_ALLOCATION, 1), Err(MathError::InvalidReserves));
        assert_eq!(quote_sell(1_000_000_000, 758_487_096_774_194, 1000), Err(MathError::ZeroAmount));
        assert_eq!(quote_buy(0, CURVE_TOKEN_ALLOCATION + 1, 1), Err(MathError::InvalidReserves));
        assert_eq!(quote_buy(85_000_000_000, 1, 1).unwrap().tokens_out, 1);
    }
}
