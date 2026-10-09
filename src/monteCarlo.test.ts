import { defaultMarketAssumptions } from './marketModel.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults as appDefaults, simulate } from './simulation.ts';
import { defaultMonteCarlo, runMonteCarlo, percentile, seededUniform, standardNormal, lognormalFactor, validateMonteCarloRequest, type MonteCarloAssumptions, type MonteCarloRequest } from './monteCarlo.ts';
import { defaultMonteCarloSettings, makeMonteCarloRequest, parseMonteCarloSettings } from './monteCarloSettings.ts';
// Positive holdings fixture keeps return and contribution checks meaningful.
const defaults={...appDefaults,btcQuantity:1,monthlyBtc:500000};
const close=(actual:number,expected:number,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*tolerance,actual+' != '+expected);
const fixed:MonteCarloAssumptions={...defaultMonteCarlo,btcVolatility:0};
const request=(assumptions:Partial<MonteCarloAssumptions>={}):MonteCarloRequest=>({portfolio:{...defaults},assumptions:{...fixed,...assumptions},market:{...defaultMarketAssumptions(),regimeEnabled:false,jumpEnabled:false}});

test('변동성 0에서 모든 BTC 평가액 분위수와 평균이 CAGR과 일치한다',()=>{
 const req=request(),expected=simulate(defaults),result=runMonteCarlo(req);
 assert.equal(result.rows.length,20);
 result.rows.forEach((r,i)=>{for(const value of Object.values(r.btcValue))close(value,expected[i].btcValue)});
 assert.deepEqual(Object.keys(result.rows[0]).sort(),['btcValue','year']);
});
test('고정 seed 재현과 다른 seed 변화, 분위수 정렬 및 진행률 완료',()=>{
 const req=request({btcVolatility:60});req.portfolio.endYear=2028;
 const progress:number[]=[],first=runMonteCarlo(req,p=>progress.push(p));
 assert.deepEqual(first,runMonteCarlo(req));
 assert.notDeepEqual(first,runMonteCarlo({...req,assumptions:{...req.assumptions,seed:43}}));
 for(const row of first.rows){const q=row.btcValue;assert.ok(q.p10<=q.p25&&q.p25<=q.p50&&q.p50<=q.p75&&q.p75<=q.p90)}
 assert.equal(progress.at(-1),100);assert.deepEqual(progress,[...progress].sort((a,b)=>a-b));
});
test('1년 BTC 분포가 로그정규 이론의 평균·중앙값·꼬리 분위수와 맞는다',()=>{
 const req=request({btcMean:10,btcVolatility:60});req.portfolio={...defaults,endYear:2027,monthlyBtc:0};
 const q=runMonteCarlo(req).rows[1].btcValue;
 const initial=defaults.btcPrice*defaults.btcQuantity;
 close(q.mean,initial*1.1,.015);
 close(q.p50,initial*1.1*Math.exp(-.18),.015);
 close(q.p10,initial*1.1*Math.exp(-.18-.6*1.2815515655),.02);
 close(q.p90,initial*1.1*Math.exp(-.18+.6*1.2815515655),.02);
});
test('처음 BTC가 없어도 1년 투자금은 모든 경로에서 보존된다',()=>{
 const req=request({btcVolatility:100});req.portfolio={...defaults,endYear:2027,btcQuantity:0,monthlyBtc:100000};
 const q=runMonteCarlo(req).rows[1].btcValue;
 for(const value of Object.values(q))close(value,1200000);
});
test('분위수는 표본에서 선형 보간한다',()=>{
 const samples=new Float64Array([-100,0,100,200]);
 assert.equal(percentile(samples,.1),-70);assert.equal(percentile(samples,.5),50);assert.equal(percentile(samples,.9),170);
 assert.equal(percentile(samples,0),-100);assert.equal(percentile(samples,1),200);
 assert.equal(percentile([7],.9),7);assert.throws(()=>percentile([],0));assert.throws(()=>percentile(samples,2));
});
test('수익률 상·하한은 BTC 원화 가격 배율에 적용한다',()=>{
 const req=request({btcVolatility:60,limitBtcReturns:true,minBtcReturn:0,maxBtcReturn:0});
 const expected=simulate({...defaults,btcReturn:0});
 runMonteCarlo(req).rows.forEach((r,i)=>close(r.btcValue.p50,expected[i].btcValue));
});
test('보유량·투자금 0과 시작=종료 연도를 처리한다',()=>{
 const req=request();req.portfolio={...defaults,btcQuantity:0,monthlyBtc:0,endYear:2027};
 assert.equal(runMonteCarlo(req).rows.at(-1)!.btcValue.p90,0);
 req.portfolio={...defaults,endYear:defaults.startYear};
 const only=runMonteCarlo(req);assert.equal(only.rows.length,1);close(only.rows[0].btcValue.p50,defaults.btcPrice*defaults.btcQuantity);
});
test('로그정규 평균 보정과 양수 난수 표본',()=>{
 const uniform=seededUniform(0),z=standardNormal(seededUniform(42));let mean=0;
 for(let i=0;i<100000;i++){const u=uniform();assert.ok(u>0&&u<1);mean+=lognormalFactor(1.1,.6,z())/100000}
 close(mean,1.1,.01);
});
test('입력 오류와 메모리·계산 한도를 거부한다',()=>{
 for(const assumptions of [{paths:5},{seed:-1},{seed:1.5},{btcVolatility:-1},{btcMean:-100},{btcMean:NaN},{limitBtcReturns:true,minBtcReturn:-100},{limitBtcReturns:true,minBtcReturn:10,maxBtcReturn:0}] as Partial<MonteCarloAssumptions>[])assert.throws(()=>validateMonteCarloRequest(request(assumptions)));
 assert.throws(()=>validateMonteCarloRequest({...request(),portfolio:{...defaults,endYear:2200}}));
 assert.throws(()=>runMonteCarlo(request({btcVolatility:1e8})),/범위/);
});
test('상단 BTC 수익률 연동과 100,000회 실행, 문자열 설정 검증',()=>{
 const settings=defaultMonteCarloSettings();settings.market.regimeEnabled=false;settings.market.jumpEnabled=false;Object.assign(settings.inputs,{btcMean:'10',paths:'1000'});
 const portfolio={...defaults,btcReturn:20,endYear:2028};
 const first=makeMonteCarloRequest(portfolio,settings),next=makeMonteCarloRequest({...portfolio,btcReturn:25},settings);
 assert.equal(first.assumptions.paths,100000);assert.equal(first.assumptions.btcMean,20);assert.equal(next.assumptions.btcMean,25);
 settings.inputs.btcVolatility='0';
 const expected=simulate(portfolio),actual=runMonteCarlo(makeMonteCarloRequest(portfolio,settings));
 actual.rows.forEach((r,i)=>close(r.btcValue.p50,expected[i].btcValue));
 settings.inputs.seed='';assert.throws(()=>parseMonteCarloSettings(settings));
});
test('두 국면의 자료 기반 값은 CAGR 입력과 독립적으로 적용한다',()=>{
 const settings=defaultMonteCarloSettings(),original=structuredClone(settings);
 const first=makeMonteCarloRequest({...defaults,endYear:2027,btcReturn:10},settings),second=makeMonteCarloRequest({...defaults,endYear:2027,btcReturn:50},settings);
 assert.deepEqual(first.market!.regimes,{bull:{btcMean:95.62,btcVolatility:47.10},bear:{btcMean:-40.86,btcVolatility:47.85}});
 assert.deepEqual(first.market,second.market);
 assert.deepEqual(runMonteCarlo(first),runMonteCarlo(second));
 assert.deepEqual(settings,original);
});
