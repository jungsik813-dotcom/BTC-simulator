import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePowerLawRange, calculatePowerLawYear, daysSinceGenesis, defaultPowerLaw } from './powerLaw.ts';

test('Genesis 경과 일수는 UTC와 윤년을 정확히 반영한다',()=>{
  assert.equal(daysSinceGenesis(new Date('2009-01-04T00:00:00Z')),1);
  assert.equal(daysSinceGenesis(new Date('2009-01-04T09:00:00+09:00')),1);
  const before=daysSinceGenesis(new Date('2012-02-28T00:00:00Z'));
  const after=daysSinceGenesis(new Date('2012-03-01T00:00:00Z'));
  assert.equal(after-before,2);
  assert.throws(()=>daysSinceGenesis(new Date('2009-01-03T00:00:00Z')));
});
test('Price = A × 경과일수^β와 밴드 및 원화 환산을 적용한다',()=>{
  const result=calculatePowerLawYear(2010,{exponent:2,log10Intercept:1,supportMultiplier:0.5,resistanceMultiplier:3,usdKrw:1000});
  assert.equal(result.days,727);
  assert.ok(Math.abs(result.fairUsd-10*727**2)<1e-7);
  assert.equal(result.supportUsd,result.fairUsd*0.5);
  assert.equal(result.resistanceUsd,result.fairUsd*3);
  assert.equal(result.fair,result.fairUsd*1000);
  assert.equal(result.support,result.supportUsd*1000);
});
test('2026~2045의 모든 연도와 기본 밴드가 정상이다',()=>{
  const rows=calculatePowerLawRange(2026,2045,defaultPowerLaw);
  assert.deepEqual(rows.map(row=>row.year),Array.from({length:20},(_,i)=>2026+i));
  assert.ok(rows.every(row=>Object.values(row).every(Number.isFinite)&&row.support<=row.fair&&row.fair<=row.resistance));
  assert.ok(rows.at(-1)!.fair>rows[0].fair);
});
test('잘못된 계수와 계산 오버플로를 거부한다',()=>{
  for (const change of [{exponent:0},{log10Intercept:NaN},{supportMultiplier:0},{supportMultiplier:2},{resistanceMultiplier:0.5},{usdKrw:-1},{exponent:1000},{log10Intercept:-1000}]) {
    assert.throws(()=>calculatePowerLawYear(2026,{...defaultPowerLaw,...change}));
  }
  assert.throws(()=>calculatePowerLawRange(2026,2025,defaultPowerLaw));
});
