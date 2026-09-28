//! Offline post-migration settlement arithmetic, not an executable instruction.
//! Amounts are raw SPL units from authenticated pre/post-claim account snapshots.
//! Persist quote_dust in protocol state; never accept it as caller authority.

pub const SETTLEMENT_POLICY_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettlementError {
    InvalidQuoteDust,
    QuoteDustNotFunded,
    BalanceDecreased,
    Overflow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SettlementPlan {
    pub base_fees_received: u64,
    pub base_to_burn: u64,
    pub quote_fees_received: u64,
    pub creator_quote: u64,
    pub kydos_quote: u64,
    pub next_quote_dust: u64,
}

/// Burn only newly claimed base; split net quote equally and retain odd dust.
/// No percentage is deducted again for Meteora: the claim is already net.
pub fn plan_fee_settlement(
    base_before: u64,
    base_after: u64,
    quote_before: u64,
    quote_after: u64,
    quote_dust: u64,
) -> Result<SettlementPlan, SettlementError> {
    if quote_dust > 1 {
        return Err(SettlementError::InvalidQuoteDust);
    }
    if quote_before < quote_dust {
        return Err(SettlementError::QuoteDustNotFunded);
    }
    let base_fees_received = base_after
        .checked_sub(base_before)
        .ok_or(SettlementError::BalanceDecreased)?;
    let quote_fees_received = quote_after
        .checked_sub(quote_before)
        .ok_or(SettlementError::BalanceDecreased)?;
    // Funded dust ensures the sum is <= quote_after, but keep arithmetic checked.
    let distributable = quote_fees_received
        .checked_add(quote_dust)
        .ok_or(SettlementError::Overflow)?;
    let each = distributable / 2;
    Ok(SettlementPlan {
        base_fees_received,
        base_to_burn: base_fees_received,
        quote_fees_received,
        creator_quote: each,
        kydos_quote: each,
        next_quote_dust: distributable % 2,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_settlement_vectors() {
        for line in include_str!("../../../../tests/fixtures/settlement.csv").lines().skip(1) {
            let fields: Vec<_> = line.split(',').collect();
            assert_eq!(fields.len(), 10);
            let n: Vec<u64> = fields[1..].iter().map(|s| s.parse().unwrap()).collect();
            let actual = plan_fee_settlement(n[0], n[1], n[2], n[3], n[4]).unwrap();
            assert_eq!(actual, SettlementPlan {
                base_fees_received: n[5], base_to_burn: n[5],
                quote_fees_received: n[3] - n[2],
                creator_quote: n[6], kydos_quote: n[7], next_quote_dust: n[8],
            }, "{}", fields[0]);
        }
    }

    #[test]
    fn rejects_invalid_balances_and_dust() {
        assert_eq!(plan_fee_settlement(0, 0, 2, 2, 2), Err(SettlementError::InvalidQuoteDust));
        assert_eq!(plan_fee_settlement(0, 0, 0, 1, 1), Err(SettlementError::QuoteDustNotFunded));
        assert_eq!(plan_fee_settlement(2, 1, 0, 0, 0), Err(SettlementError::BalanceDecreased));
        assert_eq!(plan_fee_settlement(0, 0, 2, 1, 0), Err(SettlementError::BalanceDecreased));
    }

    #[test]
    fn fragmented_claims_preserve_equal_payouts_and_conservation() {
        let mut dust = 0;
        let mut received = 0u64;
        let mut creator = 0u64;
        let mut kydos = 0u64;
        for i in 0..10_000u64 {
            let claim = (i * 7919) % 997;
            let plan = plan_fee_settlement(51, 51 + i, 100 + dust, 100 + dust + claim, dust).unwrap();
            assert_eq!(100 + dust + claim - plan.creator_quote - plan.kydos_quote,
                100 + plan.next_quote_dust);
            received += claim;
            creator += plan.creator_quote;
            kydos += plan.kydos_quote;
            dust = plan.next_quote_dust;
            assert_eq!(creator, kydos);
            assert_eq!(received, creator + kydos + dust);
            assert_eq!(plan.base_to_burn, i);
        }
        let single = plan_fee_settlement(0, 0, 0, received, 0).unwrap();
        assert_eq!(creator, single.creator_quote);
        assert_eq!(dust, single.next_quote_dust);
    }
}
