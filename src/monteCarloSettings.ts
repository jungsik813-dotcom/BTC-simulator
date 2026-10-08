import { defaultMonteCarlo, MONTE_CARLO_PATHS, validateMonteCarlo, type MonteCarloAssumptions, type MonteCarloRequest } from './monteCarlo.ts';
import { defaults, type Assumptions } from './simulation.ts';
import { REGIMES, validateMarket } from './marketModel.ts';
import { defaultMarketSettings, parseMarketSettings, type MarketSettings } from './marketSettings.ts';

type NumericKey=Exclude<keyof MonteCarloAssumptions,'limitBtcReturns'|'paths'|'btcMean'|'stockMean'|'inflationMean'>;
export interface MonteCarloSettings {inputs:Record<NumericKey,string>;limitBtcReturns:boolean;market:MarketSettings}
export function defaultMonteCarloSettings():MonteCarloSettings {
  const {limitBtcReturns,paths,btcMean,stockMean,inflationMean,...numbers}=defaultMonteCarlo;
  return {inputs:Object.fromEntries(Object.entries(numbers).map(([key,value])=>[key,String(value)])) as Record<NumericKey,string>,limitBtcReturns,market:defaultMarketSettings()};
}
export function parseMonteCarloSettings(settings:MonteCarloSettings,portfolio:Assumptions=defaults):MonteCarloAssumptions {
  const numbers={} as Record<NumericKey,number>;
  for(const key of Object.keys(defaultMonteCarloSettings().inputs) as NumericKey[]){
    const value=settings.inputs?.[key];
    if(typeof value!=='string'||value.trim()==='')throw new Error('Monte Carlo 입력값을 모두 채워 주세요.');
    numbers[key]=Number(value);
  }
  const result={...numbers,paths:MONTE_CARLO_PATHS,btcMean:portfolio.btcReturn,stockMean:portfolio.stockReturn,inflationMean:portfolio.inflation,limitBtcReturns:settings.limitBtcReturns};
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
  result.limitBtcReturns=data.limitBtcReturns;
  result.market=structuredClone(data.market);
  return result;
}
export function makeMonteCarloRequest(portfolio:Assumptions,settings:MonteCarloSettings):MonteCarloRequest {
  const market=linkedMarketAssumptions(settings.market,portfolio);
  return {portfolio:{...portfolio},assumptions:parseMonteCarloSettings(settings,portfolio),market};
}
export function linkedMarketAssumptions(settings:MarketSettings,portfolio:Assumptions) {
  const market=parseMarketSettings(settings),baseline={...market.regimes.normal};
  for(const state of REGIMES){
    market.regimes[state].btcMean=state==='normal'?portfolio.btcReturn:((1+portfolio.btcReturn/100)*(1+market.regimes[state].btcMean/100)/(1+baseline.btcMean/100)-1)*100;
    market.regimes[state].stockMean=state==='normal'?portfolio.stockReturn:((1+portfolio.stockReturn/100)*(1+market.regimes[state].stockMean/100)/(1+baseline.stockMean/100)-1)*100;
  }
  validateMarket(market);return market;
}
