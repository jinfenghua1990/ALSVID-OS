import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { parseWebsiteProductRoute, parseUnmigratedWebsiteRoute, parseLegacyWebsiteHome, parsePublicLocationsRoute, parseDealerPartnershipRoute, legacyCatalogDestination } from '../src/website-route.js';

test('legacy product routes identify the correct language and V2 page', () => {
  for (const lang of ['zh', 'en', 'de']) {
    assert.deepEqual(parseLegacyWebsiteHome(`/${lang}/`), { lang });
    assert.equal(parseUnmigratedWebsiteRoute(`/${lang}/`), null);
    assert.deepEqual(parseWebsiteProductRoute(`/${lang}/explore/l7`), { lang, product: 'l7' });
    assert.deepEqual(parseWebsiteProductRoute(`/${lang}/explore/l1`), { lang, product: 'l8' });
    assert.deepEqual(parseWebsiteProductRoute(`/${lang}/explore/l8/`), { lang, product: 'l8' });
    assert.deepEqual(parseWebsiteProductRoute(`/${lang}/explore/fc2`), { lang, product: 'fc2' });
    assert.deepEqual(parseWebsiteProductRoute(`/${lang}/explore/fc1`), { lang, product: 'fc1' });
    assert.deepEqual(parseWebsiteProductRoute(`/${lang}/explore/accessory-cup-holder`), { lang, product: 'accessory-cup-holder' });
    assert.equal(parseUnmigratedWebsiteRoute(`/${lang}/explore/fc1`), null);
    for (const path of ['cart', 'checkout', 'bikes']) assert.deepEqual(parseUnmigratedWebsiteRoute(`/${lang}/${path}`), { lang });
    assert.deepEqual(parsePublicLocationsRoute(`/${lang}/dealers/locations`), { lang, kind: 'sales' });
    assert.deepEqual(parsePublicLocationsRoute(`/${lang}/service-locations`), { lang, kind: 'service' });
    assert.deepEqual(parseDealerPartnershipRoute(`/${lang}/dealers`), { lang });
    assert.equal(legacyCatalogDestination(`/${lang}/bikes`, '', ''), `/catalog/${lang}`);
    assert.equal(legacyCatalogDestination(`/${lang}/accessories`, '', ''), `/catalog/${lang}?kind=part`);
    assert.equal(legacyCatalogDestination(`/${lang}/bikes`, '', '#accessories'), `/catalog/${lang}?kind=part`);
    assert.equal(legacyCatalogDestination(`/${lang}/bikes`, '?platform=fc', ''), null);
    assert.equal(legacyCatalogDestination(`/${lang}/bikes`, '?q=A1&page=2', ''), `/catalog/${lang}?q=A1&page=2`);
    assert.equal(legacyCatalogDestination(`/${lang}/accessories`, '?q=bag', ''), `/catalog/${lang}?kind=part&q=bag`);
    assert.equal(legacyCatalogDestination(`/${lang}/cart`, '', ''), null);
    assert.equal(parseUnmigratedWebsiteRoute(`/${lang}/dealers/locations`), null);
  }
  assert.equal(parseWebsiteProductRoute('/fr/explore/l7'), null);
  assert.equal(parseUnmigratedWebsiteRoute('/dealer/orders'), null);
  assert.equal(parseLegacyWebsiteHome('/fr'), null);
});

test('migrated product pages render in all languages using V2 links and available assets', async t => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  t.after(() => vite.close());
  const { default: ProductReferencePage } = await vite.ssrLoadModule('/src/pages/ProductReferencePage.jsx');
  const { default: PublicLocationsPage } = await vite.ssrLoadModule('/src/pages/PublicLocationsPage.jsx');
  for (const lang of ['zh', 'en', 'de']) {
    for (const kind of ['sales', 'service']) assert.ok(renderToStaticMarkup(React.createElement(PublicLocationsPage, { lang, kind })).includes(`lang="${lang}"`));
  }
  for (const lang of ['zh', 'en', 'de']) for (const product of ['l7', 'l8', 'fc1', 'fc2', 'accessory-cup-holder']) {
    const html = renderToStaticMarkup(React.createElement(ProductReferencePage, { lang, product }));
    assert.ok(html.includes(product === 'fc1' ? 'data-fc1-version="4"' : product === 'accessory-cup-holder' ? 'data-cup-holder-product="1"' : `data-${product}-product="1"`), `${lang}/${product}`);
    assert.ok(html.includes(`href="/catalog/${lang}`), `${lang}/${product} catalogue link`);
    assert.ok(html.includes('href="/my"'), `${lang}/${product} owner link`);
    assert.equal(html.includes('href="http://127.0.0.1:3000'), false);
    assert.doesNotMatch(html, />(?:l[78]|fc1|fc2|cup)\.[a-z]/i, `${lang}/${product} untranslated key`);
    if (product === 'fc1') {
      assert.ok(html.includes(`/catalog/${lang}?q=A1%20Ultra`), `${lang} V2 product search`);
      assert.ok(html.includes('data-fc1-test-ride'), `${lang} test ride`);
      assert.equal(html.includes(`/${lang}/cart`), false, `${lang} must not link to the old cart`);
    }
    if (product === 'fc2') {
      assert.ok(html.includes(`/catalog/${lang}?q=L1%20PRO`), `${lang} V2 product search`);
      assert.equal(html.includes(`/${lang}/cart`), false, `${lang} must not link to the old cart`);
    }
    for (const match of html.matchAll(/(?:src|href)="(\/products\/[^"?#]+)"/g)) {
      assert.ok(existsSync(`public${match[1]}`), `${lang}/${product}: ${match[1]}`);
    }
    for (const match of html.matchAll(/srcSet="([^"]+)"/gi)) {
      for (const candidate of match[1].split(',')) {
        const path = candidate.trim().split(/\s+/)[0];
        if (path.startsWith('/products/')) assert.ok(existsSync(`public${path}`), `${lang}/${product}: ${path}`);
      }
    }
  }
});
