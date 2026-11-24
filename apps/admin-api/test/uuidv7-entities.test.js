const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createInventory } = require('../inventory');
const { createAuth } = require('../auth');

test('new warehouses and accounts use UUID v7 and existing login works', async () => {
  const url=process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated empty database');
  const inventory=createInventory(url), auth=createAuth(url);
  const v7=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  try {
    const warehouse=await inventory.createWarehouse({name:'UUID warehouse',code:'UUIDWH',kind:'国内仓'});
    assert.match(warehouse.id,v7);
    assert.ok((await inventory.listWarehouses()).some(row=>row.id===warehouse.id));
    await auth.setup('uuid_admin','password123');
    const admin=(await auth.listUsers()).find(user=>user.username==='uuid_admin');
    assert.match(admin.id,v7);
    const viewer=await auth.createUser({username:'uuid_viewer',password:'password123',role:'viewer'},'uuid_admin');
    assert.match(viewer.id,v7);
    const session=await auth.login('uuid_viewer','password123');
    assert.equal((await auth.user(session.token)).id,viewer.id);
    await auth.logout(session.token);
  } finally { await inventory.close(); await auth.close(); }
});
