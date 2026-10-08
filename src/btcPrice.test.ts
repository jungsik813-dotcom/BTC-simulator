import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBtcPrice, BTC_PRICE_URL } from './btcPrice.ts';

test('BTC 원화 체결 가격과 시간을 읽는다', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, BTC_PRICE_URL);
    return new Response(JSON.stringify([{ market:'KRW-BTC', trade_price:123000000, trade_timestamp:1790000000000 }]));
  };
  try { assert.deepEqual(await fetchBtcPrice(), { price:123000000, tradedAt:1790000000000 }); }
  finally { globalThis.fetch = original; }
});
test('HTTP 오류와 잘못된 가격을 거부한다', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status:429 });
    await assert.rejects(fetchBtcPrice(), /HTTP 429/);
    for (const price of [0,-1,'123']) {
      globalThis.fetch = async () => new Response(JSON.stringify([{ market:'KRW-BTC',trade_price:price,trade_timestamp:1790000000000 }]));
      await assert.rejects(fetchBtcPrice(), /응답 형식/);
    }
  } finally { globalThis.fetch = original; }
});
