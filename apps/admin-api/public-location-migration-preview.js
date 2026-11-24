// Read-only inventory; does not publish, import or modify source records.
async function previewPublicLocations(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const source = (await client.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE approved_for_publication AND authorization_active)::int AS publicly_authorized,
      count(*) FILTER (WHERE approved_for_publication AND authorization_active AND sales_authorized)::int AS public_sales,
      count(*) FILTER (WHERE approved_for_publication AND authorization_active AND service_authorized)::int AS public_service,
      count(*) FILTER (WHERE test_ride_authorized)::int AS test_ride_authorized,
      count(*) FILTER (WHERE partner_id IS NOT NULL)::int AS linked_partners,
      count(*) FILTER (WHERE substring(id::text,15,1) <> '7')::int AS non_v7_ids,
      count(*) FILTER (WHERE length(trim(display_name))=0 OR length(trim(city))=0 OR length(trim(address))=0 OR display_name ~ '[[:cntrl:]]' OR city ~ '[[:cntrl:]]' OR address ~ '[[:cntrl:]]')::int AS invalid_target_fields
      FROM partners.public_locations`)).rows[0];
    const targetExists = (await client.query("SELECT to_regclass('alsvid_v2.public_locations') IS NOT NULL AS present")).rows[0].present;
    const target = targetExists ? (await client.query('SELECT count(*)::int AS total FROM alsvid_v2.public_locations')).rows[0] : null;
    const mappingExists = (await client.query("SELECT to_regclass('alsvid_v2.public_location_migration_sources') IS NOT NULL AS present")).rows[0].present;
    const mapping = mappingExists ? (await client.query('SELECT count(*)::int AS total FROM alsvid_v2.public_location_migration_sources')).rows[0] : null;
    await client.query('ROLLBACK');
    return { source, target, mapping, warnings: ['source_ids_partner_links_and_test_ride_authorization_require_preservation', 'publication_and_authorization_require_review'] };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}

module.exports = { previewPublicLocations };
