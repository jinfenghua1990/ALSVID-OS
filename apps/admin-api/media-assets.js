'use strict';

const { createHash } = require('node:crypto');
const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { isUuidv7, uuidv7 } = require('./uuidv7');

const CONTENT_TYPES = {
  'image/jpeg': { kind: 'image', max: 10 * 1024 * 1024 },
  'image/png': { kind: 'image', max: 10 * 1024 * 1024 },
  'image/webp': { kind: 'image', max: 10 * 1024 * 1024 },
  'image/avif': { kind: 'image', max: 10 * 1024 * 1024 },
  'video/mp4': { kind: 'video', max: 30 * 1024 * 1024 },
  'video/webm': { kind: 'video', max: 30 * 1024 * 1024 },
  'application/pdf': { kind: 'other', max: 10 * 1024 * 1024 },
};
const KINDS = ['image', 'video', 'other'];
const CATEGORIES = ['product', 'page', 'other'];
const USAGE_SOURCES = [
  ['catalog_publications', '官网商品发布'],
  ['storefront_listings', '渠道商品'],
  ['site_pages', '官网页面'],
  ['site_page_versions', '页面历史版本'],
  ['storefront_layout_drafts', '可视化装修草稿'],
];

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function optionalText(value, max) {
  if (value == null) return '';
  if (typeof value !== 'string') fail('素材资料格式无效');
  return value.trim().slice(0, max);
}

// 旧的发布/装修表把素材 id 或 objectKey 直接存进 JSON 文本，删除前必须一并检查。
async function findLegacyUsages(pool, id, objectKey) {
  const sources = [];
  for (const [table, label] of USAGE_SOURCES) {
    const textColumn = table === 'storefront_layout_drafts' ? 'project::text'
      : table === 'site_page_versions' ? "coalesce(snapshot::text,'')"
      : table === 'site_pages' ? "coalesce(draft::text,'')||coalesce(published::text,'')"
      : "coalesce(draft::text,'')||coalesce(published::text,'')";
    const row = (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE position($1 in ${textColumn})>0 OR position($2 in ${textColumn})>0`, [id, objectKey])).rows[0];
    if (row.n > 0) sources.push({ table, label, count: row.n });
  }
  return sources;
}

function createMediaAssetStore(url, objectStorage) {
  const pool = createPool(url, { max: 3, connectionTimeoutMillis: 10000 });
  const columns = 'id::text AS id,object_key AS "objectKey",file_name AS "fileName",content_type AS "contentType",kind,category,size_bytes::bigint AS "sizeBytes",label,created_by AS "createdBy",created_at AS "createdAt"';
  const usageOf = (id, objectKey) => findLegacyUsages(pool, id, objectKey);
  async function load(id) {
    const row = (await pool.query(`SELECT ${columns} FROM media_assets WHERE id=$1`, [id])).rows[0];
    if (!row) fail('素材不存在', 404);
    return row;
  }
  return {
    async list(query = {}) {
      const filters = [], values = [];
      if (query.kind) {
        if (!KINDS.includes(query.kind)) fail('素材类型无效');
        values.push(query.kind); filters.push(`kind=$${values.length}`);
      }
      if (query.category) {
        if (!CATEGORIES.includes(query.category)) fail('素材分类无效');
        values.push(query.category); filters.push(`category=$${values.length}`);
      }
      const search = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';
      if (search) { values.push(search.toLocaleLowerCase()); filters.push(`(position($${values.length} in lower(file_name))>0 OR position($${values.length} in lower(label))>0)`); }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      return (await pool.query(`SELECT ${columns} FROM media_assets ${where} ORDER BY created_at DESC,id DESC LIMIT 300`, values)).rows;
    },
    async upload({ contentType, fileName, category, label, body }) {
      if (!objectStorage) fail('对象存储尚未配置', 503);
      const type = CONTENT_TYPES[contentType];
      if (!type) fail('不支持的文件类型，仅支持 JPG、PNG、WebP、AVIF、MP4、WebM 和 PDF');
      if (!Buffer.isBuffer(body) || !body.length) fail('请选择有效的素材文件');
      if (body.length > type.max) fail(`文件不能超过 ${Math.round(type.max / 1024 / 1024)} MB`);
      if (!CATEGORIES.includes(category || 'other')) fail('素材分类无效');
      const checksum = createHash('sha256').update(body).digest('hex');
      const existing = (await pool.query(`SELECT ${columns} FROM media_assets WHERE checksum=$1`, [checksum])).rows[0];
      if (existing) return { asset: existing, reused: true };
      const id = uuidv7(), key = `media/${id}`;
      await objectStorage.put({ key, contentType, body });
      try {
        const head = await objectStorage.head(key);
        if (!head || Number(head.size) !== body.length) throw new Error('素材上传校验失败');
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const row = (await c.query(
          `INSERT INTO media_assets(id,object_key,checksum,file_name,content_type,kind,category,size_bytes,label,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${columns}`,
          [id, key, checksum, optionalText(fileName, 200), contentType, type.kind, category || 'other', body.length, optionalText(label, 200), currentActor()]
          )).rows[0];
          await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'media.upload', `media-assets/${id}`, null, JSON.stringify(row)]);
          await c.query('COMMIT');
          return { asset: row, reused: false };
        } catch (error) {
          await c.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          c.release();
        }
      } catch (error) {
        await objectStorage.remove(key).catch(() => {});
        if (error.code === '23505') {
          const raced = (await pool.query(`SELECT ${columns} FROM media_assets WHERE checksum=$1`, [checksum])).rows[0];
          if (raced) return { asset: raced, reused: true };
        }
        throw error;
      }
    },
    async update(id, input = {}) {
      if (!isUuidv7(id)) fail('素材不存在', 404);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const before = (await c.query(`SELECT ${columns} FROM media_assets WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!before) fail('素材不存在', 404);
        const label = input.label === undefined ? before.label : optionalText(input.label, 200);
        const category = input.category === undefined ? before.category : input.category;
        if (!CATEGORIES.includes(category)) fail('素材分类无效');
        const row = (await c.query(`UPDATE media_assets SET label=$1,category=$2 WHERE id=$3 RETURNING ${columns}`, [label, category, id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'media.update', `media-assets/${id}`, JSON.stringify(before), JSON.stringify(row)]);
        await c.query('COMMIT');
        return row;
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        c.release();
      }
    },
    async remove(id) {
      if (!isUuidv7(id)) fail('素材不存在', 404);
      const asset = await load(id);
      const usages = await usageOf(asset.id, asset.objectKey);
      if (usages.length) fail(`该素材正在被${usages.map(item => item.label).join('、')}引用，请先解除引用后再删除`, 409);
      await pool.query('DELETE FROM media_assets WHERE id=$1', [id]);
      if (objectStorage) await objectStorage.remove(asset.objectKey).catch(() => {});
      await pool.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'media.delete', `media-assets/${id}`, JSON.stringify(asset), null]);
      return { ok: true };
    },
    async file(id) {
      if (!isUuidv7(id)) return null;
      const asset = (await pool.query('SELECT object_key AS key,content_type AS "contentType",file_name AS "fileName" FROM media_assets WHERE id=$1', [id])).rows[0];
      if (!asset) return null;
      if (!objectStorage) fail('对象存储尚未配置', 503);
      return { asset, object: await objectStorage.get(asset.key) };
    },
    close: () => pool.end(),
  };
}

