const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { Pool } = require('pg');

test('normal bootstrap starts without initializing the database', async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated empty database');
  const pool = new Pool({connectionString:url});
  const schema = await pool.query("SELECT to_regnamespace('alsvid_v2') AS name");
  assert.equal(schema.rows[0].name, null, 'test database must have no ALSVID schema');
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const secrets = {DATABASE_URL:url,OBJECT_STORAGE_ENDPOINT:'https://example.com',OBJECT_STORAGE_BUCKET:'test',OBJECT_STORAGE_ACCESS_KEY:'test',OBJECT_STORAGE_SECRET_KEY:'test'};
  const child = spawn(process.execPath, ['secret-bootstrap.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: {...process.env,PORT:String(port),ALSVID_SECRET_JSON:JSON.stringify(secrets)},
    stdio:'ignore'
  });
  try {
    let response;
    for (let i=0; i<50; i++) {
      try { response = await fetch(`http://127.0.0.1:${port}/api/health`); break; }
      catch { await new Promise(resolve => setTimeout(resolve,100)); }
    }
    assert.ok(response, 'server did not start');
    assert.equal(response.status,503);
    assert.equal((await pool.query("SELECT to_regnamespace('alsvid_v2') AS name")).rows[0].name, null);
  } finally {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
    await pool.end();
  }
});
