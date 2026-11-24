// Explicit operator invocation only; preserves source records without creating
// a V2 application, inventing a telephone number, or approving a dealer.
async function archiveDealerApplications(client, actor) {
  if (typeof actor !== 'string' || !actor.trim()) throw Error('Migration actor required');
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('alsvid-dealer-application-archive',0))");
    const rows = (await client.query(`SELECT a.id::text AS source_id,to_jsonb(a) AS snapshot,
      x.source_id IS NOT NULL AS archived,
      CASE WHEN x.source_id IS NULL THEN NULL ELSE x.source_snapshot=to_jsonb(a) END AS unchanged
      FROM partners.dealer_applications a LEFT JOIN alsvid_v2.dealer_application_source_archive x ON x.source_id=a.id ORDER BY a.id`)).rows;
    if (rows.some(row => row.archived && !row.unchanged)) throw Error('Source application changed since archival; review required');
    const pending = rows.filter(row => !row.archived);
    for (const row of pending) {
      await client.query('INSERT INTO alsvid_v2.dealer_application_source_archive(source_id,source_snapshot) VALUES($1,$2)', [row.source_id, JSON.stringify(row.snapshot)]);
      await client.query('INSERT INTO alsvid_v2.audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', [actor.trim(),'dealer_application.archive',`dealer-application-sources/${row.source_id}`,JSON.stringify({sourceId:row.source_id})]);
    }
    await client.query('COMMIT');
    return { sourceCount: rows.length, archived: pending.length, alreadyArchived: rows.length - pending.length };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}
module.exports = { archiveDealerApplications };