function registerMediaAssetRoutes(app, store) {
  function route(method, url, handler, adminOnly = false) {
    app.route({ method, url, handler: async (req, reply) => {
      if (adminOnly && req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可管理素材空间' });
      if (!store) return reply.code(503).send({ error: '素材空间服务暂不可用' });
      try { return await handler(req, reply); }
      catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '素材空间操作失败' }); }
    } });
  }
  route('GET', '/api/media-assets', req => store.list({ kind: req.query.kind || '', category: req.query.category || '', q: req.query.q || '' }));
  route('POST', '/api/media-assets', async (req, reply) => {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
    let fileName = ''; try { fileName = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch (_) { fileName = ''; }
    let label = ''; try { label = decodeURIComponent(String(req.headers['x-label'] || '')); } catch (_) { label = ''; }
    const result = await store.upload({ contentType, fileName, category: String(req.headers['x-category'] || 'other'), label, body: req.body });
    return reply.code(result.reused ? 200 : 201).send({ ...result.asset, reused: result.reused });
  }, true);
  route('PATCH', '/api/media-assets/:id', req => store.update(req.params.id, req.body || {}), true);
  route('DELETE', '/api/media-assets/:id', req => store.remove(req.params.id), true);
  route('GET', '/api/media-assets/:id/file', async (req, reply) => {
    const result = await store.file(req.params.id);
    if (!result) return reply.code(404).send({ error: '素材不存在' });
    reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=86400');
    return reply.type(result.asset.contentType).send(result.object.Body);
  });
}

module.exports = { createMediaAssetStore, registerMediaAssetRoutes, CONTENT_TYPES, findLegacyUsages };
