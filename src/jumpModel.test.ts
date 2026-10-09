import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JUMP_CALIBRATION} from './jumpCalibration.ts';
import {decomposeJumps,poissonCount,sampleCompoundJumps,defaultMarketAssumptions} from './marketModel.ts';
import {seededUniform,standardNormal,runMonteCarlo,defaultMonteCarlo} from './monteCarlo.ts';
import {defaults as appDefaults} from './simulation.ts';
// Positive holdings fixture keeps return and contribution checks meaningful.
const defaults={...appDefaults,btcQuantity:1,monthlyBtc:500000};
const close=(a:number,b:number,t=.02)=>assert.ok(Math.abs(a-b)<=t*Math.max(.01,Math.abs(b)),a+' != '+b);
test('자료 기간·사건 수·±5% 기준을 보존한다',()=>{
 assert.equal(JUMP_CALIBRATION.all.observations,1461);assert.equal(JUMP_CALIBRATION.all.crashLogMoves.length,36);assert.equal(JUMP_CALIBRATION.all.maniaLogMoves.length,47);
 for(const c of Object.values(JUMP_CALIBRATION)){
  assert.ok(c.crashLogMoves.every(x=>Math.expm1(x)<=-.05));assert.ok(c.maniaLogMoves.every(x=>Math.expm1(x)>=.05));
 }
});
test('포아송 횟수의 평균·분산과 0·복수 발생을 검증한다',()=>{
 const random=seededUniform(42),n=100000;let sum=0,squares=0;
 for(let i=0;i<n;i++){const x=poissonCount(9,random);sum+=x;squares+=x*x;}
 close(sum/n,9);close(squares/n-(sum/n)**2,9);
 assert.equal(poissonCount(0,random),0);assert.throws(()=>poissonCount(-1,random));
});
test('같은 해 복수 급락·급등이 발생하고 빈도가 자료와 맞는다',()=>{
 const c=JUMP_CALIBRATION.all,plan=decomposeJumps(10,49,c,1),random=seededUniform(72),n=100000;
 let down=0,up=0,both=0,multiple=0;
 for(let i=0;i<n;i++){const j=sampleCompoundJumps(plan,random);down+=j.crashes;up+=j.manias;if(j.crashes&&j.manias)both++;if(j.crashes>1||j.manias>1)multiple++;}
 close(down/n,c.crashAnnualRate);close(up/n,c.maniaAnnualRate);assert.ok(both>n*.9);assert.ok(multiple>n*.9);
});
test('Jump를 분리해도 총 로그수익률 평균·분산을 보존한다',()=>{
 const market=defaultMarketAssumptions(),n=100000;
 for(const state of ['bull','bear'] as const){
  const r=market.regimes[state],plan=decomposeJumps(r.btcMean,r.btcVolatility,JUMP_CALIBRATION[state],1);
  const targetVariance=(r.btcVolatility/100)**2,targetMean=Math.log1p(r.btcMean/100)-targetVariance/2;
  close(plan.residualVariance+plan.jumpVariance,targetVariance,1e-12);close(plan.residualLogMean+plan.jumpLogMean,targetMean,1e-12);
  const random=seededUniform(81),z=standardNormal(random);let sum=0,sq=0;
  for(let i=0;i<n;i++){const x=plan.residualLogMean+Math.sqrt(plan.residualVariance)*z()+sampleCompoundJumps(plan,random).logMove;sum+=x;sq+=x*x;}
  close(sum/n,targetMean);close(sq/n-(sum/n)**2,targetVariance);
 }
 assert.throws(()=>decomposeJumps(10,0,JUMP_CALIBRATION.all,1),/Jump/);
});
test('빈도 0은 Jump 없는 모형과 일치하고 시드로 결과를 재현한다',()=>{
 const market=defaultMarketAssumptions(),portfolio={...defaults,endYear:2027,monthlyBtc:0};market.jumpIntensity=0;
 const req={portfolio,assumptions:{...defaultMonteCarlo},market};
 assert.deepEqual(runMonteCarlo(req),runMonteCarlo({...req,market:{...market,jumpEnabled:false}}));
 market.jumpIntensity=1;
 assert.deepEqual(runMonteCarlo(req),runMonteCarlo(req));
 const result=runMonteCarlo(req);assert.ok(result.diagnostics.crashes>100000);assert.ok(result.diagnostics.manias>100000);
});
