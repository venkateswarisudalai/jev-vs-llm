import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/compare.js';

const req = (body, headers = {}) =>
  new Request('http://local/api/compare', { method: 'POST', headers, body: JSON.stringify(body) });

test('without any key the handler explains how to add one', async () => {
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  const res = await POST(req({}));
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /paste your own key/);
});

test('a visitor key is accepted and the request is still validated', async () => {
  const res = await POST(req({ state: 'hi', questions: {} }, { 'x-gateway-key': 'vck_test' }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'provide 1-8 questions');
});
