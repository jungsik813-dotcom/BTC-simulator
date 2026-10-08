import { defaultTamAdoptionInputs } from './tamAdoptionSettings.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeSettings, defaultInputs, defaultTamInputs, defaultPowerLawInputs, parseInputs, parseTamInputs, compactKrw, formatMoney } from './settings.ts';
import { defaultMonteCarloSettings } from './monteCarloSettings.ts';
import { defaultOnchainSettings } from './onchainInput.ts';

test('설정 복원은 직접 입력한 가격과 자동 조회 선택을 보존한다', () => {
  const inputs = { ...defaultInputs(), btcPrice: '87000000', monthlyBtc: '123000' };
  assert.deepEqual(decodeSettings(JSON.stringify({version:1, inputs, autoPrice:false})), {inputs,tamInputs:defaultTamInputs(),powerLawInputs:defaultPowerLawInputs(),tamAdoptionInputs:defaultTamAdoptionInputs(),onchainSettings:defaultOnchainSettings(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:false,btcModel:'cagr'});
  assert.equal(decodeSettings(null).inputs.startYear, '2026');
});
test('TAM 설정과 선택 모델을 복원한다', () => {
  const inputs=defaultInputs(), tamInputs=defaultTamInputs();
  tamInputs.gold.penetration='17';
  assert.deepEqual(decodeSettings(JSON.stringify({version:2,inputs,tamInputs,autoPrice:true,btcModel:'tam'})),{inputs,tamInputs,powerLawInputs:defaultPowerLawInputs(),tamAdoptionInputs:defaultTamAdoptionInputs(),onchainSettings:defaultOnchainSettings(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:true,btcModel:'tam'});
  assert.equal(parseTamInputs(tamInputs).gold.penetration,17);
});
test('Power Law 가정을 저장·복원하며 이전 TAM 설정을 보존한다',()=>{
  const inputs=defaultInputs(),tamInputs=defaultTamInputs(),powerLawInputs={...defaultPowerLawInputs(),exponent:'6',usdKrw:'1300'};
  const saved={version:3,inputs,tamInputs,powerLawInputs,autoPrice:false,btcModel:'tam'};
  assert.deepEqual(decodeSettings(JSON.stringify(saved)),{inputs,tamInputs,powerLawInputs,tamAdoptionInputs:defaultTamAdoptionInputs(),onchainSettings:defaultOnchainSettings(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:false,btcModel:'tam'});
  assert.throws(()=>decodeSettings(JSON.stringify({...saved,powerLawInputs:{...powerLawInputs,usdKrw:'0'}})));
});
test('온체인 설정을 복원하며 잘못된 공급량 선택을 거부한다',()=>{
  const onchainSettings=defaultOnchainSettings();onchainSettings.supplyMode='exclude7';onchainSettings.marketCapSource='manual';onchainSettings.inputs.marketCapBillionUsd='1234';
  const saved={version:4,inputs:defaultInputs(),tamInputs:defaultTamInputs(),powerLawInputs:defaultPowerLawInputs(),onchainSettings,autoPrice:false,btcModel:'cagr'};
  const {version,...expected}=saved;
  assert.deepEqual(decodeSettings(JSON.stringify(saved)),{...expected,monteCarloSettings:defaultMonteCarloSettings(),tamAdoptionInputs:defaultTamAdoptionInputs()});
  assert.throws(()=>decodeSettings(JSON.stringify({...saved,onchainSettings:{...onchainSettings,supplyMode:'unknown'}})));
  assert.throws(()=>decodeSettings(JSON.stringify({...saved,onchainSettings:{...onchainSettings,inputs:{...onchainSettings.inputs,liveliness:'2'}}})));
});
test('손상되거나 유효하지 않은 저장 데이터는 거부한다', () => {
  assert.throws(()=>decodeSettings('{'));
  assert.throws(()=>decodeSettings(JSON.stringify({version:1, inputs:{}, autoPrice:true})));
  assert.throws(()=>decodeSettings(JSON.stringify({version:1, inputs:{...defaultInputs(),debt:'-1'}, autoPrice:true})));
  assert.throws(()=>parseInputs({...defaultInputs(),cash:''}));
});
test('통화와 한국 금액 단위를 정확히 표시한다', () => {
  assert.equal(formatMoney(1234567),'1,234,567 KRW');
  assert.equal(formatMoney(1234.5,'USD'),'1,234.50 USD');
  assert.equal(compactKrw(150000000),'1.5억 원');
  assert.equal(compactKrw(500000),'50만 원');
  assert.equal(compactKrw(-200000000),'-2억 원');
});

test('Monte Carlo 설정 v5 복원과 검증',()=>{
  const monteCarloSettings=defaultMonteCarloSettings();monteCarloSettings.inputs.paths='100000';monteCarloSettings.inputs.seed='721';monteCarloSettings.btcCenter='tam';
  const expected={...decodeSettings(null),monteCarloSettings};
  expected.onchainSettings.supplyMode='exclude7';
  assert.deepEqual(decodeSettings(JSON.stringify({version:5,...expected})),expected);
  assert.throws(()=>decodeSettings(JSON.stringify({version:5,...expected,monteCarloSettings:{...monteCarloSettings,inputs:{...monteCarloSettings.inputs,fxMean:'0'}}})));
});
