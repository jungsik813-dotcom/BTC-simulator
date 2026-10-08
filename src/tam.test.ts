import { test } from 'node:test';
import assert from 'node:assert/strict';
import { btcSupplyAtYear, calculateTamRange, calculateTamYear, defaultTamAssumptions, defaultTamAdoption } from './tam.ts';

test('TAM은 성장률, 경쟁 비율, 침투율을 각각 한 번 적용한다', () => {
  const assumptions = structuredClone(defaultTamAssumptions);
  for (const value of Object.values(assumptions)) Object.assign(value, { marketSizeTrillionKrw:0, growthRate:0, competingShare:0, penetration:0 });
  assumptions.gold = { marketSizeTrillionKrw:100, growthRate:10, competingShare:50, penetration:20 };
  const result = calculateTamYear(2027, 2026, assumptions,{initialPrice:1e5,adoption:{...defaultTamAdoption,targetYear:2027,midpointYear:2026.5}});
  assert.ok(Math.abs(result.totalMarket - 110_000_000_000_000) < 0.1);
  assert.ok(Math.abs(result.addressableMarket - 55_000_000_000_000) < 0.1);
  assert.ok(Math.abs(result.marketCap - 11_000_000_000_000) < 0.1);
  assert.equal(result.btcPrice, result.marketCap / result.btcSupply);
});

test('BTC 공급량은 증가하지만 2,100만 개를 넘지 않는다', () => {
  assert.ok(btcSupplyAtYear(2030) > btcSupplyAtYear(2026));
  assert.ok(btcSupplyAtYear(2200) <= 21_000_000);
});

test('연도별 TAM 결과에 누락이 없고 잘못된 비율을 거부한다', () => {
  const rows = calculateTamRange(2026, 2045, defaultTamAssumptions,{initialPrice:1e8,adoption:defaultTamAdoption});
  assert.equal(rows.length, 20);
  assert.ok(rows.every(row => Object.values(row).every(value => Array.isArray(value) || Number.isFinite(value))));
  const invalid = structuredClone(defaultTamAssumptions);
  invalid.bonds.penetration = 101;
  assert.throws(() => calculateTamYear(2026, 2026, invalid,{initialPrice:1e8,adoption:defaultTamAdoption}), /0~100%/);
});
