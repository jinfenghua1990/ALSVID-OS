const { uuidv7 } = require('./uuidv7');
const { normalizeLocation } = require('./public-locations');

// Explicitly invoked by an authorized migration operator; never runs at startup.
// Publishing and partner/test-ride authorization remain separate review steps.
async function migratePublicLocations(client, actor) {
  if (typeof actor !== 'string' || !actor.trim()) throw Error('Migration actor required');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('alsvid-public-location-migration',0))");
    const rows = (await client.query(`SELECT l.id::text AS source_id,l.partner_id::text AS partner_id,
      l.test_ride_authorized,l.display_name,l.country_code,l.city,l.address,l.sales_authorized,l.service_authorized,
      to_jsonb(l) AS source_snapshot,m.target_id::text AS target_id,
      CASE WHEN m.source_id IS NULL THEN NULL ELSE m.source_snapshot=to_jsonb(l) END AS snapshot_matches
      FROM partners.public_locations l LEFT JOIN alsvid_v2.public_location_migration_sources m ON m.source_id=l.id ORDER BY l.id`)).rows;
    const pending = [];
    for (const row of rows) {
      if (row.target_id) { if (!row.snapshot_matches) throw Error('Source location changed since migration; review required'); continue; }
      const input = normalizeLocation({ name: row.display_name, country: row.country_code, city: row.city, address: row.address,
        sales: row.sales_authorized, service: row.service_authorized, approvedForPublication: false, authorizationActive: false, revision: 0 });
      if (!input || typeof row.test_ride_authorized !== 'boolean') throw Error('Source location requires review');
      pending.push({ row, input, targetId: uuidv7() });
    }
    for (const { row, input, targetId } of pending) {
      await client.query(`INSERT INTO alsvid_v2.public_locations(id,name,country_code,city,address,sales,service,approved_for_publication,authorization_active)
        VALUES($1,$2,$3,$4,$5,$6,$7,false,false)`, [targetId,input.name,input.country,input.city,input.address,input.sales,input.service]);
      await client.query(`INSERT INTO alsvid_v2.public_location_migration_sources(source_id,target_id,source_partner_id,source_test_ride_authorized,source_snapshot)
        VALUES($1,$2,$3,$4,$5)`, [row.source_id,targetId,row.partner_id,row.test_ride_authorized,JSON.stringify(row.source_snapshot)]);
      await client.query('INSERT INTO alsvid_v2.audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', [actor.trim(),'public_location.migrate',`public-locations/${targetId}`,JSON.stringify({sourceId:row.source_id,approved:false,authorized:false})]);
    }
    await client.query('COMMIT');
    return { sourceCount: rows.length, imported: pending.length, alreadyMapped: rows.length - pending.length };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}

module.exports = { migratePublicLocations };
