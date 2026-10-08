import { simulate, type Assumptions } from './simulation.ts';

// Default growth assumption; prices are anchored to the user's starting price.
export const DEFAULT_POWER_LAW_BETA = 5.845;
const GENESIS_UTC = Date.UTC(2009, 0, 3), DAY_MS = 86400000;

export function parsePowerLawBeta(value: string): number {
  const beta = Number(value);
  if (value.trim() === '' || !Number.isFinite(beta) || beta < 0) throw new Error('Power Law 베타는 0 이상의 숫자로 입력하세요.');
  return beta;
}

// Annual snapshots use January 1 consistently, including the starting snapshot.
export function daysSinceGenesis(year: number): number {
  if (!Number.isInteger(year) || year < 2010 || year > 2200) throw new Error('Power Law는 2010~2200년 범위에서 사용할 수 있습니다.');
  return (Date.UTC(year, 0, 1) - GENESIS_UTC) / DAY_MS;
}

export function powerLawPrices(a: Assumptions, beta: number): Record<number, number> {
  parsePowerLawBeta(String(beta));
  if (!Number.isFinite(a.btcPrice) || a.btcPrice <= 0) throw new Error('BTC 가격은 0보다 커야 합니다.');
  const startDays = daysSinceGenesis(a.startYear);
  if (!Number.isInteger(a.endYear) || a.endYear < a.startYear || a.endYear > 2200) throw new Error('Power Law 연도 범위를 확인하세요.');
  const prices: Record<number, number> = {};
  for (let year = a.startYear; year <= a.endYear; year++) {
    // P(t) = P0 * (t / t0)^beta. Recalibrating A = P0 / t0^beta
    // keeps the starting price unchanged when beta changes.
    const price = a.btcPrice * (daysSinceGenesis(year) / startDays) ** beta;
    if (!Number.isFinite(price) || price <= 0) throw new Error('Power Law 가격이 계산 범위를 벗어났습니다. 베타나 기간을 줄여 주세요.');
    prices[year] = price;
  }
  return prices;
}

export function simulatePowerLaw(a: Assumptions, beta: number) {
  // The same price path determines purchases and portfolio valuations.
  return simulate(a, powerLawPrices(a, beta));
}
