import { defaults, simulate, type Assumptions } from './simulation.ts';
import { defaultTamAssumptions, validateTamAssumptions, type TamAssumptions, type TamAssetKey } from './tam.ts';
import { defaultPowerLaw, validatePowerLaw, type PowerLawAssumptions } from './powerLaw.ts';
import { decodeOnchainSettings, defaultOnchainSettings, type OnchainSettings } from './onchainInput.ts';

import { decodeMonteCarloSettings, defaultMonteCarloSettings, type MonteCarloSettings } from './monteCarloSettings.ts';

import { defaultTamAdoptionInputs, parseTamAdoptionInputs, type TamAdoptionInputs } from './tamAdoptionSettings.ts';

export type Inputs = Record<keyof Assumptions, string>;
export type TamInputs = Record<TamAssetKey, Record<keyof TamAssumptions[TamAssetKey], string>>;
export type BtcModel = 'cagr' | 'tam';
export type PowerLawInputs = Record<keyof PowerLawAssumptions, string>;
export interface SavedSettings { inputs: Inputs; tamInputs: TamInputs; tamAdoptionInputs:TamAdoptionInputs; powerLawInputs: PowerLawInputs; onchainSettings: OnchainSettings; monteCarloSettings: MonteCarloSettings; autoPrice: boolean; btcModel: BtcModel }
export const STORAGE_KEY = 'asset-simulator.settings.v2';
export const LEGACY_STORAGE_KEY = 'asset-simulator.settings.v1';
export const defaultInputs = (): Inputs => Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, String(value)])) as Inputs;
export const defaultTamInputs = (): TamInputs => Object.fromEntries(Object.entries(defaultTamAssumptions).map(([key, values]) => [key, Object.fromEntries(Object.entries(values).map(([field, value]) => [field, String(value)]))])) as TamInputs;
export const defaultPowerLawInputs = (): PowerLawInputs => Object.fromEntries(Object.entries(defaultPowerLaw).map(([key, value]) => [key, String(value)])) as PowerLawInputs;
export function parsePowerLawInputs(inputs: PowerLawInputs): PowerLawAssumptions {
  const result = {} as PowerLawAssumptions;
  for (const key of Object.keys(defaultPowerLaw) as (keyof PowerLawAssumptions)[]) {
    if (typeof inputs[key] !== 'string' || inputs[key].trim() === '') throw new Error('Power Law 가정을 모두 입력해 주세요.');
    result[key] = Number(inputs[key]);
  }
  validatePowerLaw(result);
  return result;
}
export function parseInputs(inputs: Inputs): Assumptions {
  if (Object.values(inputs).some(value => value.trim() === '')) throw new Error('비어 있는 입력값을 채워 주세요.');
  const assumptions = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, Number(value)])) as unknown as Assumptions;
  simulate(assumptions);
  return assumptions;
}
export function parseTamInputs(inputs: TamInputs): TamAssumptions {
  const result = {} as TamAssumptions;
  for (const [key, values] of Object.entries(inputs) as [TamAssetKey, TamInputs[TamAssetKey]][]) {
    if (Object.values(values).some(value => value.trim() === '')) throw new Error('TAM 가정의 비어 있는 입력값을 채워 주세요.');
    result[key] = Object.fromEntries(Object.entries(values).map(([field, value]) => [field, Number(value)])) as unknown as TamAssumptions[TamAssetKey];
  }
  validateTamAssumptions(result);
  return result;
}
export function decodeSettings(raw: string | null): SavedSettings {
  if (raw === null) return { tamAdoptionInputs:defaultTamAdoptionInputs(), inputs: defaultInputs(), tamInputs: defaultTamInputs(), powerLawInputs: defaultPowerLawInputs(), onchainSettings: defaultOnchainSettings(), monteCarloSettings: defaultMonteCarloSettings(), autoPrice: true, btcModel: 'cagr' };
  const data = JSON.parse(raw);
  if (!data || ![1, 2, 3, 4, 5, 6, 7].includes(data.version) || typeof data.autoPrice !== 'boolean' || !data.inputs) throw new Error('저장 형식 오류');
  const inputs = defaultInputs();
  for (const key of Object.keys(inputs) as (keyof Assumptions)[]) {
    if (typeof data.inputs[key] !== 'string') throw new Error('저장 입력값 오류');
    inputs[key] = data.inputs[key];
  }
  parseInputs(inputs);
  const tamAdoptionInputs:TamAdoptionInputs=data.version>=7?data.tamAdoptionInputs:defaultTamAdoptionInputs(Number(inputs.startYear),Number(inputs.endYear));
  parseTamAdoptionInputs(tamAdoptionInputs);
  if (data.version === 1) return { inputs, tamAdoptionInputs, tamInputs: defaultTamInputs(), powerLawInputs: defaultPowerLawInputs(), onchainSettings: defaultOnchainSettings(), monteCarloSettings: defaultMonteCarloSettings(), autoPrice: data.autoPrice, btcModel: 'cagr' };
  if ((data.btcModel !== 'cagr' && data.btcModel !== 'tam') || !data.tamInputs) throw new Error('저장된 BTC 모델 형식 오류');
  const tamInputs = defaultTamInputs();
  for (const key of Object.keys(tamInputs) as TamAssetKey[]) {
    for (const field of Object.keys(tamInputs[key]) as (keyof TamInputs[TamAssetKey])[]) {
      if (typeof data.tamInputs[key]?.[field] !== 'string') throw new Error('저장 TAM 입력값 오류');
      tamInputs[key][field] = data.tamInputs[key][field];
    }
  }
  parseTamInputs(tamInputs);
  const powerLawInputs = defaultPowerLawInputs();
  if (data.version >= 3) {
    for (const key of Object.keys(powerLawInputs) as (keyof PowerLawInputs)[]) {
      if (typeof data.powerLawInputs?.[key] !== 'string') throw new Error('저장된 Power Law 입력값 오류');
      powerLawInputs[key] = data.powerLawInputs[key];
    }
    parsePowerLawInputs(powerLawInputs);
  }
  const onchainSettings = data.version >= 4 ? decodeOnchainSettings(data.onchainSettings) : defaultOnchainSettings();
  const monteCarloSettings = data.version >= 5 ? decodeMonteCarloSettings(data.monteCarloSettings,data.version===5) : defaultMonteCarloSettings();
  return { inputs, tamInputs, tamAdoptionInputs, powerLawInputs, onchainSettings, monteCarloSettings, autoPrice: data.autoPrice, btcModel: data.btcModel };
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
