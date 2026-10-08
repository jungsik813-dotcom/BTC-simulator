import { test } from 'node:test';
import assert from 'node:assert/strict';
import { btcSupplyAtYear, calculateTamRange, defaultTamAssumptions, defaultTamAdoption, adoptionProgress } from './tam.ts';
import { defaults, simulate } from './simulation.ts';
import { defaultMonteCarloSettings, makeMonteCarloRequest } from './monteCarloSettings.ts';
import { runMonteCarlo } from './monteCarlo.ts';
import { calculateValuationComparison } from './valuationComparison.ts';
import { decodeSettings } from './settings.ts';
import { defaultTamAdoptionInputs } from './tamAdoptionSettings.ts';
const options={initialPrice:1e8,adoption:defaultTamAdoption};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=Math.max(1,Math.abs(b))*1e-10,`${a} != ${b}`);

test('목표·시장 규모·경쟁 비율·시점 변경에도 출발 가격과 시총은 고정된다',()=>{
  for(const change of [()=>{},(a:typeof defaultTamAssumptions)=>{a.gold.penetration=80},(a:typeof defaultTamAssumptions)=>{a.bonds.marketSizeTrillionKrw*=2;a.gold.growthRate=20},(a:typeof defaultTamAssumptions)=>{a.cash.competingShare=80}]){
    const a=structuredClone(defaultTamAssumptions);change(a);
    const first=calculateTamRange(2026,2045,a,options)[0];
    assert.equal(first.btcPrice,1e8);assert.equal(first.marketCap,1e8*btcSupplyAtYear(2026));
    close(first.contributions.reduce((sum,c)=>sum+c.capturedValue,0),first.marketCap);
  }
  assert.equal(calculateTamRange(2026,2055,defaultTamAssumptions,{...options,adoption:{...defaultTamAdoption,targetYear:2055,midpointYear:2040}})[0].btcPrice,1e8);
});
test('S곡선은 양 끝에서 정확히 0과 1이고 중간에 가속·이후 둔화한다',()=>{
  const a=defaultTamAdoption;
  assert.equal(adoptionProgress(2026,2026,a),0);assert.equal(adoptionProgress(2045,2026,a),1);assert.equal(adoptionProgress(2055,2026,a),1);
  const values=Array.from({length:20},(_,i)=>adoptionProgress(2026+i,2026,a));
  assert.ok(values.every((v,i)=>v>=0&&v<=1&&(i===0||v>=values[i-1])));
  assert.ok(values[10]-values[9]>(values[1]-values[0])*5);assert.ok(values[10]-values[9]>(values[19]-values[18])*5);
  close(adoptionProgress(2035.5,2026,a),.5);close(adoptionProgress(2030,2026,{...a,curve:'linear'}),4/19);
});
test('채택 시점을 늦추면 중간 채택이 늦어지고 최종 목표는 동일하다',()=>{
  const early=calculateTamRange(2026,2045,defaultTamAssumptions,{...options,adoption:{...defaultTamAdoption,midpointYear:2031}});
  const late=calculateTamRange(2026,2045,defaultTamAssumptions,{...options,adoption:{...defaultTamAdoption,midpointYear:2040}});
  assert.ok(early[8].adoptionProgress>late[8].adoptionProgress);assert.ok(early[8].btcPrice>late[8].btcPrice);assert.equal(early[19].btcPrice,late[19].btcPrice);
});
test('조회 기간을 늘려도 기존 경로가 변하지 않으며 목표 이후 시장은 계속 성장한다',()=>{
  const short=calculateTamRange(2026,2035,defaultTamAssumptions,options),long=calculateTamRange(2026,2055,defaultTamAssumptions,options);
  assert.deepEqual(short,long.slice(0,10));
  for(const row of long.slice(19))for(const c of row.contributions)close(c.penetration,defaultTamAssumptions[c.key].penetration);
  assert.ok(long.at(-1)!.btcPrice>long[19].btcPrice);
});
test('목표 변경은 첫해부터 전액 적용되지 않으며 목표 연도에 완전히 반영된다',()=>{
  const a=structuredClone(defaultTamAssumptions);a.gold.penetration=50;
  const before=calculateTamRange(2026,2045,defaultTamAssumptions,options),after=calculateTamRange(2026,2045,a,options);
  assert.equal(after[0].btcPrice,before[0].btcPrice);
  close(after[1].btcPrice-before[1].btcPrice,after[1].contributions[0].addressableMarket*.4*after[1].adoptionProgress/after[1].btcSupply);
  assert.ok(after[1].adoptionProgress<.02);close(after.at(-1)!.btcPrice,after.at(-1)!.targetBtcPrice);
});
test('축소·0 목표도 표시하고 비현실적인 출발 TAM과 시점을 검증한다',()=>{
  const a=structuredClone(defaultTamAssumptions);for(const value of Object.values(a)){value.penetration=0;value.growthRate=0;}
  const rows=calculateTamRange(2026,2045,a,options);assert.equal(rows[19].btcPrice,0);assert.ok(rows[1].btcPrice<rows[0].btcPrice);
  for(const value of Object.values(a))value.marketSizeTrillionKrw=0;
  assert.throws(()=>calculateTamRange(2026,2045,a,options),/경쟁 가능 TAM/);
  assert.throws(()=>calculateTamRange(2026,2045,defaultTamAssumptions,{...options,initialPrice:1e13}),/시가총액/);
  assert.throws(()=>calculateTamRange(2026,2045,defaultTamAssumptions,{...options,adoption:{...defaultTamAdoption,targetYear:2025}}));
});
test('포트폴리오·비교 차트·Monte Carlo가 같은 TAM 채택 경로를 사용한다',()=>{
  const settings=defaultMonteCarloSettings();settings.btcCenter='tam';settings.inputs.paths='1000';
  for(const key of ['btcVolatility','stockVolatility','inflationVolatility','fxVolatility'] as const)settings.inputs[key]='0';
  const adoption={...defaultTamAdoption,midpointYear:2032};const req=makeMonteCarloRequest(defaults,settings,defaultTamAssumptions,adoption);
  const comparison=calculateValuationComparison({...defaults,priceModel:'tam',tam:defaultTamAssumptions,tamAdoption:adoption,power:null,onchain:null,supplyMode:'cointime'});
  assert.deepEqual(req.btcCentersKrw,comparison.rows.map(r=>r.tam));
  const expected=simulate(defaults,Object.fromEntries(req.btcCentersKrw!.map((price,i)=>[2026+i,price]))),result=runMonteCarlo(req);
  result.rows.forEach((r,i)=>{close(r.nominal.p50,expected[i].nominal);close(r.real.p50,expected[i].real)});
});
test('기존 침투율을 목표로 보존해 이전하고 새 채택 설정을 복원한다',()=>{
  const s=decodeSettings(null);s.inputs.endYear='2050';s.tamInputs.gold.penetration='17';const {tamAdoptionInputs,...legacy}=s;
  const migrated=decodeSettings(JSON.stringify({version:6,...legacy}));
  assert.equal(migrated.tamInputs.gold.penetration,'17');assert.deepEqual(migrated.tamAdoptionInputs,defaultTamAdoptionInputs(2026,2050));
  migrated.tamAdoptionInputs.midpointYear='2038';assert.deepEqual(decodeSettings(JSON.stringify({version:7,...migrated})),migrated);
  assert.throws(()=>decodeSettings(JSON.stringify({version:7,...migrated,tamAdoptionInputs:{...migrated.tamAdoptionInputs,targetYear:''}})));
});
