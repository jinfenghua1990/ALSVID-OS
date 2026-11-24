async function reconcileTestRides(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const source=(await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE m.source_id IS NULL)::int AS unmapped,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND m.source_snapshot IS DISTINCT FROM to_jsonb(r))::int AS source_changed,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND t.id IS NULL)::int AS target_missing,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND m.source_location_id IS DISTINCT FROM r.assigned_location_id)::int AS source_location_changed,
      count(*) FILTER (WHERE r.assigned_location_id IS NOT NULL AND lm.target_id IS NULL)::int AS location_unmapped,
      count(*) FILTER (WHERE m.source_id IS NOT NULL AND m.target_location_id IS DISTINCT FROM lm.target_id)::int AS target_location_mismatch
      FROM partners.test_ride_enquiries r LEFT JOIN alsvid_v2.test_ride_migration_sources m ON m.source_id=r.id
      LEFT JOIN alsvid_v2.test_ride_enquiries t ON t.id=m.target_id
      LEFT JOIN alsvid_v2.public_location_migration_sources lm ON lm.source_id=r.assigned_location_id`)).rows[0];
    const mapping=(await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE r.id IS NULL)::int AS source_missing,
      count(*) FILTER (WHERE t.id IS NULL)::int AS target_missing
      FROM alsvid_v2.test_ride_migration_sources m LEFT JOIN partners.test_ride_enquiries r ON r.id=m.source_id
      LEFT JOIN alsvid_v2.test_ride_enquiries t ON t.id=m.target_id`)).rows[0];
    await client.query('ROLLBACK');
    return {source,mapping};
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
module.exports={reconcileTestRides};
