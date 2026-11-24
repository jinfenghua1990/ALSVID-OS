import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { api } from '../src/api.js';

test('test-ride admin requests include the record version and preserve conflict status', async t => {
  const original = globalThis.fetch, requests = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'GET') return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return new Response(JSON.stringify({ error: '记录已更新，请刷新后重试' }), { status: 409 });
  };
  assert.deepEqual(await api.testRides(), { data: [] });
  assert.deepEqual(await api.testRideHistory('record/one'), { data: [] });
  await assert.rejects(api.reviewTestRide('record/one', { status: 'CONTACTED', note: 'done', version: 3 }), error => error.status === 409);
  assert.equal(requests[1].url, '/api/test-rides/record%2Fone/history');
  assert.equal(requests[2].url, '/api/test-rides/record%2Fone');
  assert.equal(requests[2].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[2].options.body), { status: 'CONTACTED', note: 'done', version: 3 });
});

test('test-ride management renders only for administrators', async t => {
  const vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  t.after(() => vite.close());
  const { default: TestRidesAdmin } = await vite.ssrLoadModule('/src/pages/TestRidesAdmin.jsx');
  const render = role => renderToStaticMarkup(React.createElement(TestRidesAdmin, { user: { role } }));
  assert.match(render('admin'), /试骑意向/);
  assert.match(render('admin'), /不代表试骑时间、地点、订单或付款已确认/);
  assert.match(render('viewer'), /仅管理员可查看试骑意向/);
  assert.doesNotMatch(render('viewer'), /刷新列表/);
});
