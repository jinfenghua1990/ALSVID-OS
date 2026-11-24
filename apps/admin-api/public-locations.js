const { createPool } = require('./db-pool');
const { isUuidv7, uuidv7 } = require('./uuidv7');
const { currentActor } = require('./audit-context');

function normalizeLocation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const fields = ['name', 'city', 'address'];
  if (fields.some(field => typeof input[field] !== 'string')) return null;
  const [name, city, address] = fields.map(field => input[field].trim());
  if (!name || name.length > 160 || !city || city.length > 120 || !address || address.length > 500 || /[\x00-\x1f\x7f]/.test(name + city + address)) return null;
  if (!['DE', 'AT'].includes(input.country) || ['sales', 'service', 'approvedForPublication', 'authorizationActive'].some(field => typeof input[field] !== 'boolean')) return null;
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) return null;
  return { name, city, address, country: input.country, sales: input.sales, service: input.service, approvedForPublication: input.approvedForPublication, authorizationActive: input.authorizationActive, revision: input.revision };
}

function createPublicLocationsStore(connectionString) {
  const pool = createPool(connectionString, { max: 2 });
  return {
    async adminList() {
      return (await pool.query('SELECT id,name,country_code AS country,city,address,sales,service,approved_for_publication AS "approvedForPublication",authorization_active AS "authorizationActive",revision,updated_at AS "updatedAt" FROM public_locations ORDER BY country_code,city,name,id')).rows;
    },
    async source(id) {
      return (await pool.query(`SELECT source_id AS "sourceId",source_partner_id AS "partnerId",source_test_ride_authorized AS "testRideAuthorized",
        source_snapshot AS snapshot,captured_at AS "capturedAt" FROM public_location_migration_sources WHERE target_id=$1`, [id])).rows[0] || null;
    },
    async save(id, input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const values = [id,input.name,input.country,input.city,input.address,input.sales,input.service,input.approvedForPublication,input.authorizationActive];
        const result = input.revision === 0
          ? await client.query('INSERT INTO public_locations(id,name,country_code,city,address,sales,service,approved_for_publication,authorization_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING revision', values)
          : await client.query('UPDATE public_locations SET name=$2,country_code=$3,city=$4,address=$5,sales=$6,service=$7,approved_for_publication=$8,authorization_active=$9,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$10 RETURNING revision', [...values,input.revision]);
        if (!result.rowCount) { await client.query('ROLLBACK'); return null; }
        if (input.revision > 0 && (!input.approvedForPublication || !input.authorizationActive)) {
          const authorizationsReady = (await client.query("SELECT to_regclass('alsvid_v2.test_ride_location_authorizations') IS NOT NULL AS present")).rows[0].present;
          if (authorizationsReady) {
            await client.query('UPDATE test_ride_location_authorizations SET test_ride_authorized=false,revision=revision+1,updated_at=now() WHERE location_id=$1 AND test_ride_authorized=true', [id]);
          }
          const assignmentsReady = (await client.query("SELECT to_regclass('alsvid_v2.test_ride_assignment_events') IS NOT NULL AS present")).rows[0].present;
          if (assignmentsReady) {
            const cleared = (await client.query("UPDATE test_ride_enquiries SET assigned_location_id=NULL,version=version+1,updated_at=now() WHERE assigned_location_id=$1 AND status IN ('NEW','REVIEWING','CONTACTED') RETURNING id", [id])).rows;
            for (const row of cleared) await client.query('INSERT INTO test_ride_assignment_events(id,enquiry_id,previous_location_id,location_id,actor) VALUES($1,$2,$3,NULL,$4)', [uuidv7(),row.id,id,currentActor()]);
          }
        }
        await client.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', [currentActor(),'public_location.save',`public-locations/${id}`,JSON.stringify({ revision: result.rows[0].revision, approved: input.approvedForPublication, authorized: input.authorizationActive })]);
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async list(capability) {
      const column = capability === 'sales' ? 'sales' : 'service';
      return (await pool.query(`SELECT id,name,country_code AS country,city,address,sales,service FROM public_locations
        WHERE approved_for_publication=true AND authorization_active=true AND ${column}=true ORDER BY country_code,city,name,id`)).rows;
    },
    close: () => pool.end(),
  };
}

function registerPublicLocationRoutes(app, store) {
  app.get('/api/public/dealer-locations', { config: { publicLocations: true } }, async (req, reply) => {
    const capability = req.query?.capability;
    if (!['sales', 'service'].includes(capability)) return reply.code(400).send({ error: '网点类型无效' });
    if (!store) return reply.code(503).send({ error: '网点目录暂不可用' });
    try { return { data: await store.list(capability) }; }
    catch (_) { return reply.code(503).send({ error: '网点目录暂不可用' }); }
  });
  app.get('/api/public-locations', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可维护公开网点' });
    if (!store) return reply.code(503).send({ error: '网点目录暂不可用' });
    try { return { data: await store.adminList() }; } catch (_) { return reply.code(503).send({ error: '网点目录暂不可用' }); }
  });
  app.get('/api/public-locations/:id/source', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看迁移来源' });
    if (!isUuidv7(req.params.id)) return reply.code(400).send({ error: '公开网点编号无效' });
    if (!store) return reply.code(503).send({ error: '网点来源暂不可用' });
    try { return { data: await store.source(req.params.id) }; } catch (_) { return reply.code(503).send({ error: '网点来源暂不可用' }); }
  });
  app.put('/api/public-locations/:id', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可维护公开网点' });
    const input = normalizeLocation(req.body);
    if (!isUuidv7(req.params.id) || !input) return reply.code(400).send({ error: '公开网点资料无效' });
    if (!store) return reply.code(503).send({ error: '网点目录暂不可用' });
    try { const result = await store.save(req.params.id, input); return result ? { data: result } : reply.code(409).send({ error: '网点已被修改，请刷新后重试' }); }
    catch (_) { return reply.code(503).send({ error: '网点目录暂不可用' }); }
  });
}

module.exports = { normalizeLocation, createPublicLocationsStore, registerPublicLocationRoutes };
