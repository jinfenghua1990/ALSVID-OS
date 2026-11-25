import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogRoute } from '../src/catalog-route.js';

test('catalogue routes preserve language and decode product identifiers', () => {
  for (const lang of ['zh', 'en', 'de']) {
    assert.deepEqual(parseCatalogRoute(`/www/${lang}/products`), { lang, productId: undefined });
    assert.deepEqual(parseCatalogRoute(`/www/${lang}/products/bike%201/`), { lang, productId: 'bike 1' });
  }
  assert.deepEqual(parseCatalogRoute('/www/de/products/%E0%A4%A'), { lang: 'de', productId: '%E0%A4%A' });
  assert.equal(parseCatalogRoute('/www/fr/products'), null);
  assert.equal(parseCatalogRoute('/www/en/products/bike/extra'), null);
});
