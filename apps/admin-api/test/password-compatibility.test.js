const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scryptSync } = require('node:crypto');
const { passwordHash, verifyPassword, V1_SCRYPT_SALT } = require('../passwords');

function v1Hash(password) {
  const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

test('V1 credentials verify only with the explicit migration marker', async () => {
  const encoded = v1Hash('legacy password');
  assert.equal(await verifyPassword('legacy password', V1_SCRYPT_SALT, encoded), true);
  assert.equal(await verifyPassword('wrong password', V1_SCRYPT_SALT, encoded), false);
  assert.equal(await verifyPassword('legacy password', 'unrelated-salt', encoded), false);
  assert.equal(await verifyPassword('legacy password', V1_SCRYPT_SALT, encoded.replace('$16384$', '$32768$')), false);
  assert.equal(await verifyPassword('legacy password', V1_SCRYPT_SALT, `${encoded}$extra`), false);
  assert.equal(await verifyPassword('legacy password', V1_SCRYPT_SALT, null), false);
});

test('existing V2 credentials retain their original salt and password behavior', async () => {
  const salt = '00112233445566778899aabbccddeeff';
  const hash = await passwordHash('v2 password', salt);
  assert.equal(await verifyPassword('v2 password', salt, hash), true);
  assert.equal(await verifyPassword('wrong password', salt, hash), false);
  assert.equal(await verifyPassword('v2 password', salt, 'not-hex'), false);
});

test('V1 login and password change preserve role, disabled status and V2 credential format', async t => {
  const dbPath = require.resolve('../db-pool');
  const authPath = require.resolve('../auth');
  const db = require(dbPath);
  const originalCreatePool = db.createPool;
  const user = { id: 'synthetic-user', username: 'owner@example.invalid', role: 'owner', enabled: true, password_salt: V1_SCRYPT_SALT, password_hash: v1Hash('legacy password') };
  let sessions = 0;
  let lockedOverride = null;
  const pool = {
    async query(sql) {
      if (sql.startsWith('SELECT id,username,password_salt,password_hash,role,enabled FROM app_users')) return { rows: [{ ...user }] };
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql.startsWith('SELECT password_hash,password_salt,enabled,role')) return { rows: [{ ...user, ...lockedOverride }] };
          if (sql.startsWith('SELECT id,username,password_salt,password_hash')) return { rows: [{ ...user }] };
          if (sql.startsWith('INSERT INTO app_sessions')) { sessions++; return { rows: [] }; }
          if (sql.startsWith('UPDATE app_users SET password_salt')) { user.password_salt = params[0]; user.password_hash = params[1]; return { rows: [] }; }
          if (/^(BEGIN|COMMIT|ROLLBACK|DELETE FROM app_sessions|INSERT INTO audit_log)/.test(sql)) return { rows: [] };
          throw new Error(`Unexpected transaction query: ${sql}`);
        },
        release() {},
      };
    },
    async end() {},
  };
  db.createPool = () => pool;
  delete require.cache[authPath];
  t.after(() => { db.createPool = originalCreatePool; delete require.cache[authPath]; });
  const { createAuth } = require('../auth');
  const auth = createAuth('unused-synthetic-connection');
  assert.equal(await auth.login(user.username, 'incorrect'), null);
  const loggedIn = await auth.login(user.username, 'legacy password');
  assert.equal(loggedIn.user.role, 'owner');
  assert.equal(sessions, 1);
  user.enabled = false;
  assert.equal(await auth.login(user.username, 'legacy password'), null);
  assert.equal(sessions, 1);
  user.enabled = true;
  lockedOverride = { password_salt: 'changed-concurrently' };
  assert.equal(await auth.login(user.username, 'legacy password'), null);
  assert.equal(sessions, 1);
  lockedOverride = null;
  await assert.rejects(auth.setPassword(user.id, 'New-password-123', 'owner', 'incorrect'), /原密码不正确/);
  await auth.setPassword(user.id, 'New-password-123', 'owner', 'legacy password');
  assert.notEqual(user.password_salt, V1_SCRYPT_SALT);
  assert.equal(await verifyPassword('New-password-123', user.password_salt, user.password_hash), true);
  assert.equal((await auth.login(user.username, 'New-password-123')).user.role, 'owner');
});
