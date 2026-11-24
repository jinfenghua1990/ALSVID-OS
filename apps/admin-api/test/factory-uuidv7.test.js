const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDictionaryStore } = require('../postgres-dictionaries');

test('new factory persists with UUID v7 identity', async () => {
  const url=process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated database');
  const store=createDictionaryStore(url);
  try {
    const factory=await store.createFactory({name:'UUID v7 factory'});
    assert.match(factory.id,/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok((await store.listFactories()).some(row=>row.id===factory.id));
  } finally { await store.close(); }
});
