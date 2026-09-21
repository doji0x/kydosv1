import test from 'node:test';import assert from 'node:assert/strict';
const supply=1_000_000_000n*1_000_000n,virtual=21_250_000_000n,target=85_000_000_000n;const remaining=(virtual*supply)/(virtual+target);test('85 SOL leaves 200M tokens',()=>assert.equal(remaining,200_000_000n*1_000_000n));test('curve sells 80 percent',()=>assert.equal(supply-remaining,800_000_000n*1_000_000n));
