'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.ALSVID_PREVIEW_SECRET = 'unit-test-product-template-review-secret-32-bytes';
const review = require('../product-template-review');

function page(overrides = {}) {
  return { id: 'page-1', pageType: 'product_template', path: '/products', locale: 'zh', revision: 4, draft: { catalogLayout: {} }, ...overrides };
}

test('product template release requires all six scope-bound preview receipts', () => {
  const current = page();
  const session = review.start(current, 'admin-1', { previewScope: 'listing', productId: '' });
  assert.equal(review.read(session.slots.find(slot => slot.locale === 'zh').token).draft, true);
  assert.equal(review.read(session.slots.find(slot => slot.locale === 'en').token).draft, false);
  const receipts = session.slots.map(slot => review.rendered(review.read(slot.token), current));

  assert.equal(session.slots.length, 6);
  assert.equal(review.requireReviewedRelease(current, 'admin-1', {
    session: session.session,
    receipts,
    previewScope: 'listing',
    productId: '',
  }).slots.length, 6);
  assert.throws(() => review.requireReviewedRelease(current, null, {}), /不能使用旧版直接发布/);
  assert.throws(() => review.requireReviewedRelease(current, 'admin-1', {
    session: session.session,
    receipts: receipts.slice(0, 5),
    previewScope: 'listing',
    productId: '',
  }), /全部六项/);
  assert.throws(() => review.requireReviewedRelease(current, 'admin-1', {
    session: session.session,
    receipts,
    previewScope: 'product',
    productId: 'bike-1',
  }), /不匹配/);
});

test('product template preview receipt expires with or mismatches its draft revision', () => {
  const current = page();
  const session = review.start(current, 'admin-1', { previewScope: 'product', productId: 'bike-1' });
  const ticket = review.read(session.slots[0].token);
  assert.throws(() => review.rendered(ticket, page({ revision: 5 })), /草稿已修改/);
  assert.throws(() => review.start(page({ pageType: 'custom' }), 'admin-1', { previewScope: 'listing', productId: '' }), /没有可发布的草稿/);
  assert.equal(review.requireReviewedRelease(page({ path: '/products/bike-1' }), null, {}), null);
});
