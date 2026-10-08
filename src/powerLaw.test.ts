import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,simulate} from './simulation.ts';
import {DEFAULT_POWER_LAW_BETA as B,daysSinceGenesis,parsePowerLawBeta,powerLawPrices,simulatePowerLaw} from './powerLaw.ts';
import {decodeSettings} from './settings.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),a+' != '+b);

test('annual snapshots have positive Genesis ages and include leap years',()=>{
 assert.equal(daysSinceGenesis(2010),363);
 assert.equal(daysSinceGenesis(2021)-daysSinceGenesis(2020),366);
 assert.throws(()=>daysSinceGenesis(2009));assert.throws(()=>daysSinceGenesis(2201));
});
test('changing beta preserves the exact starting price, assets and purchasing power',()=>{
 const market=simulate(defaults)[0];
 for(const beta of [0,1,B,B+.1,8]) assert.deepEqual(simulatePowerLaw(defaults,beta)[0],market);
});
test('beta changes growth from the anchor rather than multiplying all prices',()=>{
 const a={...defaults,endYear:2027};
 const before=powerLawPrices(a,B),after=powerLawPrices(a,B+.1);
 const ratio=daysSinceGenesis(2027)/daysSinceGenesis(2026);
 close(before[2027],a.btcPrice*ratio**B);
 close(after[2027]/before[2027],ratio**.1);
 assert.ok(after[2027]/before[2027]>1 && after[2027]/before[2027]<1.01);
 assert.equal(before[2026],after[2026]);
});
test('power law has a constant log-log slope and a declining annual growth rate',()=>{
 const a={...defaults,endYear:2045},prices=powerLawPrices(a,B);
 for(const year of [2027,2030,2045]) close(Math.log(prices[year]/a.btcPrice)/Math.log(daysSinceGenesis(year)/daysSinceGenesis(a.startYear)),B);
 assert.ok(prices[2027]/prices[2026]>prices[2045]/prices[2044]);
});
test('purchases and valuations use the same power law price, independent of CAGR',()=>{
 const a={...defaults,endYear:2028};
 const rows=simulatePowerLaw(a,B);
 assert.deepEqual(simulatePowerLaw({...a,btcReturn:50},B),rows);
 for(let i=1;i<rows.length;i++){
  const r=rows[i],previous=rows[i-1];
  close((r.btcQuantity-previous.btcQuantity)*r.btcPrice,a.monthlyBtc*12);
  close(r.btcValue,r.btcQuantity*r.btcPrice);
  close(r.nominal,r.btcValue+r.stocks+r.cash-r.debt);
  close(r.real,r.nominal/(1+a.inflation/100)**i);
 }
 const faster=simulatePowerLaw(a,B+1);
 assert.ok(faster[1].btcPrice>rows[1].btcPrice);
 assert.ok(faster[1].btcQuantity<rows[1].btcQuantity);
});
test('current price and selected start year determine the anchor',()=>{
 const original=powerLawPrices(defaults,B),scaled=powerLawPrices({...defaults,btcPrice:2e8},B);
 for(const year of Object.keys(original))close(scaled[+year],original[+year]*2);
 const shifted=powerLawPrices({...defaults,startYear:2027},B);
 assert.equal(shifted[2027],defaults.btcPrice);assert.ok(shifted[2028]<original[2028]);
});
test('beta zero is flat and preserves full investment contributions',()=>{
 const a={...defaults,endYear:2027};
 const rows=simulatePowerLaw(a,0);
 assert.equal(rows[1].btcPrice,a.btcPrice);
 close(rows[1].btcQuantity,a.btcQuantity+a.monthlyBtc*12/a.btcPrice);
});
test('non-BTC assets and negative net worth remain consistent with the shared model',()=>{
 const a={...defaults,stocks:0,cash:0,debt:1e12};
 const rows=simulatePowerLaw(a,B),market=simulate(a);
 for(let i=0;i<rows.length;i++){
  assert.equal(rows[i].stocks,market[i].stocks);assert.equal(rows[i].cash,market[i].cash);assert.equal(rows[i].debt,market[i].debt);
 }
 assert.ok(rows[0].nominal<0);assert.ok(rows[1].nominal<0);
});
test('invalid beta, dates, starting prices and overflow are rejected',()=>{
 for(const v of ['', '-1','NaN','Infinity'])assert.throws(()=>parsePowerLawBeta(v));
 assert.equal(parsePowerLawBeta('0'),0);
 assert.throws(()=>powerLawPrices(defaults,1e9));
 for(const btcPrice of [0,-1,NaN,Infinity])assert.throws(()=>powerLawPrices({...defaults,btcPrice},B));
 for(const startYear of [2009,2026.5,2201])assert.throws(()=>powerLawPrices({...defaults,startYear},B));
 assert.throws(()=>powerLawPrices({...defaults,endYear:2025},B));
 assert.throws(()=>powerLawPrices({...defaults,endYear:2201},B));
});
test('stored beta and existing portfolio settings remain compatible',()=>{
 const old=decodeSettings(null),{powerLawBeta,...legacy}=old;
 assert.equal(decodeSettings(JSON.stringify({version:9,...legacy})).powerLawBeta,String(B));
 for(const powerLawBeta of ['0','6.2']){
  const saved={...old,powerLawBeta};assert.deepEqual(decodeSettings(JSON.stringify({version:10,...saved})),saved);
 }
 assert.throws(()=>decodeSettings(JSON.stringify({version:10,...old,powerLawBeta:'-2'})));
});
