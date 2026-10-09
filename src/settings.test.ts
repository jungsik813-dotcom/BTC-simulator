import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeSettings,defaultInputs,parseInputs,compactKrw,formatMoney,SETTINGS_VERSION} from './settings.ts';
import {DEFAULT_POWER_LAW_BETA} from './powerLaw.ts';
import {defaultMonteCarloSettings} from './monteCarloSettings.ts';

test('과거 저장 형식에서 BTC 가정만 보존하고 다른 자산은 제거한다',()=>{
 for(let version=1;version<=10;version++){
  const inputs={...defaultInputs(),btcPrice:'87000000',monthlyBtc:'123000',btcReturn:'13'};
  const monteCarloSettings=defaultMonteCarloSettings();monteCarloSettings.inputs.seed='721';
  const raw=structuredClone(monteCarloSettings) as any;
  Object.assign(raw.inputs,{stockMean:'bad',stockVolatility:'bad',fxMean:'0',inflationMean:'bad',paths:'1000'});
  for(const regime of Object.values(raw.market.regimes) as any[])Object.assign(regime,{stockMean:'bad',stockVolatility:'bad',correlation:'bad'});
  if(version===5)delete raw.market;
  const saved={version,inputs:{...inputs,stocks:'bad',cash:'',debt:'-1',monthlyStocks:'bad',stockReturn:'bad',inflation:'bad',debtRate:'bad'},autoPrice:false,powerLawBeta:'6.2',monteCarloSettings:raw,btcModel:'tam'};
  const restored=decodeSettings(JSON.stringify(saved));
  assert.deepEqual(restored.inputs,inputs);assert.equal(restored.autoPrice,false);
  const expected=version>=5?monteCarloSettings:defaultMonteCarloSettings();
  expected.market=defaultMonteCarloSettings().market;
  assert.deepEqual(restored.monteCarloSettings,expected);
  assert.equal(restored.powerLawBeta,version>=10?'6.2':String(DEFAULT_POWER_LAW_BETA));
  assert.ok(!/stock|cash|debt|inflation|fxMean|correlation/.test(JSON.stringify(restored)));
 }
});
test('현재 BTC 전용 저장 형식을 복원한다',()=>{
 const expected=decodeSettings(null);expected.monteCarloSettings.inputs.seed='721';
 assert.deepEqual(decodeSettings(JSON.stringify({version:SETTINGS_VERSION,...expected})),expected);
 assert.deepEqual(Object.keys(expected.inputs).sort(),['btcPrice','btcQuantity','btcReturn','endYear','monthlyBtc','startYear']);
});
test('손상된 설정과 잘못된 BTC 입력을 거부한다',()=>{
 const expected=decodeSettings(null);
 assert.throws(()=>decodeSettings('{'));
 for(const version of [0,16,1.5])assert.throws(()=>decodeSettings(JSON.stringify({version,...expected})));
 assert.throws(()=>decodeSettings(JSON.stringify({version:11,...expected,inputs:{}})));
 assert.throws(()=>parseInputs({...defaultInputs(),btcQuantity:'-1'}));
 assert.throws(()=>parseInputs({...defaultInputs(),monthlyBtc:''}));
 assert.throws(()=>decodeSettings(JSON.stringify({version:11,...expected,monteCarloSettings:{...expected.monteCarloSettings,inputs:{...expected.monteCarloSettings.inputs,btcVolatility:'-1'}}})));
});
test('금액을 포맷한다',()=>{
 assert.equal(formatMoney(1234567),'1,234,567 KRW');
 assert.equal(compactKrw(150000000),'1.5억 원');assert.equal(compactKrw(500000),'50만 원');
});

