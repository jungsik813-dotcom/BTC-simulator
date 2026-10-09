import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXCHANGE_RATE_URL,fetchExchangeRate,parseExchangeRateQuote} from './exchangeRate.ts';
import {currencyDisplay,toDisplayAmount,toKrwAmount} from './currency.ts';
test('USD/KRW 환율과 기준일을 검증한다',()=>{
 assert.deepEqual(parseExchangeRateQuote({base:'USD',quote:'KRW',rate:1340.33,date:'2026-10-08'},123),{usdKrw:1340.33,date:'2026-10-08',fetchedAt:123});
 for(const change of [{base:'EUR'},{quote:'USD'},{rate:0},{rate:-1},{rate:NaN},{rate:'1340'},{date:'2026-02-30'},{date:'invalid'}])assert.throws(()=>parseExchangeRateQuote({base:'USD',quote:'KRW',rate:1340.33,date:'2026-10-08',...change}));
 assert.throws(()=>parseExchangeRateQuote(null));
});
test('환율 요청은 최신 값을 조회하고 HTTP 오류를 처리한다',async()=>{
 const original=globalThis.fetch;let called=false;
 try{
  globalThis.fetch=async(url,options)=>{assert.equal(url,EXCHANGE_RATE_URL);assert.equal(options?.cache,'no-store');assert.ok(options?.signal);called=true;return new Response(JSON.stringify({base:'USD',quote:'KRW',rate:1340.33,date:'2026-10-08'}));};
  assert.equal((await fetchExchangeRate()).usdKrw,1340.33);assert.ok(called);
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(fetchExchangeRate(),/HTTP 503/);
  globalThis.fetch=async()=>{throw new TypeError('network offline')};await assert.rejects(fetchExchangeRate(),/network offline/);
 }finally{globalThis.fetch=original;}
});
test('원화·달러 전환은 금액 단위만 바꾸며 역변환이 일치한다',()=>{
 const rate=1340.33,krw=100000000;
 const usd=toDisplayAmount(krw,'USD',rate)!;
 assert.ok(Math.abs(toKrwAmount(usd,'USD',rate)!-krw)<1e-7);
 assert.equal(toDisplayAmount(krw,'KRW',null),krw);
 assert.equal(toDisplayAmount(krw,'USD',null),null);assert.equal(toKrwAmount(10,'USD',0),null);
 assert.equal(toDisplayAmount(0,'USD',rate),0);
 assert.equal(currencyDisplay('USD',rate).inputToKrw('100'),String(rate*100));
 assert.equal(currencyDisplay('USD',rate).inputToKrw(''),'');
 const before=currencyDisplay('USD',1000),after=currencyDisplay('USD',2000);
 assert.equal(before.inputValue('1000000'),'1000');assert.equal(after.inputValue('1000000'),'500');
 assert.match(before.money(1000000),/1,000.00 USD/);assert.match(after.money(1000000),/500.00 USD/);
 assert.equal(currencyDisplay('USD',null).money(krw),'환율 확인 중');
});
