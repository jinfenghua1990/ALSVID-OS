const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scryptSync } = require('node:crypto');
const { classifyAccount, previewAccounts } = require('../account-migration-preview');

function source(overrides = {}) {
  const salt = Buffer.alloc(16, 1);
  const hash = scryptSync('synthetic password', salt, 64);
  return { source_id: 'synthetic-id', status: 'ACTIVE', email_verified: true, password_state: 'ACTIVE', force_password_setup: true, password_hash: `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`, roles: ['customer_user'], target_matches: 0, target_roles: [], ...overrides };
}

test('preview requires role review and never returns credentials or email', () => {
  const row = source({ email: 'private@example.invalid' });
  const report = classifyAccount(row);
  assert.deepEqual(report.issues, ['role_and_entitlements_require_review']);
  assert.equal(JSON.stringify(report).includes(row.password_hash), false);
  assert.equal(JSON.stringify(report).includes(row.email), false);
});

test('account conflicts and unsafe source states remain explicit', () => {
  const report = classifyAccount(source({ status: 'DISABLED', email_verified: false, password_state: 'RESET_REQUIRED', force_password_setup: null, password_hash: null, roles: [], target_matches: 1, target_roles: ['admin'] }));
  for (const issue of ['source_not_active', 'source_email_unverified', 'password_setup_or_reset_required', 'source_security_policy_missing', 'password_not_compatible', 'target_username_exists', 'source_role_missing', 'role_and_entitlements_require_review']) {
    assert.ok(report.issues.includes(issue), issue);
  }
  assert.deepEqual(report.targetRoles, ['admin']);
});

test('preview uses one read-only snapshot and rolls it back without writing', async () => {
  const calls = [];
  const row = source();
  const client = { async query(sql) { calls.push(sql); if (/^\s*SELECT/.test(sql)) return { rows: [row] }; return { rows: [] }; } };
  const result = await previewAccounts(client);
  assert.equal(result.accountCount, 1);
  assert.equal(result.accounts[0].sourceId, row.source_id);
  assert.match(calls[0], /^BEGIN.*READ ONLY$/);
  assert.match(calls[1], /^\s*SELECT/);
  assert.equal(calls[2], 'ROLLBACK');
  assert.equal(JSON.stringify(result).includes(row.password_hash), false);
});

test('preview rolls back if the source query fails', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); if (/^\s*SELECT/.test(sql)) throw new Error('synthetic failure'); return { rows: [] }; } };
  await assert.rejects(previewAccounts(client), /synthetic failure/);
  assert.equal(calls.at(-1), 'ROLLBACK');
});
