// Aggregate-only, read-only reconciliation. It never changes publication state.
async function reconcilePublicLocations(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const source = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE m.source_id IS NULL)::int AS unmapped,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND m.source_snapshot IS DISTINCT FROM to_jsonb(l))::int AS source_changed,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND v.id IS NULL)::int AS missing_target,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND m.source_partner_id IS DISTINCT FROM l.partner_id)::int AS partner_changed,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND m.source_test_ride_authorized IS DISTINCT FROM l.test_ride_authorized)::int AS test_ride_authorization_changed
      FROM partners.public_locations l LEFT JOIN alsvid_v2.public_location_migration_sources m ON m.source_id=l.id
      LEFT JOIN alsvid_v2.public_locations v ON v.id=m.target_id`)).rows[0];
    const mapping = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE l.id IS NULL)::int AS source_missing,
      count(*) FILTER (WHERE v.id IS NULL)::int AS target_missing
      FROM alsvid_v2.public_location_migration_sources m LEFT JOIN partners.public_locations l ON l.id=m.source_id
      LEFT JOIN alsvid_v2.public_locations v ON v.id=m.target_id`)).rows[0];
    await client.query('ROLLBACK');
    return { source, mapping };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
module.exports = { reconcilePublicLocations };
