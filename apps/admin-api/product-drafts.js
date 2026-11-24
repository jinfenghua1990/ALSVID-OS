const { createPool } = require('./db-pool');
const { isUuidv7 } = require('./uuidv7');
const { currentActor } = require('./audit-context');
const { isDeepStrictEqual } = require('node:util');

function createProductDrafts(connectionString) {
  const pool = createPool(connectionString, { max: 2, connectionTimeoutMillis: 10000 });
  return {
    async get(userUuid, kind) {
      const row = (await pool.query('SELECT draft,version,updated_at AS "updatedAt" FROM product_creation_drafts WHERE user_uuid=$1 AND kind=$2',[userUuid,kind])).rows[0];
      return row || null;
    },
    async save(userUuid, kind, draft, expectedVersion) {
      if (!isUuidv7(userUuid) || !['vehicle','part'].includes(kind) || !draft || typeof draft !== 'object' || Array.isArray(draft) || draft.kind !== kind || !isUuidv7(draft.id) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
        const error = new Error('产品暂存资料无效'); error.statusCode = 400; throw error;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${userUuid}:${kind}`]);
        const old = (await client.query('SELECT id,draft,version,updated_at AS "updatedAt" FROM product_creation_drafts WHERE user_uuid=$1 AND kind=$2 FOR UPDATE',[userUuid,kind])).rows[0] || null;
        if ((old?.version || 0) !== expectedVersion) {
          if (old && isDeepStrictEqual(old.draft,draft)) { await client.query('COMMIT'); return old; }
          const error = new Error('产品暂存已在其他页面更新，请刷新后再保存'); error.statusCode = 409; throw error;
        }
        const row = old
          ? (await client.query('UPDATE product_creation_drafts SET draft=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING draft,version,updated_at AS "updatedAt"',[JSON.stringify(draft),old.id])).rows[0]
          : (await client.query('INSERT INTO product_creation_drafts(user_uuid,kind,draft) VALUES($1,$2,$3) RETURNING draft,version,updated_at AS "updatedAt"',[userUuid,kind,JSON.stringify(draft)])).rows[0];
        await client.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'product.draft.save',`product-drafts/${kind}`,old?JSON.stringify({version:old.version}):null,JSON.stringify({version:row.version})]);
        await client.query('COMMIT');
        return row;
      } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally { client.release(); }
    },
    async remove(userUuid, kind, expectedVersion) {
      if (!isUuidv7(userUuid) || !['vehicle','part'].includes(kind) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) { const error = new Error('产品暂存资料无效'); error.statusCode = 400; throw error; }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${userUuid}:${kind}`]);
        const old = (await client.query('SELECT id,version FROM product_creation_drafts WHERE user_uuid=$1 AND kind=$2 FOR UPDATE',[userUuid,kind])).rows[0] || null;
        if (old && old.version !== expectedVersion) { const error = new Error('产品暂存已在其他页面更新，未清除'); error.statusCode = 409; throw error; }
        const row = old ? (await client.query('DELETE FROM product_creation_drafts WHERE id=$1 RETURNING version',[old.id])).rows[0] : null;
        if (row) await client.query('INSERT INTO audit_log(actor,action,target,before_json) VALUES($1,$2,$3,$4)',[currentActor(),'product.draft.delete',`product-drafts/${kind}`,JSON.stringify({version:row.version})]);
        await client.query('COMMIT');
        return { deleted: Boolean(row) };
      } catch (error) {
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally { client.release(); }
    },
    close() { return pool.end(); },
  };
}

function registerProductDraftRoutes(app, drafts) {
  app.get('/api/product-drafts/:kind',async(req,reply)=>{
    if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可访问产品暂存'});
    if(!['vehicle','part'].includes(req.params.kind))return reply.code(400).send({error:'产品暂存类型无效'});
    if(!drafts)return reply.code(503).send({error:'云端产品暂存服务不可用'});
    try{return await drafts.get(req.user.entityUuid,req.params.kind)}catch(_){return reply.code(500).send({error:'读取云端产品暂存失败'})}
  });
  app.put('/api/product-drafts/:kind',async(req,reply)=>{
    if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可访问产品暂存'});
    if(!drafts)return reply.code(503).send({error:'云端产品暂存服务不可用'});
    try{return await drafts.save(req.user.entityUuid,req.params.kind,req.body?.draft,req.body?.expectedVersion)}catch(error){return reply.code(error.statusCode||500).send({error:error.statusCode?error.message:'保存云端产品暂存失败'})}
  });
  app.delete('/api/product-drafts/:kind',async(req,reply)=>{
    if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可访问产品暂存'});
    if(!drafts)return reply.code(503).send({error:'云端产品暂存服务不可用'});
    try{return await drafts.remove(req.user.entityUuid,req.params.kind,req.body?.expectedVersion)}catch(error){return reply.code(error.statusCode||500).send({error:error.statusCode?error.message:'清除云端产品暂存失败'})}
  });
}

module.exports = { createProductDrafts, registerProductDraftRoutes };
