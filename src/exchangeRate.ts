export const EXCHANGE_RATE_URL='https://api.frankfurter.dev/v2/rate/USD/KRW';
export interface ExchangeRateQuote {usdKrw:number;date:string;fetchedAt:number}
export function parseExchangeRateQuote(data:unknown,fetchedAt=Date.now()):ExchangeRateQuote {
  const q=data as {base?:unknown;quote?:unknown;rate?:unknown;date?:unknown}|null;
  if(!q||q.base!=='USD'||q.quote!=='KRW'||typeof q.rate!=='number'||!Number.isFinite(q.rate)||q.rate<=0||typeof q.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(q.date))throw new Error('환율 응답 형식이 올바르지 않습니다.');
  const date=new Date(q.date+'T00:00:00Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==q.date||!Number.isFinite(fetchedAt))throw new Error('환율 기준일이 올바르지 않습니다.');
  return {usdKrw:q.rate,date:q.date,fetchedAt};
}
export async function fetchExchangeRate(signal?:AbortSignal):Promise<ExchangeRateQuote> {
  const response=await fetch(EXCHANGE_RATE_URL,{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('환율 조회 실패 (HTTP '+response.status+')');
  return parseExchangeRateQuote(await response.json());
}
