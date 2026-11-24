// Only counts are returned; application contents remain in the protected source tables.
async function reconcileDealerApplications(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const source = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE x.source_id IS NULL)::int AS unarchived,
      count(*) FILTER (WHERE x.source_id IS NOT NULL AND x.source_snapshot IS DISTINCT FROM to_jsonb(a))::int AS source_changed
      FROM partners.dealer_applications a LEFT JOIN alsvid_v2.dealer_application_source_archive x ON x.source_id=a.id`)).rows[0];
    const archive = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE a.id IS NULL)::int AS source_missing
      FROM alsvid_v2.dealer_application_source_archive x LEFT JOIN partners.dealer_applications a ON a.id=x.source_id`)).rows[0];
    await client.query('ROLLBACK');
    return { source, archive };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
module.exports = { reconcileDealerApplications };
