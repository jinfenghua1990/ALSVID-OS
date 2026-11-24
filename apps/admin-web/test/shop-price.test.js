import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexOffers, priceState, formatAmount } from '../src/shop-price.js';

const product = (skus) => ({ id: 'p1', skus });

test('没有任何报价时是 none', () => {
  const state = priceState(product([{ sku: 'A', price: null }]), indexOffers([]));
  assert.equal(state.state, 'none');
  assert.equal(state.pricedSkus, 0);
  assert.equal(state.totalSkus, 1);
});

test('后台兜底：offers 未加载时用 sku.price，状态为 unverified', () => {
  const state = priceState(product([{ sku: 'A', price: '1290.00' }]), null);
  assert.equal(state.state, 'unverified');
  assert.equal(state.currency, 'EUR');
  assert.equal(state.min, 1290);
  assert.equal(state.pricedSkus, 1);
});

test('有报价但未公开时状态是 unpublished，并仍然给出金额', () => {
  const offers = indexOffers([{ sku: 'A', currency: 'EUR', unitPrice: '1290.00', published: false }]);
  const state = priceState(product([{ sku: 'A' }]), offers);
  assert.equal(state.state, 'unpublished');
  assert.equal(state.min, 1290);
  assert.equal(state.pricedSkus, 1);
});

test('至少一条已公开时状态是 live，且只统计已公开的金额', () => {
  const offers = indexOffers([
    { sku: 'A', currency: 'EUR', unitPrice: '1290.00', published: true },
    { sku: 'B', currency: 'EUR', unitPrice: '990.00', published: false },
  ]);
  const state = priceState(product([{ sku: 'A' }, { sku: 'B' }]), offers);
  assert.equal(state.state, 'live');
  assert.equal(state.min, 1290);
  assert.equal(state.max, 1290);
  assert.equal(state.pricedSkus, 2);
  assert.equal(state.unpricedSkus, 0);
});

test('部分 SKU 有价时能算出未定价数量', () => {
  const offers = indexOffers([{ sku: 'A', currency: 'EUR', unitPrice: '100.00', published: true }]);
  const state = priceState(product([{ sku: 'A' }, { sku: 'B' }, { sku: 'C' }]), offers);
  assert.equal(state.pricedSkus, 1);
  assert.equal(state.totalSkus, 3);
  assert.equal(state.unpricedSkus, 2);
});

test('停用的 SKU 不计入总数', () => {
  const offers = indexOffers([{ sku: 'A', currency: 'EUR', unitPrice: '100.00', published: true }]);
  const state = priceState(product([{ sku: 'A' }, { sku: 'B', disabled: true }]), offers);
  assert.equal(state.totalSkus, 1);
  assert.equal(state.unpricedSkus, 0);
});

test('没有有效金额的报价被忽略', () => {
  const offers = indexOffers([
    { sku: 'A', currency: 'EUR', unitPrice: '0', published: true },
    { sku: 'A', currency: 'EUR', unitPrice: '', published: true },
  ]);
  assert.equal(priceState(product([{ sku: 'A' }]), offers).state, 'none');
});

test('多币种时以 EUR 为主币种，其余币种单独列出，不混成一个区间', () => {
  const offers = indexOffers([
    { sku: 'A', currency: 'EUR', unitPrice: '1290.00', published: true },
    { sku: 'B', currency: 'CNY', unitPrice: '9800.00', published: true },
  ]);
  const state = priceState(product([{ sku: 'A' }, { sku: 'B' }]), offers);
  assert.equal(state.currency, 'EUR');
  assert.equal(state.min, 1290);
  assert.equal(state.max, 1290);
  assert.deepEqual(state.otherCurrencies, ['CNY']);
});

test('只有 CNY 报价时主币种回退为 CNY', () => {
  const offers = indexOffers([{ sku: 'A', currency: 'CNY', unitPrice: '9800.00', published: true }]);
  const state = priceState(product([{ sku: 'A' }]), offers);
  assert.equal(state.currency, 'CNY');
  assert.equal(state.min, 9800);
});

test('金额按币种与两位小数格式化（沿用后台既有的 de-DE 数字格式）', () => {
  assert.equal(formatAmount('EUR', 1290), 'EUR 1.290,00');
  assert.equal(formatAmount('CNY', '9800.5'), 'CNY 9.800,50');
  assert.equal(formatAmount('EUR', null), '—');
});
