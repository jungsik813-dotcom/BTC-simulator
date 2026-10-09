import { decomposeJumps } from './marketModel.ts';
import { JUMP_CALIBRATION } from './jumpCalibration.ts';
import { defaultMonteCarlo, MONTE_CARLO_PATHS, validateMonteCarlo, type MonteCarloAssumptions, type MonteCarloRequest } from './monteCarlo.ts';
import { defaults, type Assumptions } from './simulation.ts';
import { defaultMarketSettings, parseMarketSettings, cleanMarketSettings, type MarketSettings } from './marketSettings.ts';

type NumericKey=Exclude<keyof MonteCarloAssumptions,'limitBtcReturns'|'paths'|'btcMean'>;
export interface MonteCarloSettings {inputs:Record<NumericKey,string>;limitBtcReturns:boolean;market:MarketSettings}
export function defaultMonteCarloSettings():MonteCarloSettings {
  const {limitBtcReturns,paths,btcMean,...numbers}=defaultMonteCarlo;
  return {inputs:Object.fromEntries(Object.entries(numbers).map(([key,value])=>[key,String(value)])) as Record<NumericKey,string>,limitBtcReturns,market:defaultMarketSettings()};
}
export function parseMonteCarloSettings(settings:MonteCarloSettings,portfolio:Assumptions=defaults):MonteCarloAssumptions {
  const numbers={} as Record<NumericKey,number>;
  for(const key of Object.keys(defaultMonteCarloSettings().inputs) as NumericKey[]){
    const value=settings.inputs?.[key];
    if(typeof value!=='string'||value.trim()==='')throw new Error('Monte Carlo 입력값을 모두 채워 주세요.');
    numbers[key]=Number(value);
  }
  const result={...numbers,paths:MONTE_CARLO_PATHS,btcMean:portfolio.btcReturn,limitBtcReturns:settings.limitBtcReturns};
  validateMonteCarlo(result);
  parseMarketSettings(settings.market);
  return result;
}
export function decodeMonteCarloSettings(raw:unknown,legacy=false,oldJump=false):MonteCarloSettings {
  if(!raw||typeof raw!=='object')throw new Error('저장된 Monte Carlo 설정 형식 오류');
  const data={...raw,market:legacy?defaultMarketSettings():(raw as MonteCarloSettings).market} as MonteCarloSettings;
  if(oldJump){
    data.market=structuredClone(data.market);
    data.market.inputs={...data.market.inputs,jumpIntensity:'1'};
    data.market.jumpEnabled=data.market.distribution==='normal';
  }
  if(oldJump&&data.market.jumpEnabled){
    try{
      parseMonteCarloSettings(data);
      if(!data.market.regimeEnabled)decomposeJumps(defaultMonteCarlo.btcMean,Number(data.inputs.btcVolatility),JUMP_CALIBRATION.all,1);
    }catch(error){
      if(error instanceof Error&&error.message.startsWith('총 변동성보다 Jump'))data.market.jumpEnabled=false;
      else throw error;
    }
  }
  parseMonteCarloSettings(data);
  const result=defaultMonteCarloSettings();
  for(const key of Object.keys(result.inputs) as NumericKey[])result.inputs[key]=data.inputs[key];
  result.limitBtcReturns=data.limitBtcReturns;
  result.market=cleanMarketSettings(data.market);
  return result;
}
export function makeMonteCarloRequest(portfolio:Assumptions,settings:MonteCarloSettings):MonteCarloRequest {
  const market=parseMarketSettings(settings.market);
  return {portfolio:{...portfolio},assumptions:parseMonteCarloSettings(settings,portfolio),market};
}
