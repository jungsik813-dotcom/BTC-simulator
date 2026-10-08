import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, simulate } from './simulation.ts';
import { defaultMonteCarlo, runMonteCarlo, percentile, seededUniform, standardNormal, lognormalFactor, validateMonteCarloRequest, type MonteCarloAssumptions, type MonteCarloRequest } from './monteCarlo.ts';
import { defaultMonteCarloSettings, makeMonteCarloRequest, parseMonteCarloSettings } from './monteCarloSettings.ts';

const close=(actual:number,expected:number,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*tolerance,`${actual} != ${expected}`);
const fixed:MonteCarloAssumptions={...defaultMonteCarlo,paths:100000,btcVolatility:0,stockVolatility:0,inflationVolatility:0,fxVolatility:0};
const request=(assumptions:Partial<MonteCarloAssumptions>={}):MonteCarloRequest=>({portfolio:{...defaults},assumptions:{...fixed,...assumptions}});

test('변동성이 0이면 모든 분위수와 평균이 기존 CAGR 계산과 일치한다',()=>{
  const expected=simulate(defaults),result=runMonteCarlo(request());
  assert.equal(result.rows.length,20);
  result.rows.forEach((row,i)=>{for(const metric of ['nominal','real'] as const)for(const value of Object.values(row[metric]))close(value,expected[i][metric])});
});
test('고정 seed 재현, 다른 seed 변화, 분위수 정렬 및 진행률 완료',()=>{
  const req=request({...defaultMonteCarlo,paths:100000});
  const progress:number[]=[];
  const first=runMonteCarlo(req,p=>progress.push(p));
  assert.deepEqual(first,runMonteCarlo(req));
  assert.notDeepEqual(first,runMonteCarlo({...req,assumptions:{...req.assumptions,seed:43}}));
  for(const row of first.rows)for(const metric of ['nominal','real'] as const){const q=row[metric];assert.ok(q.p10<=q.p25&&q.p25<=q.p50&&q.p50<=q.p75&&q.p75<=q.p90)}
  assert.equal(progress.at(-1),100);assert.deepEqual(progress,[...progress].sort((a,b)=>a-b));
});
test('분위수는 음수를 포함한 표본에서 선형 보간한다',()=>{
  const samples=new Float64Array([-100,0,100,200]);
  assert.equal(percentile(samples,.1),-70);assert.equal(percentile(samples,.5),50);assert.equal(percentile(samples,.9),170);
  assert.equal(percentile(samples,0),-100);assert.equal(percentile(samples,1),200);
  assert.equal(percentile([7],.9),7);assert.throws(()=>percentile([],0));assert.throws(()=>percentile(samples,2));
});
test('1년 FX 표본에 동일 환율로 BTC와 QQQ를 환산하고 연말 KRW 납입액은 보존한다',()=>{
  const req=request({fxVolatility:30});req.portfolio={...defaults,endYear:2027};
  const z=standardNormal(seededUniform(fixed.seed)),samples:number[]=[];
  for(let i=0;i<100000;i++){
    z();z();z();const fx=lognormalFactor(fixed.fxMean,.3,z());
    samples.push((defaults.btcQuantity*defaults.btcPrice*1.1+defaults.stocks*1.07)*fx/fixed.fxMean+12*(defaults.monthlyBtc+defaults.monthlyStocks)+defaults.cash-defaults.debt*1.04);
  }
  samples.sort((a,b)=>a-b);
  const row=runMonteCarlo(req).rows[1];
  close(row.nominal.p10,percentile(samples,.1));close(row.nominal.p90,percentile(samples,.9));close(row.real.p50,row.nominal.p50/1.02);
});
test('수익률 제한은 USD 연 수익률에 적용하며 평균 가정을 바꿀 수 있다',()=>{
  const req=request({btcVolatility:60,limitBtcReturns:true,minBtcReturn:0,maxBtcReturn:0});
  const expected=simulate({...defaults,btcReturn:0});
  runMonteCarlo(req).rows.forEach((row,i)=>close(row.nominal.p50,expected[i].nominal));
});
test('0자산, 음수 순자산과 시작=종료 연도를 유지한다',()=>{
  const req=request();req.portfolio={...defaults,btcQuantity:0,stocks:0,cash:0,debt:0,monthlyBtc:0,monthlyStocks:0};
  assert.equal(runMonteCarlo(req).rows.at(-1)!.nominal.p50,0);
  req.portfolio.debt=1e9;
  const negative=runMonteCarlo(req);assert.ok(negative.rows.at(-1)!.nominal.p90<0);
  req.portfolio.endYear=req.portfolio.startYear;
  const only=runMonteCarlo(req);assert.equal(only.rows.length,1);close(only.rows[0].nominal.p50,-1e9);
});
test('독립 물가 경로로 실질 분포를 계산하며 명목 분포는 유지한다',()=>{
  const req=request({inflationVolatility:20});
  const stochastic=runMonteCarlo(req),deterministic=runMonteCarlo(request());
  assert.deepEqual(stochastic.rows.at(-1)!.nominal,deterministic.rows.at(-1)!.nominal);
  assert.ok(stochastic.rows.at(-1)!.real.p10<stochastic.rows.at(-1)!.real.p90);
});
test('로그정규 평균 보정과 양수 난수 표본',()=>{
  const uniform=seededUniform(0),z=standardNormal(seededUniform(42));
  let mean=0;
  for(let i=0;i<100000;i++){const u=uniform();assert.ok(u>0&&u<1);mean+=lognormalFactor(1.1,.6,z())/100000}
  close(mean,1.1,.01);
});
test('입력 오류와 메모리 한도를 실행 전에 거부한다',()=>{
  for(const assumptions of [{paths:5},{seed:-1},{seed:1.5},{fxMean:0},{btcVolatility:-1},{stockMean:-100},{inflationMean:NaN},{limitBtcReturns:true,minBtcReturn:-100},{limitBtcReturns:true,minBtcReturn:10,maxBtcReturn:0}] as Partial<MonteCarloAssumptions>[])assert.throws(()=>validateMonteCarloRequest(request(assumptions)));
  assert.throws(()=>validateMonteCarloRequest({...request({paths:100000}),portfolio:{...defaults,endYear:2200}}));
  assert.throws(()=>runMonteCarlo(request({btcVolatility:1e8})),/범위/);
});
test('문자열 설정을 검증하고 100,000회 고정 실행을 반영한다',()=>{
  const settings=defaultMonteCarloSettings();assert.equal(parseMonteCarloSettings(settings).paths,100000);
  settings.inputs.seed='';assert.throws(()=>parseMonteCarloSettings(settings));
  settings.inputs.seed='42';assert.equal(makeMonteCarloRequest(defaults,settings).assumptions.seed,42);
});

