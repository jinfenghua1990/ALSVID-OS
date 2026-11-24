'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const poolPath = require.resolve('../db-pool');
const storePath = require.resolve('../media-assets');

test('media upload rolls back metadata when its audit record fails', async () => {
  const queries = [];
  const removed = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('INSERT INTO media_assets')) return { rows: [{ id: 'asset-id' }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO audit_log')) throw new Error('audit unavailable');
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = {
    async query() { return { rows: [] }; },
    async connect() { return client; },
    async end() {},
  };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => pool } };
  delete require.cache[storePath];
  const { createMediaAssetStore } = require('../media-assets');
  const store = createMediaAssetStore('unused', {
    async put() {},
    async head() { return { size: 3 }; },
    async remove(key) { removed.push(key); },
  });

  await assert.rejects(store.upload({ contentType: 'image/png', fileName: 'test.png', category: 'other', body: Buffer.from('abc') }), /audit unavailable/);
  assert(queries.includes('BEGIN'));
  assert(queries.includes('ROLLBACK'));
  assert(!queries.includes('COMMIT'));
  assert.equal(removed.length, 1);
});

test('media update rolls back metadata when its audit record fails', async () => {
  const queries = [];
  const assetId = '12345678-1234-7234-8234-123456789abc';
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT id::text')) return { rows: [{ id: assetId, label: 'old', category: 'other' }], rowCount: 1 };
      if (sql.startsWith('UPDATE media_assets')) return { rows: [{ id: assetId, label: 'new', category: 'other' }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO audit_log')) throw new Error('audit unavailable');
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async query() { return { rows: [] }; }, async connect() { return client; }, async end() {} };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => pool } };
  delete require.cache[storePath];
  const { createMediaAssetStore } = require('../media-assets');
  const store = createMediaAssetStore('unused', null);

  await assert.rejects(store.update(assetId, { label: 'new' }), /audit unavailable/);
  assert(queries.includes('BEGIN'));
  assert(queries.includes('ROLLBACK'));
  assert(!queries.includes('COMMIT'));
});
