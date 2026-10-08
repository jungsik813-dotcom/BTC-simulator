import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateValuationComparison, chartScale, type ComparisonInput } from './valuationComparison.ts';
import { defaultTamAssumptions, defaultTamAdoption, calculateTamYear } from './tam.ts';
import { defaultPowerLaw, calculatePowerLawYear } from './powerLaw.ts';
import { defaultOnchainSettings, parseOnchainInputs } from './onchainInput.ts';

function example():ComparisonInput {const settings=defaultOnchainSettings();return {startYear:2026,endYear:2045,btcPrice:100000000,btcReturn:10,priceModel:'cagr',tam:structuredClone(defaultTamAssumptions),power:{...defaultPowerLaw},onchain:parseOnchainInputs(settings.inputs,settings.marketCapSource),supplyMode:'cointime'};}
test('2026~2045 모든 모델을 동일한 연도에 정렬한다',()=>{
  const result=calculateValuationComparison(example());assert.deepEqual(result.errors,[]);assert.equal(result.rows.length,20);
  for(const [i,row] of result.rows.entries()){assert.equal(row.year,2026+i);assert.ok(row.supply<=21000000);for(const key of ['cagr','tam','support','fair','resistance','costBasis'] as const)assert.ok(row[key]!==null&&Number.isFinite(row[key]));assert.equal(row.tam,calculateTamYear(row.year,2026,defaultTamAssumptions,{initialPrice:1e8,adoption:defaultTamAdoption}).btcPrice);assert.equal(row.fair,calculatePowerLawYear(row.year,defaultPowerLaw).fair);}
});
test('선택한 가격 모델은 시가총액과 비율을 바꾸며 가격 모델을 혼합하지 않는다',()=>{
  const a=example();const cagr=calculateValuationComparison(a).rows[9],tam=calculateValuationComparison({...a,priceModel:'tam'}).rows[9];
  assert.equal(cagr.selectedMarketCap,cagr.cagr!*cagr.supply);assert.equal(tam.selectedMarketCap,tam.tam!*tam.supply);
  assert.equal(cagr.tam,tam.tam);assert.equal(cagr.fair,tam.fair);assert.equal(cagr.costBasis,tam.costBasis);
  assert.equal(cagr.onchain!.classicMvrv,(cagr.selectedMarketCap!/a.power!.usdKrw)/a.onchain!.realizedCapUsd);
  assert.equal(tam.onchain!.aviv,(tam.tam!/a.power!.usdKrw)/tam.onchain!.trueMarketMeanUsd!);
});
test('원가 총액은 고정하고 발행 공급량과 미이동 비율을 적용한다',()=>{
  const a=example();const rows=calculateValuationComparison({...a,supplyMode:'exclude7'}).rows;
  for(const row of rows){const onchain=row.onchain!;assert.equal(onchain.investorCapUsd,a.onchain!.realizedCapUsd-a.onchain!.thermocapUsd);assert.equal(onchain.realizedPriceUsd,a.onchain!.realizedCapUsd/row.supply);assert.ok(Math.abs(onchain.comparisonSupply/row.supply-0.85)<1e-12);assert.equal(row.costBasis,onchain.costBasisUsd!*a.power!.usdKrw);}
  assert.ok(rows.at(-1)!.costBasis!<rows[0].costBasis!);
});
test('0 Active Supply는 결측으로 표시하며 다른 모델을 유지한다',()=>{
  const a=example();a.onchain!.liveliness=0;const result=calculateValuationComparison(a);
  assert.equal(result.rows[0].costBasis,null);assert.equal(result.rows[0].onchain!.aviv,null);assert.ok(result.rows[0].tam!==null);
});
test('잘못된 모델 하나가 다른 모델 비교를 막지 않는다',()=>{
  const a=example();a.power!.exponent=0;const result=calculateValuationComparison(a);
  assert.ok(result.errors.length>0);assert.equal(result.rows[0].fair,null);assert.ok(result.rows[0].cagr!==null);assert.ok(result.rows[0].tam!==null);
  assert.throws(()=>calculateValuationComparison({...example(),startYear:2023}));
});
test('로그 축은 0을 제외하고 같은 비율 간격을 동일하게 표시한다',()=>{
  const scale=chartScale([0,10,100,1000,null],true)!;
  assert.equal(scale.position(0),null);assert.equal(scale.position(10),0);assert.equal(scale.position(100),0.5);assert.equal(scale.position(1000),1);
  assert.equal(scale.tick(0.5),100);assert.equal(chartScale([0,null],true),null);
  assert.ok(Number.isFinite(chartScale([100],true)!.position(100)!));
  assert.equal(chartScale([0,100],false)!.position(0),0);
});