test('상단 성장률·물가를 연동하고 오래된 별도 수익률·횟수 입력을 무시한다',()=>{
 const settings=defaultMonteCarloSettings();
 Object.assign(settings.inputs,{btcMean:'10',stockMean:'7',inflationMean:'2',paths:'1000'});
 const portfolio={...defaults,btcReturn:20,stockReturn:9,inflation:3,endYear:2028};
 const first=makeMonteCarloRequest(portfolio,settings);
 assert.equal(first.assumptions.paths,100000);assert.equal(first.assumptions.btcMean,20);assert.equal(first.assumptions.stockMean,9);assert.equal(first.assumptions.inflationMean,3);
 const next=makeMonteCarloRequest({...portfolio,btcReturn:25},settings);
 assert.equal(next.assumptions.btcMean,25);assert.equal(first.assumptions.btcMean,20);
 for(const key of ['btcVolatility','stockVolatility','fxVolatility','inflationVolatility'] as const)settings.inputs[key]='0';
 const expected=simulate(portfolio),actual=runMonteCarlo(makeMonteCarloRequest(portfolio,settings));
 assert.equal(actual.paths,100000);actual.rows.forEach((r,i)=>{close(r.nominal.p50,expected[i].nominal);close(r.real.p50,expected[i].real)});
});

test('국면을 사용해도 Normal 수익률은 상단 가정이며 상대 국면 차이를 유지한다',()=>{
 const settings=defaultMonteCarloSettings();settings.market.regimeEnabled=true;
 const original=structuredClone(settings);
 const request=makeMonteCarloRequest({...defaults,btcReturn:20,stockReturn:9},settings);
 assert.equal(request.market!.regimes.normal.btcMean,20);assert.equal(request.market!.regimes.normal.stockMean,9);
 close(request.market!.regimes.riskOn.btcMean,((1.2*1.25/1.1)-1)*100);
 assert.deepEqual(settings,original);
});
