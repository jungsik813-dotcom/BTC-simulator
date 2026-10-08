export interface PowerLawAssumptions {
  exponent: number;
  log10Intercept: number;
  supportMultiplier: number;
  resistanceMultiplier: number;
  usdKrw: number;
}

// Burger (2019)의 중앙 회귀 계수. 배수와 원화 환산율은 앱의 설명용 가정이다.
export const defaultPowerLaw: PowerLawAssumptions = {
  exponent: 5.84509376, log10Intercept: -17.01593313,
  supportMultiplier: 0.5, resistanceMultiplier: 2, usdKrw: 1400,
};
export const POWER_LAW_SOURCE = 'https://hcburger.com/blog/powerlaw/';
const GENESIS_UTC = Date.UTC(2009, 0, 3);
const DAY_MS = 86_400_000;

export interface PowerLawYearResult {
  year: number; days: number;
  supportUsd: number; fairUsd: number; resistanceUsd: number;
  support: number; fair: number; resistance: number;
}

export function daysSinceGenesis(date: Date): number {
  const days = (date.getTime() - GENESIS_UTC) / DAY_MS;
  if (!Number.isFinite(days) || days <= 0) throw new Error('Power Law 날짜는 2009-01-03 이후여야 합니다.');
  return days;
}

export function validatePowerLaw(a: PowerLawAssumptions): void {
  if (![a.exponent, a.log10Intercept, a.supportMultiplier, a.resistanceMultiplier, a.usdKrw].every(Number.isFinite)) throw new Error('Power Law 가정을 모두 숫자로 입력해 주세요.');
  if (a.exponent <= 0) throw new Error('Power Law 지수 β는 0보다 커야 합니다.');
  if (a.supportMultiplier <= 0 || a.supportMultiplier > 1) throw new Error('지지 배수는 0보다 크고 1 이하여야 합니다.');
  if (a.resistanceMultiplier < 1) throw new Error('저항 배수는 1 이상이어야 합니다.');
  if (a.usdKrw <= 0) throw new Error('고정 USD/KRW 환산율은 0보다 커야 합니다.');
}

export function calculatePowerLawYear(year: number, a: PowerLawAssumptions): PowerLawYearResult {
  validatePowerLaw(a);
  if (!Number.isInteger(year) || year < 2009 || year > 2200) throw new Error('Power Law 연도는 2009~2200 범위여야 합니다.');
  const days = daysSinceGenesis(new Date(Date.UTC(year, 11, 31)));
  const fairUsd = 10 ** (a.log10Intercept + a.exponent * Math.log10(days));
  const supportUsd = fairUsd * a.supportMultiplier, resistanceUsd = fairUsd * a.resistanceMultiplier;
  const fair = fairUsd * a.usdKrw, support = supportUsd * a.usdKrw, resistance = resistanceUsd * a.usdKrw;
  if (![fairUsd, supportUsd, resistanceUsd, fair, support, resistance].every(v => Number.isFinite(v) && v > 0)) throw new Error('Power Law 계산 범위를 벗어났습니다. 계수나 환산율을 줄여 주세요.');
  return { year, days, fairUsd, supportUsd, resistanceUsd, fair, support, resistance };
}

export function calculatePowerLawRange(startYear: number, endYear: number, a: PowerLawAssumptions): PowerLawYearResult[] {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < 2009 || endYear > 2200 || endYear < startYear) throw new Error('Power Law 연도 범위를 확인해 주세요.');
  return Array.from({ length: endYear - startYear + 1 }, (_, i) => calculatePowerLawYear(startYear + i, a));
}
