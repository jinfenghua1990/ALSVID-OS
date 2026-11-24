'use strict';
// UNIT_TEST_NO_DATABASE：本文件只测纯函数与同步逻辑的调用契约，不需要数据库。
const test = require('node:test');
const assert = require('node:assert');
const {
  normalizeSeoProductId, assertSeoProductId, syncListingSeoId, MAX_LENGTH,
} = require('../seo-product-id');

test('normalizeSeoProductId 去空格并转小写', () => {
  assert.equal(normalizeSeoProductId('  Carbon-E-Bike-Klapprad-A1 '), 'carbon-e-bike-klapprad-a1');
  assert.equal(normalizeSeoProductId(null), '');
  assert.equal(normalizeSeoProductId(undefined), '');
});

test('合法的 SEO 商品 ID 原样放行（重在大写/空格先被规范化）', () => {
  assert.equal(assertSeoProductId('carbon-e-bike-klapprad-a1'), 'carbon-e-bike-klapprad-a1');
  assert.equal(assertSeoProductId(' Carbon-E-Bike-Klapprad-A1-Ultra '), 'carbon-e-bike-klapprad-a1-ultra');
  assert.equal(assertSeoProductId('carbon-e-bike-klapprad-mittelmotor-l1-pro'), 'carbon-e-bike-klapprad-mittelmotor-l1-pro');
  // 空值表示「还没定」，应当返回空串而不是抛错
  assert.equal(assertSeoProductId(''), '');
  assert.equal(assertSeoProductId(undefined), '');
});

test('格式不合规的 SEO 商品 ID 一律拒绝，并给出可读原因', () => {
  const cases = [
    ['carbon e bike', /小写字母、数字和单个短横线/],
    ['carbon_e_bike', /小写字母、数字和单个短横线/],
    ['carbon--ebike', /小写字母、数字和单个短横线/],
    ['-carbon-ebike', /小写字母、数字和单个短横线/],
    ['carbon-ebike-', /小写字母、数字和单个短横线/],
    ['碳纤维电助力自行车', /小写字母、数字和单个短横线/],
    ['a'.repeat(MAX_LENGTH + 1), /不能超过 80 个字符/],
  ];
  for (const [value, pattern] of cases) {
    assert.throws(() => assertSeoProductId(value), pattern, `应当拒绝 ${JSON.stringify(value)}`);
  }
});

test('SKU 编码不能当 SEO 商品 ID（规范禁止 SKU 进入 URL）', () => {
  assert.throws(() => assertSeoProductId('a1-std-pur-eur'), /不能使用 SKU 编码/);
  assert.throws(() => assertSeoProductId('A1-ULT-GRY-EUR'), /不能使用 SKU 编码/);
});

test('校验失败的错误带上 400，路由层才能返回业务错误而不是 500', () => {
  try {
    assertSeoProductId('bad_id');
    assert.fail('应当抛错');
  } catch (error) {
    assert.equal(error.statusCode, 400);
  }
});

test('syncListingSeoId：空值或没有命中记录时不写库、不记账', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 0, rows: [] }; } };

  assert.equal(await syncListingSeoId(client, 'uuid-1', ''), 0);
  assert.equal(calls.length, 0, '没有 SEO ID 时不应发出任何 SQL');

  assert.equal(await syncListingSeoId(client, 'uuid-1', 'carbon-e-bike-klapprad-a1'), 0);
  assert.equal(calls.length, 1, '只应发出一条 UPDATE');
  assert.match(calls[0].sql, /UPDATE storefront_listings/);
  assert.match(calls[0].sql, /jsonb_set\(draft, '\{seo\}'/, '必须同步 draft.seo.slug');
  assert.match(calls[0].sql, /jsonb_set\(published, '\{seo\}'/, '必须同步 published.seo.slug（canonical 依赖它）');
  assert.match(calls[0].sql, /COALESCE\(draft->'seo'/, 'seo 对象缺失时要能建出来（jsonb_set 不建中间层）');
  assert.deepEqual(calls[0].params, ['uuid-1', 'carbon-e-bike-klapprad-a1']);
});

test('syncListingSeoId：命中记录时写一条审计，保留地址变更痕迹', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: sql.includes('UPDATE storefront_listings') ? 2 : 1, rows: [] }; } };

  assert.equal(await syncListingSeoId(client, 'uuid-1', 'carbon-e-bike-klapprad-l1'), 2);
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /INSERT INTO audit_log/);
  assert.equal(calls[1].params[1], 'listing.seo-sync');
  assert.deepEqual(JSON.parse(calls[1].params[3]), { seo: 'carbon-e-bike-klapprad-l1', listings: 2 });
});
