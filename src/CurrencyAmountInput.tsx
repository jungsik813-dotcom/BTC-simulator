import { useEffect, useState } from 'react';
import { useCurrency } from './CurrencyProvider';
export function CurrencyAmountInput({value,onChange,label,disabled=false,invalid=false}:{value:string;onChange:(krw:string)=>void;label:string;disabled?:boolean;invalid?:boolean}) {
  const display=useCurrency();
  const [draft,setDraft]=useState<string|null>(null);
  useEffect(()=>setDraft(null),[display.currency,display.usdKrw]);
  const waiting=display.currency==='USD'&&display.usdKrw===null;
  return <input aria-label={label} type="number" min="0" step="any" value={draft??display.inputValue(value)} aria-invalid={invalid} disabled={disabled||waiting} placeholder={waiting?'환율 확인 중':undefined} onFocus={()=>setDraft(display.inputValue(value))} onBlur={()=>setDraft(null)} onChange={e=>{const next=e.target.value;setDraft(next);onChange(display.inputToKrw(next));}}/>;
}
