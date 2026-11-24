import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePortalRoute } from '../src/portal-route.js';

test('known legacy paths lead to the corresponding V2 portal section', () => {
  assert.deepEqual(parsePortalRoute('/my/vehicles/', 'localhost'), { kind: 'owner', supported: true, section: 'portal-vehicles' });
  assert.deepEqual(parsePortalRoute('/my/vehicles/register', 'localhost'), { kind: 'owner', supported: true, section: 'portal-registration' });
  assert.deepEqual(parsePortalRoute('/my/service/new', 'localhost'), { kind: 'owner', supported: true, section: 'portal-service' });
  assert.deepEqual(parsePortalRoute('/dealer/purchase', 'localhost'), { kind: 'dealer', supported: true, section: 'portal-dealer-orders' });
  assert.deepEqual(parsePortalRoute('/dealer/order-status', 'localhost'), { kind: 'dealer', supported: true, section: 'portal-dealer-orders' });
  assert.deepEqual(parsePortalRoute('/dealer/service', 'localhost'), { kind: 'dealer', supported: true, section: 'portal-service' });
  assert.deepEqual(parsePortalRoute('/', 'my.example.com'), { kind: 'owner', supported: true, section: null });
});

test('unmigrated or unrelated paths never masquerade as a migrated section', () => {
  assert.deepEqual(parsePortalRoute('/my/vehicles/123/manual', 'localhost'), { kind: 'owner', supported: false, section: null });
  assert.deepEqual(parsePortalRoute('/dealer/documents', 'localhost'), { kind: 'dealer', supported: false, section: null });
  assert.equal(parsePortalRoute('/myth', 'localhost'), null);
  assert.equal(parsePortalRoute('/catalog/de', 'localhost'), null);
});
