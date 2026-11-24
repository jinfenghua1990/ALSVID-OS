import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { parsePortalRoute } from '../src/portal-route.js';

test('each supported legacy destination exists in its role-specific V2 portal', async t => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  t.after(() => vite.close());
  const { default: PortalPage } = await vite.ssrLoadModule('/src/pages/PortalPage.jsx');
  for (const path of ['/my/vehicles', '/my/vehicles/register', '/my/service', '/my/service/new', '/dealer/orders', '/dealer/purchase']) {
    const route = parsePortalRoute(path, 'localhost');
    const html = renderToStaticMarkup(React.createElement(PortalPage, {
      user: { id: 'test-user', role: route.kind }, onLogout() {}, targetSection: route.section,
    }));
    assert.ok(html.includes(`id="${route.section}"`), path);
  }
});
