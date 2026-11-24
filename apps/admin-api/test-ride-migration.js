const { uuidv7 } = require('./uuidv7');
const { normalizeTestRide } = require('./test-rides');

// Explicit operator invocation only. Import does not send notifications.
async function migrateTestRides(client, actor) {
  if (typeof actor !== 'string' || !actor.trim()) throw Error('Migration actor required');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('alsvid-test-ride-migration',0))");
    const rows = (await client.query(`SELECT r.*,to_jsonb(r) AS source_snapshot,m.target_id AS existing_target,
      CASE WHEN m.source_id IS NULL THEN NULL ELSE m.source_snapshot=to_jsonb(r) END AS snapshot_matches,
      lm.target_id AS mapped_location FROM partners.test_ride_enquiries r
      LEFT JOIN alsvid_v2.test_ride_migration_sources m ON m.source_id=r.id
      LEFT JOIN alsvid_v2.public_location_migration_sources lm ON lm.source_id=r.assigned_location_id ORDER BY r.id`)).rows;
    const pending=[];
    for(const row of rows){
      if(row.existing_target){if(!row.snapshot_matches)throw Error('Source test ride changed; review required');continue;}
      const input=normalizeTestRide({purpose:'test_ride',name:row.name||'',email:row.email,country:row.country_code,city:row.city,model:row.model,colour:row.colour,locale:row.locale});
      if(!input || !['NEW','REVIEWING','CONTACTED','CLOSED'].includes(row.status) || !['PENDING','SENT','FAILED','UNCONFIGURED'].includes(row.notification_state))throw Error('Source test ride requires review');
      if(row.assigned_location_id&&!row.mapped_location)throw Error('Assigned source location requires mapping');
      pending.push({row,input,id:uuidv7()});
    }
    for(const {row,input,id} of pending){
      await client.query(`INSERT INTO alsvid_v2.test_ride_enquiries(id,name,email,country_code,city,model,colour,locale,status,notification_state,consent_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,input.name,input.email,input.country,input.city,input.model,input.colour,input.locale,row.status,row.notification_state,row.consent_at,row.created_at,row.updated_at]);
      await client.query(`INSERT INTO alsvid_v2.test_ride_migration_sources(source_id,target_id,source_location_id,target_location_id,source_snapshot)
        VALUES($1,$2,$3,$4,$5)`,[row.id,id,row.assigned_location_id||null,row.mapped_location||null,JSON.stringify(row.source_snapshot)]);
      await client.query('INSERT INTO alsvid_v2.audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[actor.trim(),'test_ride.migrate',`test-rides/${id}`,JSON.stringify({sourceId:row.id})]);
    }
    await client.query('COMMIT');
    return {sourceCount:rows.length,imported:pending.length,alreadyMapped:rows.length-pending.length};
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
module.exports={migrateTestRides};
