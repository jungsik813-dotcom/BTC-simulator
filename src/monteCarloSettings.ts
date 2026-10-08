import { defaultMonteCarlo, validateMonteCarlo, type MonteCarloAssumptions, type MonteCarloRequest } from './monteCarlo.ts';
import { calculateTamRange, defaultTamAdoption, type TamAdoptionAssumptions, type TamAssumptions } from './tam.ts';
import type { Assumptions } from './simulation.ts';
import { defaultMarketSettings, parseMarketSettings, type MarketSettings } from './marketSettings.ts';

type NumericKey=Exclude<keyof MonteCarloAssumptions,'btcCenter'|'limitBtcReturns'>;
export interface MonteCarloSettings {inputs:Record<NumericKey,string>;btcCenter:'return'|'tam';limitBtcReturns:boolean;market:MarketSettings}
export function defaultMonteCarloSettings():MonteCarloSettings {
  const {btcCenter,limitBtcReturns,...numbers}=defaultMonteCarlo;
  return {inputs:Object.fromEntries(Object.entries(numbers).map(([key,value])=>[key,String(value)])) as Record<NumericKey,string>,btcCenter,limitBtcReturns,market:defaultMarketSettings()};
}
export function parseMonteCarloSettings(settings:MonteCarloSettings):MonteCarloAssumptions {
  const numbers={} as Record<NumericKey,number>;
  for(const key of Object.keys(defaultMonteCarloSettings().inputs) as NumericKey[]){
    const value=settings.inputs?.[key];
    if(typeof value!=='string'||value.trim()==='')throw new Error('Monte Carlo 입력값을 모두 채워 주세요.');
    numbers[key]=Number(value);
  }
  const result={...numbers,btcCenter:settings.btcCenter,limitBtcReturns:settings.limitBtcReturns};
  validateMonteCarlo(result);
  parseMarketSettings(settings.market);
  return result;
}
export function decodeMonteCarloSettings(raw:unknown,legacy=false):MonteCarloSettings {
  if(!raw||typeof raw!=='object')throw new Error('저장된 Monte Carlo 설정 형식 오류');
  const data={...raw,market:legacy?defaultMarketSettings():(raw as MonteCarloSettings).market} as MonteCarloSettings;
  parseMonteCarloSettings(data);
  const result=defaultMonteCarloSettings();
  for(const key of Object.keys(result.inputs) as NumericKey[])result.inputs[key]=data.inputs[key];
  result.btcCenter=data.btcCenter;result.limitBtcReturns=data.limitBtcReturns;
  result.market=structuredClone(data.market);
  return result;
}
export function makeMonteCarloRequest(portfolio:Assumptions,settings:MonteCarloSettings,tam?:TamAssumptions,adoption:TamAdoptionAssumptions=defaultTamAdoption):MonteCarloRequest {
  const assumptions=parseMonteCarloSettings(settings);
  let btcCentersKrw:number[]|undefined;
  if(assumptions.btcCenter==='tam'){
    if(!tam)throw new Error('TAM 가정을 확인해 주세요.');
    btcCentersKrw=calculateTamRange(portfolio.startYear,portfolio.endYear,tam,{initialPrice:portfolio.btcPrice,adoption}).map(row=>row.btcPrice);
  }
  return {portfolio:{...portfolio},assumptions,btcCentersKrw,market:parseMarketSettings(settings.market),...(assumptions.btcCenter==='tam'?{tamAdoption:{...adoption}}:{})};
}
