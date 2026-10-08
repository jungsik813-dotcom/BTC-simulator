import { validateOnchainSnapshot, type OnchainSnapshot, type SupplyMode, supplyModes } from './onchain.ts';

// API가 생겨도 계산 함수에 동일한 OnchainSnapshot을 전달할 수 있도록 입력 변환을 분리한다.
export const onchainExample = {
  marketCapBillionUsd: '2000', realizedCapBillionUsd: '1000', thermocapBillionUsd: '100',
  circulatingSupply: '20000000', liveliness: '0.6', spotPriceUsd: '100000',
  excluded5: '4000000', excluded7: '3000000', excluded10: '2000000',
};
export type OnchainInputs = Record<keyof typeof onchainExample, string>;
export type MarketCapSource = 'spot' | 'manual';
export interface OnchainSettings { inputs: OnchainInputs; supplyMode: SupplyMode; marketCapSource: MarketCapSource }
export const defaultOnchainSettings = (): OnchainSettings => ({ inputs: { ...onchainExample }, supplyMode: 'cointime', marketCapSource: 'spot' });

export function parseOnchainInputs(inputs: OnchainInputs, marketCapSource: MarketCapSource): OnchainSnapshot {
  if (marketCapSource !== 'spot' && marketCapSource !== 'manual') throw new Error('시가총액 입력 방식을 확인해 주세요.');
  const values = {} as Record<keyof OnchainInputs, number>;
  for (const key of Object.keys(onchainExample) as (keyof OnchainInputs)[]) {
    if (key === 'marketCapBillionUsd' && marketCapSource === 'spot') { values[key] = 0; continue; }
    if (typeof inputs[key] !== 'string' || inputs[key].trim() === '') throw new Error('온체인 가정을 모두 입력해 주세요.');
    values[key] = Number(inputs[key]);
    if (!Number.isFinite(values[key])) throw new Error('온체인 입력값을 숫자로 입력해 주세요.');
  }
  if (values.marketCapBillionUsd < 0) throw new Error('직접 입력한 시가총액은 음수일 수 없습니다.');
  const snapshot: OnchainSnapshot = {
    marketCapUsd: marketCapSource === 'spot' ? values.spotPriceUsd * values.circulatingSupply : values.marketCapBillionUsd * 1e9,
    realizedCapUsd: values.realizedCapBillionUsd * 1e9,
    thermocapUsd: values.thermocapBillionUsd * 1e9,
    circulatingSupply: values.circulatingSupply, liveliness: values.liveliness, spotPriceUsd: values.spotPriceUsd,
    excluded5: values.excluded5, excluded7: values.excluded7, excluded10: values.excluded10,
  };
  validateOnchainSnapshot(snapshot);
  return snapshot;
}
export function decodeOnchainSettings(raw: unknown): OnchainSettings {
  if (!raw || typeof raw !== 'object') throw new Error('저장된 온체인 설정 형식 오류');
  const data = raw as Partial<OnchainSettings>;
  if (!supplyModes.some(mode => mode.key === data.supplyMode) || (data.marketCapSource !== 'spot' && data.marketCapSource !== 'manual') || !data.inputs) throw new Error('저장된 온체인 설정 형식 오류');
  const settings = defaultOnchainSettings();
  for (const key of Object.keys(onchainExample) as (keyof OnchainInputs)[]) {
    if (typeof data.inputs[key] !== 'string') throw new Error('저장된 온체인 입력값 오류');
    settings.inputs[key] = data.inputs[key];
  }
  settings.supplyMode = data.supplyMode as SupplyMode;
  settings.marketCapSource = data.marketCapSource;
  parseOnchainInputs(settings.inputs, settings.marketCapSource);
  return settings;
}
