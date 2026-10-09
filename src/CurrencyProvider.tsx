import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchExchangeRate, type ExchangeRateQuote } from './exchangeRate';
import { CURRENCY_STORAGE_KEY, currencyDisplay, type DisplayCurrency } from './currency';
import './currency.css';
const CurrencyControlsContext=createContext<ReactNode>(null);
export function CurrencyToggle(){return useContext(CurrencyControlsContext);}
const CurrencyContext=createContext(currencyDisplay('KRW',null));
export const useCurrency=()=>useContext(CurrencyContext);
export function CurrencyProvider({children,initialCurrency,initialQuote}:{children:ReactNode;initialCurrency?:DisplayCurrency;initialQuote?:ExchangeRateQuote}) {
  const [currency,setCurrency]=useState<DisplayCurrency>(()=>{if(initialCurrency)return initialCurrency;try{return localStorage.getItem(CURRENCY_STORAGE_KEY)==='USD'?'USD':'KRW'}catch{return 'KRW'}});
  const [quote,setQuote]=useState<ExchangeRateQuote|null>(initialQuote??null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const requestRef=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(requestRef.current)return;
    const controller=new AbortController();requestRef.current=controller;setLoading(true);
    try{const next=await fetchExchangeRate(controller.signal);if(!controller.signal.aborted){setQuote(next);setError('');}}
    catch{if(!controller.signal.aborted)setError('환율 조회에 실패했습니다.');}
    finally{if(requestRef.current===controller){requestRef.current=null;if(!controller.signal.aborted)setLoading(false);}}
  },[]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5*60*1000);const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};window.addEventListener('focus',onVisible);document.addEventListener('visibilitychange',onVisible);return()=>{clearInterval(timer);window.removeEventListener('focus',onVisible);document.removeEventListener('visibilitychange',onVisible);requestRef.current?.abort();requestRef.current=null;};},[refresh]);
  useEffect(()=>{try{localStorage.setItem(CURRENCY_STORAGE_KEY,currency)}catch{}},[currency]);
  function select(next:DisplayCurrency){setCurrency(next);void refresh();}
  const display=currencyDisplay(currency,quote?.usdKrw??null);
  const controls=<aside className="currency-controls" aria-label="표시 통화와 현재 환율">
    <div className="currency-controls-top"><span>표시 통화</span><div className="currency-switch" role="group" aria-label="원화 달러 전환"><button type="button" aria-pressed={currency==='KRW'} onClick={()=>select('KRW')}>원화 KRW</button><button type="button" aria-pressed={currency==='USD'} onClick={()=>select('USD')}>달러 USD</button></div></div>
    <div className="currency-rate"><span>{quote?'1 USD = '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(quote.usdKrw)+'원':error?'환율 확인 필요':'환율 조회 중'}</span><button type="button" onClick={()=>void refresh()} disabled={loading} aria-label="현재 환율 새로고침">{loading?'조회 중':'새로고침'}</button></div>
    <small>{quote?'최신 고시 · '+quote.date+' 기준 · 5분마다 자동 조회':'최신 고시 환율을 자동 조회합니다.'} · <a href="https://frankfurter.dev/ko/" target="_blank" rel="noreferrer">Frankfurter</a></small>
    {error&&<p className="currency-error" role="status">{error} {quote?'마지막 조회 환율을 사용 중입니다.':'달러 금액을 표시할 수 없습니다.'}</p>}
  </aside>;
  return <CurrencyContext.Provider value={display}><CurrencyControlsContext.Provider value={controls}>{children}</CurrencyControlsContext.Provider></CurrencyContext.Provider>;
}
