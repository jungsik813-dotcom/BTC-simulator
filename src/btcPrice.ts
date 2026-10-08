export const BTC_PRICE_URL = 'https://api.upbit.com/v1/ticker?markets=KRW-BTC';

export async function fetchBtcPrice(signal?: AbortSignal): Promise<{ price: number; tradedAt: number }> {
  const response = await fetch(BTC_PRICE_URL, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`시세 조회 실패 (HTTP ${response.status})`);
  const data: unknown = await response.json();
  const ticker = Array.isArray(data) ? data[0] : undefined;
  if (ticker?.market !== 'KRW-BTC' || typeof ticker.trade_price !== 'number' || !Number.isFinite(ticker.trade_price) || ticker.trade_price <= 0 || typeof ticker.trade_timestamp !== 'number' || !Number.isFinite(ticker.trade_timestamp) || ticker.trade_timestamp <= 0) {
    throw new Error('시세 응답 형식이 올바르지 않습니다.');
  }
  return { price: ticker.trade_price, tradedAt: ticker.trade_timestamp };
}