test('기존 세 국면 설정을 자료 기반 두 국면으로 이전하고 BTC 입력은 보존한다',()=>{
 const saved=decodeSettings(null),old=structuredClone(saved) as any;
 old.monteCarloSettings.inputs.btcVolatility='60';old.monteCarloSettings.inputs.seed='123';
 old.monteCarloSettings.market={distribution:'normal',regimeEnabled:false,initialRegime:'normal',regimes:{riskOn:{btcMean:'25',btcVolatility:'65'},normal:{btcMean:'10',btcVolatility:'49'},crisis:{btcMean:'-35',btcVolatility:'85'}},transitions:{},jumpEnabled:false,inputs:{}};
 for(const version of [11,12]){
  const restored=decodeSettings(JSON.stringify({version,...old}));
  assert.deepEqual(restored.monteCarloSettings.market,defaultMonteCarloSettings().market);
  assert.equal(restored.monteCarloSettings.market.regimeEnabled,true);
  assert.equal(restored.monteCarloSettings.inputs.seed,'123');assert.deepEqual(restored.inputs,saved.inputs);
  assert.deepEqual(Object.keys(restored.monteCarloSettings.market.regimes),['bull','bear']);
 }
});
test('새 저장 형식에서는 사용자가 수정한 두 국면 설정을 보존한다',()=>{
 const saved=decodeSettings(null);saved.monteCarloSettings.inputs.btcVolatility='55';saved.monteCarloSettings.market.regimes.bull.btcVolatility='55';saved.monteCarloSettings.market.regimes.bear.btcMean='-20';
 const restored=decodeSettings(JSON.stringify({version:SETTINGS_VERSION,...saved}));assert.deepEqual(restored,saved);
});

test('이전 단일 Jump 설정을 복수 자료 기반 Jump로 이전한다',()=>{
 const saved=decodeSettings(null),legacy=structuredClone(saved) as any;
 legacy.monteCarloSettings.market.inputs={degreesOfFreedom:'5',crashProbability:'3',crashMagnitude:'30',maniaProbability:'2',maniaMagnitude:'50'};
 legacy.monteCarloSettings.market.jumpEnabled=false;
 const restored=decodeSettings(JSON.stringify({version:13,...legacy}));
 assert.equal(restored.monteCarloSettings.market.jumpEnabled,true);assert.equal(restored.monteCarloSettings.market.inputs.jumpIntensity,'1');
 assert.ok(!('crashProbability' in restored.monteCarloSettings.market.inputs));
 assert.deepEqual(restored.inputs,saved.inputs);
 legacy.monteCarloSettings.market.distribution='studentT';
 assert.equal(decodeSettings(JSON.stringify({version:13,...legacy})).monteCarloSettings.market.jumpEnabled,false);
});

test('기존 낮은 변동성 설정은 Jump를 꺼서 이전하고 BTC 값을 보존한다',()=>{
 const saved=decodeSettings(null);saved.inputs.btcQuantity='2.5';saved.monteCarloSettings.market.regimes.bull.btcVolatility='0';
 const restored=decodeSettings(JSON.stringify({version:13,...saved}));
 assert.equal(restored.monteCarloSettings.market.jumpEnabled,false);assert.equal(restored.inputs.btcQuantity,'2.5');assert.equal(restored.monteCarloSettings.market.regimes.bull.btcVolatility,'0');
});

test('과거 기본 국면 값은 새 자료 기간으로 갱신하고 사용자 값·BTC 입력은 보존한다',()=>{
 const saved=decodeSettings(null);saved.inputs.btcQuantity='2.5';saved.monteCarloSettings.inputs.seed='172';
 saved.monteCarloSettings.market.regimes={bull:{btcMean:'95.62',btcVolatility:'47.1'},bear:{btcMean:'-40.86',btcVolatility:'47.85'}};
 const next=decodeSettings(JSON.stringify({version:14,...saved}));
 assert.deepEqual(next.monteCarloSettings.market.regimes,defaultMonteCarloSettings().market.regimes);
 assert.deepEqual(next.inputs,saved.inputs);assert.equal(next.monteCarloSettings.inputs.seed,'172');
 saved.monteCarloSettings.market.regimes.bull.btcMean='20';saved.monteCarloSettings.market.regimes.bear.btcVolatility='70';
 const custom=decodeSettings(JSON.stringify({version:14,...saved}));
 assert.equal(custom.monteCarloSettings.market.regimes.bull.btcMean,'20');assert.equal(custom.monteCarloSettings.market.regimes.bear.btcVolatility,'70');
});
