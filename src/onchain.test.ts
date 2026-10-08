import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOnchain, type OnchainSnapshot, supplyModes } from './onchain.ts';
import { parseOnchainInputs, defaultOnchainSettings } from './onchainInput.ts';

const example:OnchainSnapshot={marketCapUsd:2000,realizedCapUsd:1000,thermocapUsd:100,circulatingSupply:20,liveliness:0.6,spotPriceUsd:100,excluded5:4,excluded7:3,excluded10:2};
test('MVRV와 AVIV 및 원가 계산식을 구분한다',()=>{
  const r=calculateOnchain(example,'cointime');
  assert.equal(r.classicMvrv,2);assert.equal(r.realizedPrice,50);assert.equal(r.realizedPriceDifferencePct,-50);
  assert.equal(r.investorCap,900);assert.equal(r.activeSupply,12);assert.equal(r.trueMarketMean,75);assert.equal(r.aviv,4/3);
  assert.equal(r.comparisonCostBasis,r.trueMarketMean);assert.equal(r.comparisonRatio,r.aviv);
});
test('공급량 모드와 연령 제외는 한 번만 적용하고 공식 지표는 유지한다',()=>{
  const expected={classic:20,cointime:12,exclude5:16,exclude7:17,exclude10:18};
  for(const mode of supplyModes){const r=calculateOnchain(example,mode.key);assert.equal(r.comparisonSupply,expected[mode.key]);assert.equal(r.classicMvrv,2);assert.equal(r.trueMarketMean,75);assert.equal(r.aviv,4/3);assert.equal(r.comparisonCostBasis,900/expected[mode.key]);}
});
test('0 공급량과 0 Investor Cap은 나눗셈 오류 없이 계산 불가로 처리한다',()=>{
  const zeroActive=calculateOnchain({...example,liveliness:0},'cointime');assert.equal(zeroActive.activeSupply,0);assert.equal(zeroActive.trueMarketMean,null);assert.equal(zeroActive.aviv,null);
  const zeroInvestor=calculateOnchain({...example,thermocapUsd:1000},'cointime');assert.equal(zeroInvestor.trueMarketMean,0);assert.equal(zeroInvestor.aviv,null);
  const allExcluded=calculateOnchain({...example,excluded5:20},'exclude5');assert.equal(allExcluded.comparisonSupply,0);assert.equal(allExcluded.comparisonCostBasis,null);
});
test('입력 범위와 누적 연령 공급량의 순서를 검증한다',()=>{
  for(const change of [{realizedCapUsd:0},{thermocapUsd:1001},{circulatingSupply:0},{circulatingSupply:21000001},{liveliness:1.1},{spotPriceUsd:0},{excluded5:21},{excluded7:5},{marketCapUsd:NaN}])assert.throws(()=>calculateOnchain({...example,...change},'cointime'));
});
test('십억 USD 변환과 수동 시가총액 선택을 반영한다',()=>{
  const settings=defaultOnchainSettings();const snapshot=parseOnchainInputs(settings.inputs,'spot');
  assert.equal(snapshot.realizedCapUsd,1e12);assert.equal(snapshot.thermocapUsd,1e11);assert.equal(snapshot.marketCapUsd,2e12);
  assert.equal(parseOnchainInputs({...settings.inputs,marketCapBillionUsd:'1234'},'manual').marketCapUsd,1234e9);
  assert.equal(parseOnchainInputs({...settings.inputs,marketCapBillionUsd:''},'spot').marketCapUsd,2e12);
  assert.throws(()=>parseOnchainInputs({...settings.inputs,realizedCapBillionUsd:''},'spot'));
});
