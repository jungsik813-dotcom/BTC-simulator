export interface Assumptions {
  startYear: number; endYear: number; btcQuantity: number; btcPrice: number;
  stocks: number; cash: number; debt: number; monthlyBtc: number; monthlyStocks: number;
  btcReturn: number; stockReturn: number; debtRate: number; inflation: number;
}
export const defaults: Assumptions = {
  startYear: 2026, endYear: 2045, btcQuantity: 1, btcPrice: 100000000,
  stocks: 50000000, cash: 20000000, debt: 10000000, monthlyBtc: 500000,
  monthlyStocks: 500000, btcReturn: 10, stockReturn: 7, debtRate: 4, inflation: 2,
};
export interface YearResult {
  year: number; btcPrice: number; btcQuantity: number; btcValue: number;
  stocks: number; cash: number; debt: number; nominal: number; real: number;
}
export function simulate(a: Assumptions, btcPrices?:Readonly<Record<number,number>>): YearResult[] {
  if (Object.values(a).some(v => !Number.isFinite(v))) throw new Error('모든 입력값을 숫자로 입력해 주세요.');
  if (!Number.isInteger(a.startYear) || !Number.isInteger(a.endYear) || a.startYear < 1900 || a.endYear > 2200 || a.endYear < a.startYear) throw new Error('연도는 1900~2200 범위이며 종료 연도는 시작 연도 이후여야 합니다.');
  if (a.btcPrice <= 0 || a.btcReturn <= -100 || a.stockReturn < -100 || a.inflation <= -100) throw new Error('BTC 가격은 0보다 커야 하고 BTC 수익률·물가상승률은 -100%보다 커야 합니다. 주식 수익률은 -100% 이상이어야 합니다.');
  if ([a.btcQuantity, a.stocks, a.cash, a.debt, a.monthlyBtc, a.monthlyStocks, a.debtRate].some(v => v < 0)) throw new Error('자산, 투자금, 부채와 부채 연이율은 음수일 수 없습니다.');
  const rows: YearResult[] = [];
  let quantity = a.btcQuantity, stocks = a.stocks, debt = a.debt;
  for (let year = a.startYear; year <= a.endYear; year++) {
    const elapsed = year - a.startYear;
    const btcPrice = btcPrices?.[year] ?? a.btcPrice * (1 + a.btcReturn / 100) ** elapsed;
    if (!Number.isFinite(btcPrice) || btcPrice <= 0) throw new Error(`${year}년 BTC 가격이 올바르지 않습니다.`);
    if (elapsed > 0) {
      quantity += a.monthlyBtc * 12 / btcPrice;
      stocks = stocks * (1 + a.stockReturn / 100) + a.monthlyStocks * 12;
      debt *= 1 + a.debtRate / 100;
    }
    const btcValue = quantity * btcPrice;
    const nominal = btcValue + stocks + a.cash - debt;
    const real = nominal / (1 + a.inflation / 100) ** elapsed;
    if (![btcPrice, quantity, btcValue, stocks, debt, nominal, real].every(Number.isFinite) || btcPrice <= 0) throw new Error('가정값이 너무 커서 계산 범위를 벗어났습니다. 기간이나 수익률을 줄여 주세요.');
    rows.push({ year, btcPrice, btcQuantity: quantity, btcValue, stocks, cash: a.cash, debt, nominal, real });
  }
  return rows;
}
