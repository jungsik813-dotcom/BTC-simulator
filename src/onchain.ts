export const supplyModes = [
  { key: 'classic', label: 'Classic' },
  { key: 'cointime', label: 'Cointime Weighted' },
  { key: 'exclude5', label: '5년 이상 제외 · 실험용' },
  { key: 'exclude7', label: '7년 이상 제외 · 실험용' },
  { key: 'exclude10', label: '10년 이상 제외 · 실험용' },
] as const;
export type SupplyMode = typeof supplyModes[number]['key'];
export interface OnchainSnapshot {
  marketCapUsd: number;
  realizedCapUsd: number;
  thermocapUsd: number;
  circulatingSupply: number;
  liveliness: number;
  spotPriceUsd: number;
  excluded5: number;
  excluded7: number;
  excluded10: number;
}
export const ONCHAIN_SOURCE = 'https://studio.glassnode.com/charts/9b030e1f-e9ea-4cfb-514e-8e1396133ca7?a=BTC';
export function validateOnchainSnapshot(s: OnchainSnapshot): void {
  if (Object.values(s).some(v => !Number.isFinite(v))) throw new Error('온체인 입력값을 유효한 숫자로 입력해 주세요.');
  if (s.realizedCapUsd <= 0 || s.spotPriceUsd <= 0) throw new Error('Realized Cap과 Spot Price는 0보다 커야 합니다.');
  if (s.marketCapUsd < 0 || s.thermocapUsd < 0 || s.thermocapUsd > s.realizedCapUsd) throw new Error('시가총액은 음수일 수 없으며 Thermocap은 0~Realized Cap 범위여야 합니다.');
  if (s.circulatingSupply <= 0 || s.circulatingSupply > 21_000_000) throw new Error('유통 공급량은 0보다 크고 21,000,000 BTC 이하여야 합니다.');
  if (s.liveliness < 0 || s.liveliness > 1) throw new Error('Liveliness는 0~1 범위여야 합니다.');
  if ([s.excluded5, s.excluded7, s.excluded10].some(v => v < 0 || v > s.circulatingSupply)) throw new Error('제외 공급량은 0~유통 공급량 범위여야 합니다.');
  if (s.excluded5 < s.excluded7 || s.excluded7 < s.excluded10) throw new Error('제외 공급량은 5년 이상 ≥ 7년 이상 ≥ 10년 이상 순서여야 합니다.');
}
export function selectedActiveSupply(s: OnchainSnapshot, mode: SupplyMode): number {
  switch (mode) {
    case 'classic': return s.circulatingSupply;
    case 'cointime': return s.circulatingSupply * s.liveliness;
    case 'exclude5': return s.circulatingSupply - s.excluded5;
    case 'exclude7': return s.circulatingSupply - s.excluded7;
    case 'exclude10': return s.circulatingSupply - s.excluded10;
    default: throw new Error('공급량 비교 방식을 확인해 주세요.');
  }
}
export function calculateOnchain(s: OnchainSnapshot, mode: SupplyMode) {
  validateOnchainSnapshot(s);
  const classicMvrv = s.marketCapUsd / s.realizedCapUsd;
  const realizedPrice = s.realizedCapUsd / s.circulatingSupply;
  const realizedPriceDifferencePct = (realizedPrice / s.spotPriceUsd - 1) * 100;
  const investorCap = s.realizedCapUsd - s.thermocapUsd;
  const activeSupply = s.circulatingSupply * s.liveliness;
  const trueMarketMean = activeSupply > 0 ? investorCap / activeSupply : null;
  const aviv = trueMarketMean !== null && trueMarketMean > 0 ? s.spotPriceUsd / trueMarketMean : null;
  const comparisonSupply = selectedActiveSupply(s, mode);
  const comparisonCostBasis = comparisonSupply > 0 ? investorCap / comparisonSupply : null;
  const comparisonRatio = comparisonCostBasis !== null && comparisonCostBasis > 0 ? s.spotPriceUsd / comparisonCostBasis : null;
  const result = { classicMvrv, realizedPrice, realizedPriceDifferencePct, investorCap, activeSupply, trueMarketMean, aviv, comparisonSupply, comparisonCostBasis, comparisonRatio };
  if (Object.values(result).some(v => v !== null && !Number.isFinite(v))) throw new Error('온체인 계산 범위를 벗어났습니다. 입력값의 크기를 확인해 주세요.');
  return result;
}
