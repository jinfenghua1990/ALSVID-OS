const { parseV1Password } = require('./passwords');

// This report is deliberately not a migration. IDs and review reasons are
// returned, but email addresses and password hashes never leave this function.
function classifyAccount(row) {
  const issues = [];
  if (row.status !== 'ACTIVE') issues.push('source_not_active');
  if (!row.email_verified) issues.push('source_email_unverified');
  if (row.password_state !== 'ACTIVE') issues.push('password_setup_or_reset_required');
  if (row.force_password_setup === null) issues.push('source_security_policy_missing');
  if (!parseV1Password(row.password_hash)) issues.push('password_not_compatible');
  if (Number(row.target_matches) > 0) issues.push('target_username_exists');
  if (!Array.isArray(row.roles) || row.roles.length === 0) issues.push('source_role_missing');
  issues.push('role_and_entitlements_require_review');
  return {
    sourceId: row.source_id,
    sourceRoles: Array.isArray(row.roles) ? row.roles : [],
    targetMatchCount: Number(row.target_matches),
    targetRoles: Array.isArray(row.target_roles) ? row.target_roles : [],
    issues,
  };
}

async function previewAccounts(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const { rows } = await client.query(`
      SELECT u.id::text AS source_id, u.status, u.email_verified_at IS NOT NULL AS email_verified,
        u.password_state, u.password_hash,
        (SELECT force_password_setup FROM identity.security_policy WHERE id='default') AS force_password_setup,
        ARRAY(SELECT r.role_id FROM identity.user_roles r WHERE r.user_id=u.id ORDER BY r.role_id) AS roles,
        (SELECT count(*)::int FROM alsvid_v2.app_users a WHERE lower(a.username)=lower(u.email)) AS target_matches,
        ARRAY(SELECT DISTINCT a.role FROM alsvid_v2.app_users a WHERE lower(a.username)=lower(u.email) ORDER BY a.role) AS target_roles
      FROM identity.users u ORDER BY u.id`);
    const accounts = rows.map(classifyAccount);
    await client.query('ROLLBACK');
    return { accountCount: accounts.length, accounts };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

module.exports = { classifyAccount, previewAccounts };
