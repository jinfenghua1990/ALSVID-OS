import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogRoute } from '../src/catalog-route.js';

test('catalogue routes preserve language and decode product identifiers', () => {
  for (const lang of ['zh', 'en', 'de']) {
    assert.deepEqual(parseCatalogRoute(`/catalog/${lang}`), { lang, productId: undefined });
    assert.deepEqual(parseCatalogRoute(`/catalog/${lang}/bike%201/`), { lang, productId: 'bike 1' });
  }
  assert.deepEqual(parseCatalogRoute('/catalog/de/%E0%A4%A'), { lang: 'de', productId: '%E0%A4%A' });
  assert.equal(parseCatalogRoute('/catalog/fr'), null);
  assert.equal(parseCatalogRoute('/catalog/en/bike/extra'), null);
});
