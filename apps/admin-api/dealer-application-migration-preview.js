// Read-only summary: V1 has no phone field and its workflow states are not V2 decisions.
async function previewDealerApplications(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const source = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status='NEW')::int AS new,
      count(*) FILTER (WHERE status='REVIEWING')::int AS reviewing,
      count(*) FILTER (WHERE status='CONTACTED')::int AS contacted,
      count(*) FILTER (WHERE status='CLOSED')::int AS closed,
      count(*) FILTER (WHERE substring(id::text,15,1)<>'7')::int AS non_v7_ids
      FROM partners.dealer_applications`)).rows[0];
    const target = (await client.query('SELECT count(*)::int AS total FROM alsvid_v2.dealer_applications')).rows[0];
    await client.query('ROLLBACK');
    return { source, target, warnings: ['source_has_no_phone', 'source_status_is_not_approval_decision', 'preserve_original_application_and_consent'] };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
module.exports = { previewDealerApplications };
