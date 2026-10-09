import { compactKrw, formatMoney } from './settings.ts';
export type DisplayCurrency='KRW'|'USD';
export const CURRENCY_STORAGE_KEY='btc-simulator.display-currency.v1';
export function toDisplayAmount(krw:number,currency:DisplayCurrency,usdKrw:number|null):number|null {
  if(currency==='KRW')return krw;
  return usdKrw!==null&&Number.isFinite(usdKrw)&&usdKrw>0?krw/usdKrw:null;
}
export function toKrwAmount(amount:number,currency:DisplayCurrency,usdKrw:number|null):number|null {
  if(currency==='KRW')return amount;
  return usdKrw!==null&&Number.isFinite(usdKrw)&&usdKrw>0?amount*usdKrw:null;
}
export function currencyDisplay(currency:DisplayCurrency,usdKrw:number|null) {
  return {
    currency,usdKrw,
    money:(krw:number)=>{const amount=toDisplayAmount(krw,currency,usdKrw);return amount===null?'환율 확인 중':formatMoney(amount,currency).replace(' KRW','원');},
    compact:(krw:number)=>{const amount=toDisplayAmount(krw,currency,usdKrw);return amount===null?'환율 확인 중':currency==='KRW'?compactKrw(amount):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(amount);},
    inputValue:(value:string)=>{if(value.trim()==='')return '';const amount=toDisplayAmount(Number(value),currency,usdKrw);return amount===null?'':currency==='KRW'?value:String(Number(amount.toFixed(2)));},
    inputToKrw:(value:string)=>{if(value.trim()==='')return '';const amount=toKrwAmount(Number(value),currency,usdKrw);return amount===null?'':String(amount);},
  };
}
