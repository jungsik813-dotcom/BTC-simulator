import { defaults, simulate, type Assumptions } from './simulation.ts';
import { decodeMonteCarloSettings, defaultMonteCarloSettings, type MonteCarloSettings } from './monteCarloSettings.ts';

import { DEFAULT_POWER_LAW_BETA, parsePowerLawBeta } from './powerLaw.ts';

export type Inputs=Record<keyof Assumptions,string>;
export interface SavedSettings {inputs:Inputs;monteCarloSettings:MonteCarloSettings;autoPrice:boolean;powerLawBeta:string}
export const STORAGE_KEY='asset-simulator.settings.v2';
export const LEGACY_STORAGE_KEY='asset-simulator.settings.v1';
export const defaultInputs=():Inputs=>Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,String(value)])) as Inputs;
export function parseInputs(inputs:Inputs):Assumptions {
  if(Object.values(inputs).some(value=>value.trim()===''))throw new Error('비어 있는 입력값을 채워 주세요.');
  const assumptions=Object.fromEntries(Object.entries(inputs).map(([key,value])=>[key,Number(value)])) as unknown as Assumptions;
  simulate(assumptions);return assumptions;
}
export function decodeSettings(raw:string|null):SavedSettings {
  if(raw===null)return {inputs:defaultInputs(),monteCarloSettings:defaultMonteCarloSettings(),autoPrice:true,powerLawBeta:String(DEFAULT_POWER_LAW_BETA)};
  const data=JSON.parse(raw);
  if(!data||![1,2,3,4,5,6,7,8,9,10].includes(data.version)||typeof data.autoPrice!=='boolean'||!data.inputs)throw new Error('저장 형식 오류');
  const inputs=defaultInputs();
  for(const key of Object.keys(inputs) as (keyof Assumptions)[]){
    if(typeof data.inputs[key]!=='string')throw new Error('저장 입력값 오류');
    inputs[key]=data.inputs[key];
  }
  parseInputs(inputs);
  const monteCarloSettings=data.version>=5?decodeMonteCarloSettings(data.monteCarloSettings,data.version===5):defaultMonteCarloSettings();
  const powerLawBeta=data.version>=10?data.powerLawBeta:String(DEFAULT_POWER_LAW_BETA);
  if(typeof powerLawBeta!=='string')throw new Error('저장된 Power Law 베타 형식 오류');
  parsePowerLawBeta(powerLawBeta);
  return {inputs,monteCarloSettings,autoPrice:data.autoPrice,powerLawBeta};
}
export function formatMoney(value: number, currency: 'KRW' | 'USD' = 'KRW'): string {
  return `${new Intl.NumberFormat(currency === 'KRW' ? 'ko-KR' : 'en-US', { minimumFractionDigits: currency === 'USD' ? 2 : 0, maximumFractionDigits: currency === 'USD' ? 2 : 0 }).format(value)} ${currency}`;
}
export function compactKrw(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 100000000) return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(value / 100000000)}억 원`;
  if (absolute >= 10000) return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value / 10000)}만 원`;
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)}원`;
}
