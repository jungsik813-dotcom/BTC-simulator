import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeSettings,defaultInputs,parseInputs,compactKrw,formatMoney} from './settings.ts';
import {DEFAULT_POWER_LAW_BETA} from './powerLaw.ts';
import {defaultMonteCarloSettings} from './monteCarloSettings.ts';

test('직접 입력한 가격과 자동 조회 선택을 보존한다',()=>{
 const inputs={...defaultInputs(),btcPrice:'87000000',monthlyBtc:'123000'};
 assert.deepEqual(decodeSettings(JSON.stringify({version:1,inputs,autoPrice:false})),{inputs,monteCarloSettings:defaultMonteCarloSettings(),autoPrice:false,powerLawBeta:String(DEFAULT_POWER_LAW_BETA)});
});
test('과거 설정의 제거된 모델은 무시하고 자산·투자금·Monte Carlo를 보존한다',()=>{
 for(const version of [2,3,4,5,6,7]){
  const inputs={...defaultInputs(),stocks:'123456',btcReturn:'13'};
  const monteCarloSettings=defaultMonteCarloSettings();monteCarloSettings.inputs.seed='721';
  const saved={version,inputs,autoPrice:false,btcModel:'tam',tamInputs:null,powerLawInputs:{broken:true},onchainSettings:null,monteCarloSettings:{...monteCarloSettings,inputs:{...monteCarloSettings.inputs,btcMean:'18',stockMean:'6',inflationMean:'4',paths:'1000'},btcCenter:'tam'}};
  const restored=decodeSettings(JSON.stringify(saved));
  assert.deepEqual(restored.inputs,inputs);assert.equal(restored.autoPrice,false);
  assert.deepEqual(restored.monteCarloSettings,version>=5?monteCarloSettings:defaultMonteCarloSettings());
  assert.deepEqual(Object.keys(restored).sort(),['autoPrice','inputs','monteCarloSettings','powerLawBeta']);
  assert.ok(!('btcCenter' in restored.monteCarloSettings));
 }
});
test('현재 형식 복원 및 잘못된 Monte Carlo 설정 검증',()=>{
 const expected=decodeSettings(null);expected.monteCarloSettings.inputs.seed='721';
 assert.deepEqual(decodeSettings(JSON.stringify({version:9,...expected})),expected);
 assert.throws(()=>decodeSettings(JSON.stringify({version:8,...expected,monteCarloSettings:{...expected.monteCarloSettings,inputs:{...expected.monteCarloSettings.inputs,fxMean:'0'}}})));
});
test('손상된 설정과 잘못된 포트폴리오 입력을 거부한다',()=>{
 assert.throws(()=>decodeSettings('{'));
 assert.throws(()=>decodeSettings(JSON.stringify({version:1,inputs:{},autoPrice:true})));
 assert.throws(()=>decodeSettings(JSON.stringify({version:8,inputs:{...defaultInputs(),debt:'-1'},autoPrice:true})));
 assert.throws(()=>parseInputs({...defaultInputs(),cash:''}));
});
test('금액과 통화를 포맷한다',()=>{
 assert.equal(formatMoney(1234567),'1,234,567 KRW');assert.equal(formatMoney(1234.5,'USD'),'1,234.50 USD');
 assert.equal(compactKrw(150000000),'1.5억 원');assert.equal(compactKrw(500000),'50만 원');assert.equal(compactKrw(-200000000),'-2억 원');
});
