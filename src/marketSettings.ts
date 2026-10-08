import { defaultMarketAssumptions, REGIMES, validateMarket, type MarketAssumptions, type Regime, type RegimeAssumptions } from './marketModel.ts';
type Scalars='degreesOfFreedom'|'crashProbability'|'crashMagnitude'|'maniaProbability'|'maniaMagnitude';
export interface MarketSettings {
  distribution:MarketAssumptions['distribution'];regimeEnabled:boolean;initialRegime:Regime;jumpEnabled:boolean;
  inputs:Record<Scalars,string>;
  regimes:Record<Regime,Record<keyof RegimeAssumptions,string>>;
  transitions:Record<Regime,Record<Regime,string>>;
}
export function defaultMarketSettings():MarketSettings {
  const a=defaultMarketAssumptions();
  return {distribution:a.distribution,regimeEnabled:a.regimeEnabled,initialRegime:a.initialRegime,jumpEnabled:a.jumpEnabled,
    inputs:Object.fromEntries(['degreesOfFreedom','crashProbability','crashMagnitude','maniaProbability','maniaMagnitude'].map(k=>[k,String(a[k as Scalars])])) as MarketSettings['inputs'],
    regimes:Object.fromEntries(REGIMES.map(r=>[r,Object.fromEntries(Object.entries(a.regimes[r]).map(([k,v])=>[k,String(v)]))])) as MarketSettings['regimes'],
    transitions:Object.fromEntries(REGIMES.map(r=>[r,Object.fromEntries(REGIMES.map(k=>[k,String(a.transitions[r][k])]))])) as MarketSettings['transitions']};
}
function number(value:unknown):number {if(typeof value!=='string'||value.trim()==='')throw new Error('시장 모형 입력값을 모두 채워 주세요.');return Number(value)}
export function parseMarketSettings(s:MarketSettings):MarketAssumptions {
  if(!s||typeof s!=='object')throw new Error('시장 모형 설정 형식 오류');
  const a=defaultMarketAssumptions();
  a.distribution=s.distribution;a.regimeEnabled=s.regimeEnabled;a.initialRegime=s.initialRegime;a.jumpEnabled=s.jumpEnabled;
  for(const key of Object.keys(defaultMarketSettings().inputs) as Scalars[])a[key]=number(s.inputs?.[key]);
  for(const state of REGIMES){
    for(const key of Object.keys(a.regimes[state]) as (keyof RegimeAssumptions)[])a.regimes[state][key]=number(s.regimes?.[state]?.[key]);
    for(const target of REGIMES)a.transitions[state][target]=number(s.transitions?.[state]?.[target]);
  }
  validateMarket(a);return a;
}
