import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFeeSettlement, SETTLEMENT_POLICY_VERSION } from '../../src/lib/solana/settlement.js';

const zero = { baseBefore: 0n, baseAfter: 0n, quoteBefore: 0n, quoteAfter: 0n, quoteDust: 0n };
const max = (1n << 64n) - 1n;
const fixture = readFileSync(new URL('./fixtures/settlement.csv', import.meta.url), 'utf8');
for (const line of fixture.trim().split('\n').slice(1)) {
  const [name, ...fields] = line.split(',');
  test(`shared Rust/JS settlement vector: ${name}`, () => {
    assert.equal(fields.length, 9);
    const [baseBefore, baseAfter, quoteBefore, quoteAfter, quoteDust, baseToBurn,
      creatorQuote, kydosQuote, nextQuoteDust] = fields.map(BigInt);
    const plan = planFeeSettlement({ baseBefore, baseAfter, quoteBefore, quoteAfter, quoteDust });
    assert.deepEqual(plan, {
      baseFeesReceived: baseToBurn, baseToBurn, quoteFeesReceived: quoteAfter - quoteBefore,
      creatorQuote, kydosQuote, nextQuoteDust,
    });
    assert.equal(plan.creatorQuote, plan.kydosQuote);
    assert.equal(plan.quoteFeesReceived + quoteDust, creatorQuote + kydosQuote + nextQuoteDust);
    assert.equal(baseAfter - plan.baseToBurn, baseBefore);
    assert.equal(quoteAfter - creatorQuote - kydosQuote, quoteBefore - quoteDust + nextQuoteDust);
  });
}

test('policy is versioned and results are immutable', () => {
  assert.equal(SETTLEMENT_POLICY_VERSION, 1);
  assert.ok(Object.isFrozen(planFeeSettlement(zero)));
});

test('rejects numbers, missing amounts, negatives and values outside u64', () => {
  for (const key of Object.keys(zero)) {
    for (const value of [0, '0', null, undefined, -1n, max + 1n, NaN]) {
      assert.throws(() => planFeeSettlement({ ...zero, [key]: value }), /bigint|u64/);
    }
  }
});

test('rejects invalid or unfunded persisted quote dust', () => {
  assert.throws(() => planFeeSettlement({ ...zero, quoteDust: 2n }), /zero or one/);
  assert.throws(() => planFeeSettlement({ ...zero, quoteAfter: 1n, quoteDust: 1n }), /not funded/);
});

test('rejects decreasing balances instead of spending unrelated funds', () => {
  assert.throws(() => planFeeSettlement({ ...zero, baseBefore: 1n }), /decreased/);
  assert.throws(() => planFeeSettlement({ ...zero, quoteBefore: 1n }), /decreased/);
});

test('one-unit claims cannot bias the creator or treasury share', () => {
  let dust = 0n;
  let creator = 0n;
  let kydos = 0n;
  for (let i = 1n; i <= 1001n; i += 1n) {
    const plan = planFeeSettlement({ ...zero, quoteBefore: dust, quoteAfter: dust + 1n, quoteDust: dust });
    creator += plan.creatorQuote;
    kydos += plan.kydosQuote;
    dust = plan.nextQuoteDust;
    assert.equal(creator, kydos);
    assert.equal(creator + kydos + dust, i);
  }
  assert.equal(creator, 500n);
  assert.equal(dust, 1n);
});

test('10,000 fragmented claims match one aggregate settlement and preserve donations', () => {
  let dust = 0n;
  let received = 0n;
  let creator = 0n;
  let kydos = 0n;
  for (let i = 0n; i < 10000n; i += 1n) {
    const claim = (i * 7919n) % 997n;
    const plan = planFeeSettlement({ baseBefore: 51n, baseAfter: 51n + i,
      quoteBefore: 100n + dust, quoteAfter: 100n + dust + claim, quoteDust: dust });
    assert.equal(100n + dust + claim - plan.creatorQuote - plan.kydosQuote, 100n + plan.nextQuoteDust);
    assert.equal(plan.baseToBurn, i);
    received += claim;
    creator += plan.creatorQuote;
    kydos += plan.kydosQuote;
    dust = plan.nextQuoteDust;
    assert.equal(creator, kydos);
    assert.equal(received, creator + kydos + dust);
  }
  const single = planFeeSettlement({ ...zero, quoteAfter: received });
  assert.equal(creator, single.creatorQuote);
  assert.equal(kydos, single.kydosQuote);
  assert.equal(dust, single.nextQuoteDust);
});

test('all supported dust states conserve balances near u64 maximum', () => {
  for (const dust of [0n, 1n]) {
    for (const before of [dust, 100n, max - 1n, max]) {
      for (const after of [before, max]) {
        const plan = planFeeSettlement({ ...zero, quoteBefore: before, quoteAfter: after, quoteDust: dust });
        assert.equal(plan.creatorQuote, plan.kydosQuote);
        assert.equal(after - plan.creatorQuote - plan.kydosQuote, before - dust + plan.nextQuoteDust);
        assert.ok(plan.nextQuoteDust <= 1n);
      }
    }
  }
});
