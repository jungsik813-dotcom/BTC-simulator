import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, simulate } from './simulation.ts';
test('시작 자산, 연간 투자, 부채와 구매력 계산',()=>{
 const rows=simulate({...defaults,startYear:2026,endYear:2027,btcPrice:100,btcQuantity:2,stocks:100,cash:50,debt:20,monthlyBtc:10,monthlyStocks:5,btcReturn:100,stockReturn:10,debtRate:10,inflation:10});
 assert.equal(rows[0].nominal,330);
 assert.equal(rows[1].btcPrice,200);
 assert.equal(rows[1].btcQuantity,2.6);
 assert.equal(rows[1].stocks,170);
 assert.equal(rows[1].debt,22);
 assert.equal(rows[1].nominal,718);
 assert.equal(rows[1].real,718/1.1);
});
test('기본 범위와 수익률 0%',()=>{
 const rows=simulate({...defaults,btcReturn:0,stockReturn:0,inflation:0,debtRate:0});
 assert.equal(rows.length,20);assert.equal(rows.at(-1)?.year,2045);
 assert.ok(rows.every(r=>r.nominal===r.real));
});
test('낮은 매수 가격에서 더 많은 BTC 취득',()=>{
 const a={...defaults,endYear:2027,btcQuantity:0};
 assert.ok(simulate({...a,btcReturn:-50})[1].btcQuantity>simulate({...a,btcReturn:50})[1].btcQuantity);
});
test('잘못된 입력값 거부',()=>{
 assert.throws(()=>simulate({...defaults,endYear:2025}));
 assert.throws(()=>simulate({...defaults,btcPrice:0}));
 assert.throws(()=>simulate({...defaults,inflation:-100}));
});
test('외부 가격 경로로 BTC 평가와 DCA를 계산한다',()=>{
 const rows=simulate({...defaults,startYear:2026,endYear:2027,btcQuantity:1,monthlyBtc:100,btcPrice:50},{2026:50,2027:200});
 assert.equal(rows[0].btcPrice,50);
 assert.equal(rows[1].btcPrice,200);
 assert.equal(rows[1].btcQuantity,7);
});
