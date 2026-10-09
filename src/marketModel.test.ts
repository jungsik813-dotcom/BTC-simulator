import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMarketAssumptions, validateMarket, sampleShock, chiSquared, nextRegime, REGIMES } from './marketModel.ts';
import { defaultMarketSettings, parseMarketSettings } from './marketSettings.ts';
import { defaultMonteCarlo, runMonteCarlo, seededUniform, standardNormal, type MonteCarloRequest } from './monteCarlo.ts';
import { defaults as appDefaults } from './simulation.ts';
import { decodeSettings, SETTINGS_VERSION } from './settings.ts';
// Positive holdings fixture keeps return and contribution checks meaningful.
const defaults={...appDefaults,btcQuantity:1,monthlyBtc:500000};
const close=(a:number,b:number,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*tolerance,`${a} != ${b}`);
function request():MonteCarloRequest {return {portfolio:{...defaults,endYear:2029,monthlyBtc:0},assumptions:{...defaultMonteCarlo,paths:100000,btcVolatility:0},market:{...defaultMarketAssumptions(),regimeEnabled:false,jumpEnabled:false}};}

test('BTC Student-t 충격은 분산 1이며 Normal보다 두꺼운 꼬리를 갖는다',()=>{
 for(const distribution of ['normal','studentT'] as const){
  const random=seededUniform(801),z=standardNormal(random),n=200000;let sum=0,squares=0,tails=0;
  for(let i=0;i<n;i++){const x=sampleShock(distribution,5,random,z);sum+=x;squares+=x*x;if(Math.abs(x)>4)tails++;}
  close(sum/n,0,.015);close(squares/n,1,.04);
  if(distribution==='studentT')assert.ok(tails>300);else assert.ok(tails<35);
 }
});
test('소수 자유도 카이제곱 표본의 평균과 분산',()=>{
  const random=seededUniform(128),z=standardNormal(random),n=100000,df=3.5;let sum=0,squares=0;
  for(let i=0;i<n;i++){const x=chiSquared(df,random,z);assert.ok(x>0);sum+=x;squares+=x*x}
  close(sum/n,df,.015);close(squares/n-(sum/n)**2,2*df,.03);
});
test('두 국면의 Markov 행 방향과 확률 경계가 정확하다',()=>{
 const transitions={bull:{bull:75,bear:25},bear:{bull:100,bear:0}};
 assert.equal(nextRegime('bull',transitions,0),'bull');
 assert.equal(nextRegime('bull',transitions,.75),'bear');
 assert.equal(nextRegime('bear',transitions,.999999),'bull');
});
test('첫 투자 연도부터 선택 국면을 적용하고 이후 상승·하락을 전환한다',()=>{
 const req=request(),m=req.market!;m.regimeEnabled=true;m.initialRegime='bull';
 m.regimes={bull:{btcMean:20,btcVolatility:0},bear:{btcMean:-25,btcVolatility:0}};
 m.transitions={bull:{bull:0,bear:100},bear:{bull:100,bear:0}};
 const result=runMonteCarlo(req);
 assert.equal(result.rows[0].regimeCounts,undefined);
 assert.deepEqual(result.rows[1].regimeCounts,{bull:100000,bear:0});
 assert.deepEqual(result.rows[2].regimeCounts,{bull:0,bear:100000});
 assert.deepEqual(result.rows[3].regimeCounts,{bull:100000,bear:0});
 close(result.rows[3].btcValue.p50,defaults.btcPrice*1.2*.75*1.2);
 m.initialRegime='bear';close(runMonteCarlo(req).rows[1].btcValue.p50,defaults.btcPrice*.75);
});
test('국면 기본 수익률을 적용한 1년 가격 평균과 중앙값이 추정치와 맞는다',()=>{
 const req=request(),m=req.market!;m.regimeEnabled=true;req.portfolio.endYear=2027;
 for(const state of REGIMES){
  m.initialRegime=state;const q=runMonteCarlo(req).rows[1].btcValue;
  const mean=state==='bull'?1.9562:.5914;
  const median=state==='bull'?1.75081:.52758;
  close(q.mean,defaults.btcPrice*mean,.02);close(q.p50,defaults.btcPrice*median,.01);
 }
});
test('Student-t의 손실 하한 횟수를 기록하고 가격을 양수로 유지한다',()=>{
  const req=request();req.market!.distribution='studentT';req.assumptions.btcVolatility=150;req.portfolio.endYear=2027;
  const result=runMonteCarlo(req);assert.ok(result.diagnostics.btcFloors>0);assert.ok(result.rows[1].btcValue.p10>0);
  req.assumptions.btcVolatility=0;
  close(runMonteCarlo(req).rows[1].btcValue.p50,1.1e8);
});
test('기본 모형 재현성과 모든 고급 옵션의 seed 재현성',()=>{
  const req=request();assert.deepEqual(runMonteCarlo({...req,market:defaultMarketAssumptions()}),runMonteCarlo({...req,market:undefined}));
  req.market!.distribution='normal';req.market!.regimeEnabled=true;req.market!.jumpEnabled=true;
  assert.deepEqual(runMonteCarlo(req),runMonteCarlo(req));
  const result=runMonteCarlo(req);for(const row of result.rows.slice(1))assert.equal(Object.values(row.regimeCounts!).reduce((a,b)=>a+b,0),100000);
  assert.notDeepEqual(result,runMonteCarlo({...req,assumptions:{...req.assumptions,seed:99}}));
});
test('국면·분포·Jump 입력의 범위를 엄격하게 검증한다',()=>{
  const a=defaultMarketAssumptions();validateMarket(a);
  for(const degreesOfFreedom of [2,0,201,NaN])assert.throws(()=>validateMarket({...a,degreesOfFreedom}));
  for(const btcVolatility of [-1,NaN])assert.throws(()=>validateMarket({...a,regimes:{...a.regimes,bull:{...a.regimes.bull,btcVolatility}}}));
  assert.throws(()=>validateMarket({...a,transitions:{...a.transitions,bull:{bull:10,bear:10}}}));
  assert.throws(()=>validateMarket({...a,transitions:{...a.transitions,bull:{bull:-10,bear:110}}}));
  assert.throws(()=>validateMarket({...a,jumpIntensity:-1}));assert.throws(()=>validateMarket({...a,distribution:'studentT',jumpEnabled:true}));
  const s=defaultMarketSettings();s.transitions.bull.bear='';assert.throws(()=>parseMarketSettings(s));
});
test('STEP 7 저장값을 보존하고 고급 설정을 기본값으로 추가한다',()=>{
  const settings=decodeSettings(null);const {market,...legacy}=settings.monteCarloSettings;legacy.inputs.seed='73';
  const restored=decodeSettings(JSON.stringify({...settings,version:5,monteCarloSettings:legacy}));
  assert.equal(restored.monteCarloSettings.inputs.seed,'73');assert.ok(!('btcMean' in restored.monteCarloSettings.inputs));
  assert.deepEqual(restored.monteCarloSettings.market,defaultMarketSettings());
});
test('BTC 시장 설정을 저장·복원하며 손상된 전이행렬을 거부한다',()=>{
  const expected=decodeSettings(null);const m=expected.monteCarloSettings.market;
  m.distribution='studentT';m.inputs.degreesOfFreedom='7.5';m.regimeEnabled=true;m.initialRegime='bear';m.jumpEnabled=false;m.regimes.bull.btcVolatility='75';
  assert.deepEqual(decodeSettings(JSON.stringify({...expected,version:SETTINGS_VERSION})),expected);
  m.transitions.bull.bull='1';assert.throws(()=>decodeSettings(JSON.stringify({...expected,version:SETTINGS_VERSION})));
});
