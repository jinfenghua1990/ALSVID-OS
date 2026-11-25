import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('CMS product links preserve the public page language', async t => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  t.after(() => vite.close());
  const { BlocksRenderer } = await vite.ssrLoadModule('/src/pages/cms-blocks.jsx');
  const blocks = [{ id: 'gallery', componentKey: 'productGallery', data: { products: [{ id: 'bike 1', title: 'Bike', kind: 'vehicle' }] } }];
  for (const lang of ['zh', 'en', 'de']) {
    const html = renderToStaticMarkup(React.createElement(BlocksRenderer, { blocks, lang }));
    assert.match(html, new RegExp(`href="/www/${lang}/products/bike%201"`));
  }
});
