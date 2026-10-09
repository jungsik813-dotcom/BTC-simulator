import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults as appDefaults, simulate } from './simulation.ts';
// Positive holdings fixture keeps return and contribution checks meaningful.
const defaults={...appDefaults,btcQuantity:1,monthlyBtc:500000};
test('BTC 시작 평가액과 연간 투자 수량을 계산한다',()=>{
 const rows=simulate({...defaults,endYear:2027,btcPrice:100,btcQuantity:2,monthlyBtc:10,btcReturn:100});
 assert.deepEqual(rows[0],{year:2026,btcPrice:100,btcQuantity:2,btcValue:200});
 assert.deepEqual(rows[1],{year:2027,btcPrice:200,btcQuantity:2.6,btcValue:520});
});
test('수익률 0%에서는 납입금 전액이 BTC 평가액에 더해진다',()=>{
 const rows=simulate({...defaults,btcReturn:0});
 assert.equal(rows.length,20);assert.equal(rows.at(-1)?.year,2045);
 for(let i=0;i<rows.length;i++)assert.ok(Math.abs(rows[i].btcValue-(defaults.btcQuantity*defaults.btcPrice+i*12*defaults.monthlyBtc))<.00001);
});
test('낮은 매수 가격에서 더 많은 BTC를 취득한다',()=>{
 const a={...defaults,endYear:2027,btcQuantity:0};
 const low=simulate({...a,btcReturn:-50})[1],high=simulate({...a,btcReturn:50})[1];
 assert.ok(low.btcQuantity>high.btcQuantity);assert.equal(low.btcValue,high.btcValue);
});
test('잘못된 입력과 계산 범위를 벗어난 값을 거부한다',()=>{
 for(const change of [{endYear:2025},{btcPrice:0},{btcReturn:-100},{btcQuantity:-1},{monthlyBtc:-1},{btcPrice:NaN},{btcReturn:1e100}])assert.throws(()=>simulate({...defaults,...change}));
});
