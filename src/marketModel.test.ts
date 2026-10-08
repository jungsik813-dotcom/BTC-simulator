import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultMarketAssumptions, validateMarket, correlatedShocks, chiSquared, nextRegime, sampleJump, REGIMES } from './marketModel.ts';
import { defaultMarketSettings, parseMarketSettings } from './marketSettings.ts';
import { defaultMonteCarlo, runMonteCarlo, seededUniform, standardNormal, type MonteCarloRequest } from './monteCarlo.ts';
import { defaults } from './simulation.ts';
import { decodeSettings } from './settings.ts';
const close=(a:number,b:number,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*tolerance,`${a} != ${b}`);
function request():MonteCarloRequest {return {portfolio:{...defaults,endYear:2029,stocks:0,cash:0,debt:0,monthlyBtc:0,monthlyStocks:0},assumptions:{...defaultMonteCarlo,paths:1000,btcVolatility:0,stockVolatility:0,fxVolatility:0,inflationVolatility:0},market:defaultMarketAssumptions()};}

test('Student-t 분산 표준화와 두꺼운 꼬리, 양수 및 음수 상관계수를 확인한다',()=>{
  for(const distribution of ['normal','studentT'] as const){
    const random=seededUniform(801),z=standardNormal(random),n=200000;let sx=0,sy=0,xx=0,yy=0,xy=0,tails=0;
    for(let i=0;i<n;i++){const [x,y]=correlatedShocks(distribution,5,-.6,random,z);sx+=x;sy+=y;xx+=x*x;yy+=y*y;xy+=x*y;if(Math.abs(x)>4)tails++;}
    close(sx/n,0,.015);close(sy/n,0,.015);close(xx/n,1,.04);close(yy/n,1,.04);
    const rho=(xy-sx*sy/n)/Math.sqrt((xx-sx*sx/n)*(yy-sy*sy/n));close(rho,-.6,.02);
    if(distribution==='studentT')assert.ok(tails>300);else assert.ok(tails<35);
  }
  for(const rho of [-1,1]){const random=seededUniform(9),z=standardNormal(random);for(let i=0;i<100;i++){const [x,y]=correlatedShocks('studentT',5,rho,random,z);close(y,rho*x)}}
});
test('소수 자유도 카이제곱 표본의 평균과 분산',()=>{
  const random=seededUniform(128),z=standardNormal(random),n=100000,df=3.5;let sum=0,squares=0;
  for(let i=0;i<n;i++){const x=chiSquared(df,random,z);assert.ok(x>0);sum+=x;squares+=x*x}
  close(sum/n,df,.015);close(squares/n-(sum/n)**2,2*df,.03);
});
test('Markov 행 방향과 확률 경계가 정확하다',()=>{
  const transitions=defaultMarketAssumptions().transitions;
  assert.equal(nextRegime('riskOn',transitions,0),'riskOn');
  assert.equal(nextRegime('riskOn',transitions,.75),'normal');
  assert.equal(nextRegime('riskOn',transitions,.96),'crisis');
  transitions.crisis={riskOn:0,normal:100,crisis:0};assert.equal(nextRegime('crisis',transitions,.999999),'normal');
});
test('첫 투자 연도 국면 이후부터 전이하며 각 국면의 수익률을 적용한다',()=>{
  const req=request(),m=req.market!;m.regimeEnabled=true;
  for(const r of REGIMES){m.regimes[r].btcVolatility=0;m.regimes[r].stockVolatility=0;}
  m.transitions.normal={riskOn:0,normal:0,crisis:100};m.transitions.crisis={riskOn:100,normal:0,crisis:0};
  const result=runMonteCarlo(req);
  assert.equal(result.rows[0].regimeCounts,undefined);
  assert.deepEqual(result.rows[1].regimeCounts,{riskOn:0,normal:1000,crisis:0});
  assert.deepEqual(result.rows[2].regimeCounts,{riskOn:0,normal:0,crisis:1000});
  assert.deepEqual(result.rows[3].regimeCounts,{riskOn:1000,normal:0,crisis:0});
  close(result.rows[3].nominal.p50,defaults.btcPrice*1.1*.65*1.25);
});
test('TAM 중심은 Normal에서 유지하고 Crisis에서 상대 배율을 적용한다',()=>{
  const req=request(),m=req.market!;req.assumptions.btcCenter='tam';req.btcCentersKrw=[1e8,2e8,3e8,4e8];m.regimeEnabled=true;
  for(const r of REGIMES)m.regimes[r].btcVolatility=0;
  m.transitions.normal={riskOn:0,normal:100,crisis:0};
  close(runMonteCarlo(req).rows[3].nominal.p50,4e8);
  m.initialRegime='crisis';m.transitions.crisis={riskOn:0,normal:0,crisis:100};
  close(runMonteCarlo(req).rows[3].nominal.p50,4e8*(.65/1.1)**3);
});
test('Jump는 상호 배타적이며 확률 경계와 비활성화를 반영한다',()=>{
  const a=defaultMarketAssumptions();a.jumpEnabled=true;a.crashProbability=20;a.maniaProbability=30;
  assert.deepEqual(sampleJump(a,.199),{factor:.7,kind:'crash'});
  assert.deepEqual(sampleJump(a,.2),{factor:1.5,kind:'mania'});
  assert.deepEqual(sampleJump(a,.5),{factor:1,kind:'none'});
  a.jumpEnabled=false;assert.deepEqual(sampleJump(a,0),{factor:1,kind:'none'});
});
test('100% 급락은 BTC에만 곱하고 사용자 수익률 제한은 Jump 이후 적용한다',()=>{
  const req=request();req.portfolio.stocks=50000000;req.market!.jumpEnabled=true;req.market!.crashProbability=100;req.market!.maniaProbability=0;
  const result=runMonteCarlo(req);close(result.rows[3].nominal.p50,1e8*(1.1*.7)**3+5e7*1.07**3);
  assert.equal(result.diagnostics.crashes,3000);assert.equal(result.diagnostics.manias,0);
  req.assumptions.limitBtcReturns=true;req.assumptions.minBtcReturn=0;req.assumptions.maxBtcReturn=0;
  close(runMonteCarlo(req).rows[3].nominal.p50,1e8+5e7*1.07**3);
});
test('Student-t의 손실 하한 횟수를 기록하고 가격을 양수로 유지한다',()=>{
  const req=request();req.market!.distribution='studentT';req.assumptions.btcVolatility=150;req.assumptions.stockVolatility=150;req.portfolio.endYear=2027;
  const result=runMonteCarlo(req);assert.ok(result.diagnostics.btcFloors>0);assert.ok(result.diagnostics.stockFloors>0);assert.ok(result.rows[1].nominal.p10>0);
  req.assumptions.btcVolatility=0;req.assumptions.stockVolatility=0;
  close(runMonteCarlo(req).rows[1].nominal.p50,1.1e8);
});
test('기본 모형 재현성과 모든 고급 옵션의 seed 재현성',()=>{
  const req=request();assert.deepEqual(runMonteCarlo(req),runMonteCarlo({...req,market:undefined}));
  req.market!.distribution='studentT';req.market!.regimeEnabled=true;req.market!.jumpEnabled=true;
  assert.deepEqual(runMonteCarlo(req),runMonteCarlo(req));
  const result=runMonteCarlo(req);for(const row of result.rows.slice(1))assert.equal(Object.values(row.regimeCounts!).reduce((a,b)=>a+b,0),1000);
  assert.notDeepEqual(result,runMonteCarlo({...req,assumptions:{...req.assumptions,seed:99}}));
});
test('국면·분포·Jump 입력의 범위를 엄격하게 검증한다',()=>{
  const a=defaultMarketAssumptions();validateMarket(a);
  for(const degreesOfFreedom of [2,0,201,NaN])assert.throws(()=>validateMarket({...a,degreesOfFreedom}));
  for(const correlation of [-1.01,1.01,NaN])assert.throws(()=>validateMarket({...a,regimes:{...a.regimes,normal:{...a.regimes.normal,correlation}}}));
  assert.throws(()=>validateMarket({...a,transitions:{...a.transitions,normal:{riskOn:10,normal:10,crisis:10}}}));
  assert.throws(()=>validateMarket({...a,transitions:{...a.transitions,normal:{riskOn:-10,normal:100,crisis:10}}}));
  assert.throws(()=>validateMarket({...a,crashProbability:90,maniaProbability:20}));assert.throws(()=>validateMarket({...a,crashMagnitude:100}));
  const s=defaultMarketSettings();s.transitions.normal.crisis='';assert.throws(()=>parseMarketSettings(s));
});
test('STEP 7 저장값을 보존하고 고급 설정을 기본값으로 추가한다',()=>{
  const settings=decodeSettings(null);const {market,...legacy}=settings.monteCarloSettings;legacy.inputs.seed='73';legacy.inputs.btcMean='18';
  const restored=decodeSettings(JSON.stringify({...settings,version:5,monteCarloSettings:legacy}));
  assert.equal(restored.monteCarloSettings.inputs.seed,'73');assert.equal(restored.monteCarloSettings.inputs.btcMean,'18');
  assert.deepEqual(restored.monteCarloSettings.market,defaultMarketSettings());
});
test('STEP 8 설정을 저장·복원하며 손상된 전이행렬을 거부한다',()=>{
  const expected=decodeSettings(null);const m=expected.monteCarloSettings.market;
  m.distribution='studentT';m.inputs.degreesOfFreedom='7.5';m.regimeEnabled=true;m.initialRegime='crisis';m.jumpEnabled=true;m.regimes.normal.correlation='-0.4';
  assert.deepEqual(decodeSettings(JSON.stringify({...expected,version:6})),expected);
  m.transitions.normal.normal='1';assert.throws(()=>decodeSettings(JSON.stringify({...expected,version:6})));
});
