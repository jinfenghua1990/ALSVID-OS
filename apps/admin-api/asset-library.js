'use strict';

// 统一素材库 API（P2）：media_assets + asset_links + asset_versions。
// kind 表示文件类型（image/video/other），category 表示业务分类（product/marketing/page）。
const { createHash } = require('node:crypto');
const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { isUuidv7, uuidv7 } = require('./uuidv7');
const { findLegacyUsages } = require('./media-assets');

const CONTENT_TYPES = {
  'image/jpeg': { kind: 'image', max: 10 * 1024 * 1024 },
  'image/png': { kind: 'image', max: 10 * 1024 * 1024 },
  'image/webp': { kind: 'image', max: 10 * 1024 * 1024 },
  'image/avif': { kind: 'image', max: 10 * 1024 * 1024 },
  'video/mp4': { kind: 'video', max: 30 * 1024 * 1024 },
  'video/webm': { kind: 'video', max: 30 * 1024 * 1024 },
  'application/pdf': { kind: 'other', max: 10 * 1024 * 1024 },
};
const CATEGORIES = ['product', 'marketing', 'page', 'other'];
const VISIBILITIES = ['public', 'internal'];
const STATUSES = ['draft', 'published', 'archived'];
const TARGET_TYPES = ['product', 'sku', 'part', 'page', 'campaign'];
const LINK_ROLES = ['hero', 'gallery', 'detail', 'package', 'certificate', 'drawing', 'banner', 'kv'];
const CHANNELS = ['product', 'storefront'];

// 产品素材的「用途」维度。用途以 folder 最后一段表达（兼容历史的「A1/主图」与新上传的「主图」），
// 产品归属始终以 asset_links.target_id=products.id 为准，绝不从文件名或用途反推。
const USAGES = [
  ['hero', '主图'], ['detail', '详情页'], ['technical', '技术图'], ['part', '零部件'],
  ['package', '包装'], ['manual', '说明书'], ['other', '其他'],
];
const USAGE_KEYS = USAGES.map(([key]) => key);
const USAGE_LABELS = Object.fromEntries(USAGES);
const USAGE_BY_LABEL = {
  '主图': 'hero', '首图': 'hero', '产品主图': 'hero', hero: 'hero',
  '详情页': 'detail', '详情': 'detail', '详情图': 'detail', detail: 'detail',
  '技术图': 'technical', '技术图纸': 'technical', '图纸': 'technical', technical: 'technical', drawing: 'technical',
  '零部件': 'part', '配件': 'part', '零配件': 'part', part: 'part',
  '包装': 'package', '包装图': 'package', package: 'package',
  '说明书': 'manual', '手册': 'manual', '使用说明书': 'manual', manual: 'manual',
  '其他': 'other', '其他素材': 'other', '杂项': 'other', other: 'other',
};
const ALL_USAGE_LABELS = Object.keys(USAGE_BY_LABEL);
const SHARED_ROOT = '通用素材';
// 用途 -> asset_links.role 的映射（role 枚举受数据库 CHECK 约束）
const USAGE_ROLE = { hero: 'hero', detail: 'detail', technical: 'drawing', part: 'gallery', package: 'package', manual: 'gallery', other: 'gallery' };
// 官网/商城把素材 id 直接写进 JSON 文本的表；用整行 ::text 扫描，自动覆盖后续新增列。
const USAGE_TABLES = ['catalog_publications', 'storefront_listings', 'site_pages', 'site_page_versions', 'storefront_layout_drafts'];

const ASSET_COLUMNS = 'id::text AS id,object_key AS "objectKey",checksum,file_name AS "fileName",content_type AS "contentType",kind,category,folder,size_bytes::bigint AS "sizeBytes",label,tags,langs,markets,visibility,status,created_by AS "createdBy",created_at AS "createdAt",updated_at AS "updatedAt"';
// 列表页附加字段：一次 SQL 带出产品关联与引用状态，避免前端 N+1 请求。
const LIST_EXTRA = `
 (SELECT count(*)::int FROM asset_links al WHERE al.asset_id=media_assets.id) AS "linkCount",
 (SELECT count(*)::int FROM asset_links al WHERE al.asset_id=media_assets.id AND al.target_type='product') AS "productLinkCount",
 COALESCE((SELECT json_agg(json_build_object('id',p.id,'name',p.name,'model',p.model) ORDER BY p.name,p.id)
   FROM asset_links al JOIN products p ON p.id=al.target_id
   WHERE al.asset_id=media_assets.id AND al.target_type='product'), '[]'::json) AS "linkedProducts"
`;
const VERSION_COLUMNS = 'id::text AS id,asset_id::text AS "assetId",version,object_key AS "objectKey",checksum,file_name AS "fileName",content_type AS "contentType",size_bytes::bigint AS "sizeBytes",is_current AS "isCurrent",note,created_by AS "createdBy",created_at AS "createdAt"';
const LINK_COLUMNS = 'id::text AS id,asset_id::text AS "assetId",target_type AS "targetType",target_id AS "targetId",role,channel,sort_order AS "sortOrder",created_by AS "createdBy",created_at AS "createdAt"';

function fail(message, statusCode = 400, details) {
  throw Object.assign(new Error(message), { statusCode, ...(details ? { details } : {}) });
}
function oneOf(value, allowed, message) {
  if (!allowed.includes(value)) fail(message);
  return value;
}
function optionalText(value, max) {
  if (value == null) return '';
  if (typeof value !== 'string') fail('素材资料格式无效');
  return value.trim().slice(0, max);
}
function normalizeFolder(value) {
  const text = optionalText(value, 200);
  if (!text) return '';
  const parts = text.split('/').map(part => part.trim()).filter(Boolean);
  if (parts.some(part => part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part))) fail('目录名称无效');
  return parts.join('/');
}
function textList(value, { max = 20, maxLength = 40, mode = '' } = {}) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail('素材标签格式无效');
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') fail('素材标签格式无效');
    const text = item.trim().slice(0, maxLength);
    if (!text) continue;
    const normalized = mode === 'upper' ? text.toUpperCase() : mode === 'lower' ? text.toLowerCase() : text;
    if (/[\u0000-\u001f\u007f]/.test(normalized)) fail('素材标签含有不支持的字符');
    if (!result.includes(normalized)) result.push(normalized);
  }
  if (result.length > max) fail(`标签最多 ${max} 项`);
  return result;
}
function headerText(value, max) {
  try { return decodeURIComponent(String(value || '')).trim().slice(0, max); }
  catch (_) { return ''; }
}
function metaOf(req) {
  const raw = req.headers['x-meta'];
  if (!raw) return {};
  if (String(raw).length > 4096) fail('素材信息过长');
  let parsed;
  try { parsed = JSON.parse(decodeURIComponent(String(raw))); }
  catch (_) { fail('素材信息格式无效'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('素材信息格式无效');
  return parsed;
}
function integer(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}
function unique(values) { return [...new Set(values)]; }
function folderTail(column) { return `regexp_replace(${column},'^.*/','')`; }
function usageOfFolder(folder) {
  const tail = String(folder || '').split('/').map(part => part.trim()).filter(Boolean).pop() || '';
  return USAGE_BY_LABEL[tail] || '';
}
function isSharedFolder(folder) {
  const text = String(folder || '').trim();
  return text === SHARED_ROOT || text.startsWith(`${SHARED_ROOT}/`);
}
// 上传/编辑时把结构化用途写回 folder；兼容直接传 folder 的旧调用。
function resolveFolder(meta = {}, fallback = '') {
  const usage = meta.usage == null || meta.usage === '' ? '' : oneOf(meta.usage, USAGE_KEYS, '素材用途无效');
  const shared = meta.shared === true || meta.shared === '1' || meta.shared === 'true';
  if (usage) return shared ? `${SHARED_ROOT}/${USAGE_LABELS[usage]}` : USAGE_LABELS[usage];
  if (shared) return SHARED_ROOT;
  return normalizeFolder(meta.folder === undefined ? fallback : meta.folder);
}

function createAssetLibraryStore(url, objectStorage) {
  const pool = createPool(url, { max: 3, connectionTimeoutMillis: 10000 });

  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async function audit(client, action, target, before, after) {
    await client.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [
      currentActor(), action, target, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after),
    ]);
  }
  async function load(id, client = pool) {
    if (!isUuidv7(id)) fail('素材不存在', 404);
    const row = (await client.query(`SELECT ${ASSET_COLUMNS} FROM media_assets WHERE id=$1`, [id])).rows[0];
    if (!row) fail('素材不存在', 404);
    return row;
  }
  async function enrichLinks(links) {
    const productIds = unique(links.filter(link => ['product', 'part'].includes(link.targetType)).map(link => link.targetId));
    const skuCodes = unique(links.filter(link => link.targetType === 'sku').map(link => link.targetId));
    const productNames = new Map();
    if (productIds.length) {
      const rows = (await pool.query('SELECT id,name FROM products WHERE id = ANY($1)', [productIds])).rows;
      for (const row of rows) productNames.set(row.id, row.name || '');
    }
    const skus = new Map();
    if (skuCodes.length) {
      const rows = (await pool.query('SELECT s.code,s.spec,s.color_code AS "colorCode",p.name AS "productName" FROM skus s LEFT JOIN products p ON p.id=s.product_id WHERE s.code = ANY($1)', [skuCodes])).rows;
      for (const row of rows) skus.set(row.code, row);
    }
    return links.map(link => {
      if (link.targetType === 'product' || link.targetType === 'part') return { ...link, targetLabel: productNames.get(link.targetId) || '' };
      if (link.targetType === 'sku') {
        const sku = skus.get(link.targetId);
        return {
          ...link,
          targetLabel: sku ? [sku.productName, sku.spec, sku.colorCode].filter(Boolean).join(' ') : '',
          skuSpec: sku?.spec || '',
          colorCode: sku?.colorCode || '',
        };
      }
      return { ...link, targetLabel: '' };
    });
  }
  async function targetExists(targetType, targetId) {
    if (targetType === 'product' || targetType === 'part') {
      return !!(await pool.query('SELECT 1 FROM products WHERE id=$1', [targetId])).rowCount;
    }
    if (targetType === 'sku') return !!(await pool.query('SELECT 1 FROM skus WHERE code=$1', [targetId])).rowCount;
    return true;
  }

  // 批量检测官网/商城 JSON 文本引用，返回 Map<assetId, 引用行数>。
  // 整行 ::text 扫描可覆盖 published/html/css/translations 等后续新增列，避免漏报。
  // 用一条 MATERIALIZED CTE 把 5 张表的文本只物化一次，避免逐表 × 逐素材重复转换整行。
  async function legacyUsageCounts(ids) {
    const counts = new Map();
    if (!ids.length) return counts;
    const docs = USAGE_TABLES.map(table => `SELECT t::text AS txt FROM ${table} t`).join(' UNION ALL ');
    const rows = (await pool.query(
      `WITH docs AS MATERIALIZED (${docs})
       SELECT u.id,count(*) FILTER (WHERE position(u.id in d.txt)>0)::int AS n
       FROM unnest($1::text[]) u(id) CROSS JOIN docs d
       GROUP BY u.id`,
      [ids]
    )).rows;
    for (const row of rows) if (Number(row.n) > 0) counts.set(row.id, Number(row.n));
    return counts;
  }

  // 产品维度索引：车型列表直接读「产品研发」产品档案，新增产品自动出现，无需手工建目录。
  async function productIndex() {
    const [products, categories, usageRows, special] = await Promise.all([
      pool.query(`
        SELECT p.id,p.name,p.model,p.status,count(DISTINCT a.id)::int AS total
        FROM products p
        LEFT JOIN asset_links l ON l.target_type='product' AND l.target_id=p.id
        LEFT JOIN media_assets a ON a.id=l.asset_id AND a.category='product'
        WHERE p.kind='vehicle'
        GROUP BY p.id,p.name,p.model,p.status
        ORDER BY p.name,p.id`),
      pool.query('SELECT category,count(*)::int AS total FROM media_assets GROUP BY category'),
      pool.query(`
        SELECT l.target_id AS "productId",${folderTail('a.folder')} AS label,count(*)::int AS total
        FROM asset_links l JOIN media_assets a ON a.id=l.asset_id
        WHERE l.target_type='product' AND a.category='product'
        GROUP BY 1,2`),
      pool.query(`
        SELECT
          count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM asset_links l WHERE l.asset_id=a.id AND l.target_type='product')
            AND NOT (a.folder='${SHARED_ROOT}' OR a.folder LIKE '${SHARED_ROOT}/%'))::int AS "unclassified",
          count(*) FILTER (WHERE a.folder='${SHARED_ROOT}' OR a.folder LIKE '${SHARED_ROOT}/%')::int AS "shared"
        FROM media_assets a WHERE a.category='product'`),
    ]);
    const usageMap = {}, globalUsage = {};
    for (const row of usageRows.rows) {
      const key = USAGE_BY_LABEL[String(row.label || '').trim()] || 'uncategorized';
      const count = Number(row.total);
      if (row.productId) {
        usageMap[row.productId] = usageMap[row.productId] || {};
        usageMap[row.productId][key] = (usageMap[row.productId][key] || 0) + count;
      }
      globalUsage[key] = (globalUsage[key] || 0) + count;
    }
    return {
      products: products.rows.map(row => ({ ...row, usages: usageMap[row.id] || {} })),
      categories: Object.fromEntries(categories.rows.map(row => [row.category, Number(row.total)])),
      globalUsage,
      shared: Number(special.rows[0]?.shared || 0),
      unclassified: Number(special.rows[0]?.unclassified || 0),
      usages: USAGES.map(([key, label]) => ({ key, label })),
    };
  }

  return {
    productIndex,
    async folders(query = {}) {
      const category = query.category ? oneOf(query.category, CATEGORIES, '素材分类无效') : '';
      const rows = (await pool.query(
        `SELECT folder,count(*)::int AS total FROM media_assets ${category ? 'WHERE category=$1' : ''} GROUP BY folder ORDER BY folder`,
        category ? [category] : []
      )).rows;
      return { items: rows };
    },

    async list(query = {}) {
      const filters = [], values = [];
      if (query.kind) { values.push(oneOf(query.kind, ['image', 'video', 'other'], '素材类型无效')); filters.push(`kind=$${values.length}`); }
      if (query.category) { values.push(oneOf(query.category, CATEGORIES, '素材分类无效')); filters.push(`category=$${values.length}`); }
      if (query.folder) { values.push(normalizeFolder(query.folder)); filters.push(`folder=$${values.length}`); }
      if (query.unfiled === '1') filters.push(`folder=''`);
      if (query.folderPrefix) { values.push(normalizeFolder(query.folderPrefix)); filters.push(`left(folder,length($${values.length}))=$${values.length}`); }
      if (query.status) { values.push(oneOf(query.status, STATUSES, '素材状态无效')); filters.push(`status=$${values.length}`); }
      if (query.visibility) { values.push(oneOf(query.visibility, VISIBILITIES, '素材可见性无效')); filters.push(`visibility=$${values.length}`); }
      if (query.tag) { values.push(String(query.tag).trim()); filters.push(`$${values.length} = ANY(tags)`); }
      if (query.lang) { values.push(String(query.lang).trim().toLowerCase()); filters.push(`$${values.length} = ANY(langs)`); }
      if (query.market) { values.push(String(query.market).trim().toUpperCase()); filters.push(`$${values.length} = ANY(markets)`); }
      // 按产品 ID 筛选（产品维度的主入口，不依赖文件名/标签/SKU）
      if (query.productId) {
        values.push(String(query.productId).trim().slice(0, 200));
        filters.push(`EXISTS (SELECT 1 FROM asset_links pl WHERE pl.asset_id=media_assets.id AND pl.target_type='product' AND pl.target_id=$${values.length})`);
      }
      // 归属范围：通用素材 / 待分类 / 已关联产品
      if (query.scope === 'shared') filters.push(`(folder='${SHARED_ROOT}' OR folder LIKE '${SHARED_ROOT}/%')`);
      else if (query.scope === 'unclassified') filters.push(`NOT EXISTS (SELECT 1 FROM asset_links ul WHERE ul.asset_id=media_assets.id AND ul.target_type='product') AND NOT (folder='${SHARED_ROOT}' OR folder LIKE '${SHARED_ROOT}/%')`);
      else if (query.scope === 'linked') filters.push(`EXISTS (SELECT 1 FROM asset_links ul WHERE ul.asset_id=media_assets.id AND ul.target_type='product')`);
      // 用途 TAB：folder 最后一段匹配；uncategorized 表示不在已知用途词表内
      if (query.usage === 'uncategorized') {
        values.push(ALL_USAGE_LABELS);
        filters.push(`NOT (${folderTail('media_assets.folder')} = ANY($${values.length}::text[]))`);
      } else if (query.usage) {
        const key = oneOf(query.usage, USAGE_KEYS, '素材用途无效');
        values.push(ALL_USAGE_LABELS.filter(label => USAGE_BY_LABEL[label] === key));
        filters.push(`${folderTail('media_assets.folder')} = ANY($${values.length}::text[])`);
      }
      const targetType = typeof query.targetType === 'string' ? query.targetType.trim() : '';
      const targetId = typeof query.targetId === 'string' ? query.targetId.trim().slice(0, 200) : '';
      if (targetType) {
        oneOf(targetType, TARGET_TYPES, '关联对象类型无效');
        if (!targetId) fail('请指定关联对象');
        values.push(targetType); const typeIndex = values.length;
        values.push(targetId); const idIndex = values.length;
        let channelSql = '';
        if (query.channel) { values.push(oneOf(query.channel, CHANNELS, '关联渠道无效')); channelSql = ` AND l.channel=$${values.length}`; }
        filters.push(`EXISTS (SELECT 1 FROM asset_links l WHERE l.asset_id=media_assets.id AND l.target_type=$${typeIndex} AND l.target_id=$${idIndex}${channelSql})`);
      }
      const search = typeof query.q === 'string' ? query.q.trim().toLowerCase().slice(0, 120) : '';
      if (search) {
        values.push(search); const index = values.length;
        filters.push(`(position($${index} in lower(file_name))>0 OR position($${index} in lower(label))>0
          OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE position($${index} in lower(t))>0)
          OR EXISTS (SELECT 1 FROM asset_links l WHERE l.asset_id=media_assets.id AND position($${index} in lower(l.target_id))>0))`);
      }
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
      const page = integer(query.page, 1, 1, 100000);
      const pageSize = integer(query.pageSize, 50, 1, 100);
      values.push(pageSize); const limitIndex = values.length;
      values.push((page - 1) * pageSize); const offsetIndex = values.length;
      const rows = (await pool.query(
        `SELECT ${ASSET_COLUMNS},${LIST_EXTRA},count(*) OVER()::int AS total FROM media_assets ${where} ORDER BY created_at DESC,id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        values
      )).rows;
      const total = rows.length ? rows[0].total : 0;
      const legacy = await legacyUsageCounts(rows.map(row => row.id));
      return {
        items: rows.map(({ total: _total, ...row }) => {
          const usage = usageOfFolder(row.folder);
          return {
            ...row,
            usage,
            usageLabel: USAGE_LABELS[usage] || '未分类',
            shared: isSharedFolder(row.folder),
            legacyRefCount: legacy.get(row.id) || 0,
          };
        }),
        total, page, pageSize,
      };
    },

    async detail(id) {
      const asset = await load(id);
      const links = (await pool.query(`SELECT ${LINK_COLUMNS} FROM asset_links WHERE asset_id=$1 ORDER BY channel,target_type,sort_order,created_at`, [id])).rows;
      const versions = (await pool.query(`SELECT ${VERSION_COLUMNS} FROM asset_versions WHERE asset_id=$1 ORDER BY version DESC`, [id])).rows;
      const legacy = await legacyUsageCounts([id]);
      return {
        ...asset,
        usage: usageOfFolder(asset.folder),
        usageLabel: USAGE_LABELS[usageOfFolder(asset.folder)] || '未分类',
        shared: isSharedFolder(asset.folder),
        legacyRefCount: legacy.get(id) || 0,
        links: await enrichLinks(links), versions,
      };
    },

    async upload({ contentType, fileName, meta, body, trustedHomeSvg = false }) {
      if (!objectStorage) fail('对象存储尚未配置', 503);
      const type = CONTENT_TYPES[contentType] || (trustedHomeSvg && contentType === 'image/svg+xml' ? { kind: 'image', max: 1024 * 1024 } : null);
      if (!type) fail('不支持的文件类型，仅支持 JPG、PNG、WebP、AVIF、MP4、WebM 和 PDF');
      if (!Buffer.isBuffer(body) || !body.length) fail('请选择有效的素材文件');
      if (body.length > type.max) fail(`文件不能超过 ${Math.round(type.max / 1024 / 1024)} MB`);
      if (meta.category == null) fail('请选择素材分类');
      const category = oneOf(meta.category, CATEGORIES, '素材分类无效');
      const status = meta.status == null ? 'draft' : oneOf(meta.status, STATUSES, '素材状态无效');
      const visibility = meta.visibility == null ? 'internal' : oneOf(meta.visibility, VISIBILITIES, '素材可见性无效');
      const folder = resolveFolder(meta);
      const label = optionalText(meta.label, 200);
      const tags = textList(meta.tags);
      const langs = textList(meta.langs, { mode: 'lower' });
      const markets = textList(meta.markets, { mode: 'upper' });
      const checksum = createHash('sha256').update(body).digest('hex');

      const existing = (await pool.query(`SELECT ${ASSET_COLUMNS} FROM media_assets WHERE checksum=$1`, [checksum])).rows[0];
      if (existing) return { asset: await mergeReused(existing, { label, folder, tags, langs, markets }), reused: true };

      const id = uuidv7(), key = `media/${id}`;
      await objectStorage.put({ key, contentType, body });
      try {
        const head = await objectStorage.head(key);
        if (!head || Number(head.size) !== body.length) throw new Error('素材上传校验失败');
        const asset = await tx(async client => {
          const row = (await client.query(
            `INSERT INTO media_assets(id,object_key,checksum,file_name,content_type,kind,category,folder,size_bytes,label,created_by,tags,langs,markets,visibility,status)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${ASSET_COLUMNS}`,
            [id, key, checksum, optionalText(fileName, 200), contentType, type.kind, category, folder, body.length, label, currentActor(), tags, langs, markets, visibility, status]
          )).rows[0];
          await client.query(`INSERT INTO asset_versions(asset_id,version,object_key,checksum,file_name,content_type,size_bytes,is_current,note,created_by)
            VALUES($1,1,$2,$3,$4,$5,$6,true,'初始版本',$7)`, [id, key, checksum, row.fileName, contentType, body.length, currentActor()]);
          await audit(client, 'asset.upload', `assets/${id}`, null, row);
          return row;
        });
        return { asset, reused: false };
      } catch (error) {
        await objectStorage.remove(key).catch(() => {});
        if (error.code === '23505') {
          const raced = (await pool.query(`SELECT ${ASSET_COLUMNS} FROM media_assets WHERE checksum=$1`, [checksum])).rows[0];
          if (raced) return { asset: await mergeReused(raced, { label, tags, langs, markets }), reused: true };
        }
        throw error;
      }
    },

    async replace(id, { contentType, fileName, note, meta, body }) {
      if (!objectStorage) fail('对象存储尚未配置', 503);
      const type = CONTENT_TYPES[contentType];
      if (!type) fail('不支持的文件类型，仅支持 JPG、PNG、WebP、AVIF、MP4、WebM 和 PDF');
      if (!Buffer.isBuffer(body) || !body.length) fail('请选择有效的素材文件');
      if (body.length > type.max) fail(`文件不能超过 ${Math.round(type.max / 1024 / 1024)} MB`);
      if (!isUuidv7(id)) fail('素材不存在', 404);
      const current = await load(id);
      const checksum = createHash('sha256').update(body).digest('hex');
      if (checksum === current.checksum) fail('新文件与当前版本完全相同');
      const occupied = (await pool.query('SELECT id::text AS id,label,file_name AS "fileName" FROM media_assets WHERE checksum=$1 AND id<>$2', [checksum, id])).rows[0];
      if (occupied) fail('相同文件已存在于素材库，请直接引用已有素材', 409, { existingAssetId: occupied.id, existingLabel: occupied.label || occupied.fileName || '' });

      const key = `media/${id}/${uuidv7()}`;
      await objectStorage.put({ key, contentType, body });
      try {
        const head = await objectStorage.head(key);
        if (!head || Number(head.size) !== body.length) throw new Error('素材上传校验失败');
        const result = await tx(async client => {
          const before = (await client.query(`SELECT ${ASSET_COLUMNS} FROM media_assets WHERE id=$1 FOR UPDATE`, [id])).rows[0];
          if (!before) fail('素材不存在', 404);
          if (before.checksum === checksum) fail('新文件与当前版本完全相同');
          const last = (await client.query('SELECT version FROM asset_versions WHERE asset_id=$1 ORDER BY version DESC LIMIT 1', [id])).rows[0];
          const version = (last?.version || 0) + 1;
          await client.query('UPDATE asset_versions SET is_current=false WHERE asset_id=$1 AND is_current', [id]);
          const versionRow = (await client.query(
            `INSERT INTO asset_versions(asset_id,version,object_key,checksum,file_name,content_type,size_bytes,is_current,note,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,true,$8,$9) RETURNING ${VERSION_COLUMNS}`,
            [id, version, key, checksum, optionalText(fileName, 200) || before.fileName, contentType, body.length, optionalText(note, 200), currentActor()]
          )).rows[0];
          const updated = (await client.query(
            `UPDATE media_assets SET object_key=$2,checksum=$3,file_name=$4,content_type=$5,kind=$6,size_bytes=$7,updated_at=now()
             WHERE id=$1 RETURNING ${ASSET_COLUMNS}`,
            [id, key, checksum, optionalText(fileName, 200) || before.fileName, contentType, type.kind, body.length]
          )).rows[0];
          if (meta && meta.label != null) {
            const label = optionalText(meta.label, 200);
            await client.query('UPDATE media_assets SET label=$2,updated_at=now() WHERE id=$1', [id, label]);
            updated.label = label;
          }
          await audit(client, 'asset.replace', `assets/${id}`, before, updated);
          return { asset: updated, version: versionRow };
        });
        return result;
      } catch (error) {
        await objectStorage.remove(key).catch(() => {});
        if (error.code === '23505') {
          const occupied = (await pool.query('SELECT id::text AS id,label,file_name AS "fileName" FROM media_assets WHERE checksum=$1 AND id<>$2', [checksum, id])).rows[0];
          fail('相同文件已存在于素材库，请直接引用已有素材', 409, occupied ? { existingAssetId: occupied.id, existingLabel: occupied.label || occupied.fileName || '' } : undefined);
        }
        throw error;
      }
    },

    async update(id, input = {}) {
      const before = await load(id);
      const label = input.label === undefined ? before.label : optionalText(input.label, 200);
      const folder = input.usage !== undefined || input.shared !== undefined
        ? resolveFolder(input, before.folder)
        : (input.folder === undefined ? before.folder : normalizeFolder(input.folder));
      const category = input.category === undefined ? before.category : oneOf(input.category, CATEGORIES, '素材分类无效');
      const tags = input.tags === undefined ? before.tags : textList(input.tags);
      const langs = input.langs === undefined ? before.langs : textList(input.langs, { mode: 'lower' });
      const markets = input.markets === undefined ? before.markets : textList(input.markets, { mode: 'upper' });
      const visibility = input.visibility === undefined ? before.visibility : oneOf(input.visibility, VISIBILITIES, '素材可见性无效');
      const status = input.status === undefined ? before.status : oneOf(input.status, STATUSES, '素材状态无效');
      const after = await tx(async client => {
        const row = (await client.query(
          `UPDATE media_assets SET label=$2,category=$3,folder=$4,tags=$5,langs=$6,markets=$7,visibility=$8,status=$9,updated_at=now()
           WHERE id=$1 RETURNING ${ASSET_COLUMNS}`,
          [id, label, category, folder, tags, langs, markets, visibility, status]
        )).rows[0];
        await audit(client, 'asset.update', `assets/${id}`, before, row);
        return row;
      });
      return after;
    },

    async addLink(id, input = {}) {
      await load(id);
      const targetType = oneOf(input.targetType, TARGET_TYPES, '关联对象类型无效');
      const targetId = optionalText(input.targetId, 200);
      if (!targetId) fail('请指定关联对象');
      const role = input.role == null ? 'gallery' : oneOf(input.role, LINK_ROLES, '素材用途无效');
      const channel = input.channel == null ? 'product' : oneOf(input.channel, CHANNELS, '关联渠道无效');
      const sortOrder = integer(input.sortOrder, 0, 0, 9999);
      if (!(await targetExists(targetType, targetId))) fail('关联对象不存在', 404);
      try {
        return await tx(async client => {
          const link = (await client.query(
            `INSERT INTO asset_links(asset_id,target_type,target_id,role,channel,sort_order,created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${LINK_COLUMNS}`,
            [id, targetType, targetId, role, channel, sortOrder, currentActor()]
          )).rows[0];
          await audit(client, 'asset.link.create', `assets/${id}`, null, link);
          return link;
        });
      } catch (error) {
        if (error.code === '23505') fail('该素材已关联到同一位置', 409);
        throw error;
      }
    },

    async removeLink(linkId) {
      if (!isUuidv7(linkId)) fail('关联记录不存在', 404);
      return tx(async client => {
        const link = (await client.query(`DELETE FROM asset_links WHERE id=$1 RETURNING ${LINK_COLUMNS}`, [linkId])).rows[0];
        if (!link) fail('关联记录不存在', 404);
        await audit(client, 'asset.link.delete', `asset-links/${linkId}`, link, null);
        return { ok: true };
      });
    },

    async remove(id) {
      const asset = await load(id);
      const links = await enrichLinks((await pool.query(`SELECT ${LINK_COLUMNS} FROM asset_links WHERE asset_id=$1`, [id])).rows);
      const legacy = await findLegacyUsages(pool, asset.id, asset.objectKey);
      if (links.length || legacy.length) {
        const references = [
          ...links.map(link => ({ kind: 'link', targetType: link.targetType, targetId: link.targetId, targetLabel: link.targetLabel, role: link.role, channel: link.channel })),
          ...legacy.map(item => ({ kind: 'legacy', table: item.table, label: item.label, count: item.count })),
        ];
        const places = unique([...links.map(link => link.targetLabel || link.targetId), ...legacy.map(item => item.label)]);
        fail(`该素材正在被${places.join('、')}引用，请先解除引用后再删除`, 409, { references });
      }
      const versions = (await pool.query('SELECT object_key FROM asset_versions WHERE asset_id=$1', [id])).rows;
      await tx(async client => {
        await client.query('DELETE FROM media_assets WHERE id=$1', [id]);
        await audit(client, 'asset.delete', `assets/${id}`, asset, null);
      });
      if (objectStorage) {
        for (const key of unique([asset.objectKey, ...versions.map(row => row.object_key)])) await objectStorage.remove(key).catch(() => {});
      }
      return { ok: true };
    },

    async file(id, version) {
      const asset = await load(id);
      let objectKey = asset.objectKey, contentType = asset.contentType, fileName = asset.fileName;
      if (version != null) {
        const row = (await pool.query(`SELECT object_key,content_type,file_name FROM asset_versions WHERE asset_id=$1 AND version=$2`, [id, version])).rows[0];
        if (!row) fail('素材版本不存在', 404);
        objectKey = row.object_key; contentType = row.content_type; fileName = row.file_name;
      }
      if (!objectStorage) fail('对象存储尚未配置', 503);
      return { asset: { ...asset, contentType, fileName }, object: await objectStorage.get(objectKey), objectKey };
    },

    async publicHomeFile(id) {
      if (!isUuidv7(id)) fail('素材不存在', 404);
      const asset = (await pool.query(`SELECT object_key AS key,content_type AS "contentType" FROM media_assets
        WHERE id=$1 AND category='page' AND folder='首页装修' AND visibility='public' AND status='published'
          AND content_type IN ('image/jpeg','image/png','image/webp','image/avif','image/svg+xml')`, [id])).rows[0];
      if (!asset) fail('素材不存在', 404);
      if (!objectStorage) fail('对象存储尚未配置', 503);
      return { asset, object: await objectStorage.get(asset.key) };
    },

    async publicSkuFile(id) {
      if (!isUuidv7(id)) fail('素材不存在',404);
      const asset=(await pool.query("SELECT ma.object_key AS key,ma.content_type AS \"contentType\" FROM media_assets ma WHERE ma.id=$1 AND ma.visibility='public' AND ma.status='published' AND ma.content_type IN ('image/jpeg','image/png','image/webp','image/avif') AND EXISTS (SELECT 1 FROM asset_links al JOIN skus sku ON sku.code=al.target_id JOIN storefront_listing_skus ls ON ls.sku_uuid=sku.entity_uuid JOIN storefront_listings l ON l.id=ls.listing_id AND l.channel='website' AND l.published IS NOT NULL JOIN products p ON p.entity_uuid=l.product_uuid AND p.status='启用' WHERE al.asset_id=ma.id AND al.target_type='sku' AND al.channel IN ('product','storefront') AND al.role IN ('hero','gallery'))",[id])).rows[0];
      if(!asset)fail('素材不存在',404);
      if(!objectStorage)fail('对象存储尚未配置',503);
      return {asset,object:await objectStorage.get(asset.key)};
    },
    async publicCmsFile(id) {
      if (!isUuidv7(id)) fail('素材不存在', 404);
      const asset = (await pool.query(`SELECT ma.object_key AS key,ma.content_type AS "contentType" FROM media_assets ma
        WHERE ma.id=$1 AND (
          (ma.visibility='public' AND ma.status='published' AND ma.content_type='application/pdf' AND EXISTS (
            SELECT 1 FROM asset_links al JOIN products product ON al.target_type='product' AND (al.target_id=product.id::text OR al.target_id=product.entity_uuid::text)
            JOIN storefront_listings l ON l.product_uuid=product.entity_uuid AND l.channel='website' AND l.published IS NOT NULL
            WHERE al.asset_id=ma.id AND product.kind='vehicle' AND product.status='启用' AND product.deleted_at IS NULL AND al.role IN ('certificate','drawing','detail','package')
          )) OR
          (ma.visibility='public' AND ma.status='published' AND ma.content_type IN ('image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm') AND EXISTS (
            SELECT 1 FROM storefront_listings l JOIN products product ON product.entity_uuid=l.product_uuid
            CROSS JOIN LATERAL jsonb_each(COALESCE(l.published->'languages','{}'::jsonb)) loc
            WHERE l.channel='website' AND l.published IS NOT NULL AND product.status='启用' AND product.deleted_at IS NULL AND (
              (ma.content_type IN ('image/jpeg','image/png','image/webp','image/avif') AND (loc.value->'design'->'visual'->>'imageId'=ma.id::text OR loc.value->'design'->'visual'->>'backgroundImageId'=ma.id::text OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(loc.value->'detailBlocks','[]'::jsonb)) b WHERE b->>'imageId'=ma.id::text OR b->>'backgroundImageId'=ma.id::text)))
              OR (ma.content_type IN ('video/mp4','video/webm') AND (loc.value->'design'->'visual'->>'videoId'=ma.id::text OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(loc.value->'detailBlocks','[]'::jsonb)) b WHERE b->>'videoId'=ma.id::text)))
            )
          )) OR
          (ma.content_type IN ('image/jpeg','image/png','image/webp','image/avif','image/svg+xml') AND EXISTS (
            SELECT 1 FROM site_pages p,jsonb_array_elements(p.published->'blocks') b
            WHERE p.status='active' AND p.published IS NOT NULL AND b->'props'->>'imageId'=ma.id::text
          )) OR
          (ma.category='page' AND ma.content_type IN ('video/mp4','video/webm') AND EXISTS (
            SELECT 1 FROM site_pages p,jsonb_array_elements(p.published->'blocks') b
            WHERE p.status='active' AND p.published IS NOT NULL AND b->'props'->>'videoId'=ma.id::text
          ))
        )`, [id])).rows[0];
      if (!asset) fail('素材不存在', 404);
      if (!objectStorage) fail('对象存储尚未配置', 503);
      return { asset, object: await objectStorage.get(asset.key) };
    },

    close: () => pool.end(),
  };

  // 相同文件重复上传时只复用已有素材，并把新的标签合并进去。
  async function mergeReused(existing, { label, folder, tags, langs, markets }) {
    const merged = {
      label: existing.label || label,
      folder: existing.folder || folder,
      tags: unique([...(existing.tags || []), ...tags]),
      langs: unique([...(existing.langs || []), ...langs]),
      markets: unique([...(existing.markets || []), ...markets]),
    };
    const changed = merged.label !== existing.label
      || merged.folder !== existing.folder
      || merged.tags.length !== existing.tags.length
      || merged.langs.length !== existing.langs.length
      || merged.markets.length !== existing.markets.length;
    if (!changed) return existing;
    return tx(async client => {
      const row = (await client.query(
        `UPDATE media_assets SET label=$2,folder=$3,tags=$4,langs=$5,markets=$6,updated_at=now() WHERE id=$1 RETURNING ${ASSET_COLUMNS}`,
        [existing.id, merged.label, merged.folder, merged.tags, merged.langs, merged.markets]
      )).rows[0];
      await audit(client, 'asset.update', `assets/${existing.id}`, existing, row);
      return row;
    });
  }
}

function registerAssetLibraryRoutes(app, store) {
  app.get('/api/public/home-media/:id', {config:{publicCatalog:true}}, async (req, reply) => {
    if (!store) return reply.code(503).send({error:'素材库服务暂不可用'});
    try {
      const result = await store.publicHomeFile(req.params.id);
      return reply.header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox").header('Cache-Control','public, max-age=3600').type(result.asset.contentType).send(result.object.Body);
    } catch (error) { if (!error.statusCode) console.error(JSON.stringify({code:'HOME_MEDIA_READ_FAILED',name:error.name,errorCode:error.code,httpStatus:error.$metadata?.httpStatusCode})); return reply.code(error.statusCode || 502).send({error:error.statusCode ? error.message : '素材读取失败'}); }
  });
  app.get('/api/public/sku-media/:id', {config:{publicCatalog:true}}, async (req,reply)=>{
    if(!store)return reply.code(503).send({error:'素材库服务暂不可用'});
    try{const result=await store.publicSkuFile(req.params.id);return reply.header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Cache-Control','public, max-age=3600').type(result.asset.contentType).send(result.object.Body)}
    catch(error){return reply.code(error.statusCode||502).send({error:error.statusCode?error.message:'素材读取失败'})}
  });
  app.get('/api/public/cms-media/:id', {config:{publicCatalog:true}}, async (req, reply) => {
    if (!store) return reply.code(503).send({error:'素材库服务暂不可用'});
    try {
      const result = await store.publicCmsFile(req.params.id);
      return reply.header('X-Content-Type-Options','nosniff').header('Content-Security-Policy',"default-src 'none'; sandbox").header('Cache-Control','public, max-age=3600').type(result.asset.contentType).send(result.object.Body);
    } catch (error) { return reply.code(error.statusCode || 502).send({error:error.statusCode ? error.message : '素材读取失败'}); }
  });
  function route(method, url, handler) {
    app.route({
      method, url,
      handler: async (req, reply) => {
        if (!store) return reply.code(503).send({ error: '素材库服务暂不可用' });
        try { return await handler(req, reply); }
        catch (error) {
          if (!error.statusCode) console.error(JSON.stringify({ level: 'error', code: 'ASSET_API_ERROR', method, url, message: String(error.message || '').slice(0, 300) }));
          return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '素材库操作失败', ...(error.details || {}) });
        }
      },
    });
  }
  route('GET', '/api/assets', req => store.list(req.query || {}));
  route('GET', '/api/assets/folders', req => store.folders(req.query || {}));
  route('GET', '/api/assets/product-index', () => store.productIndex());
  route('GET', '/api/assets/:id', req => store.detail(req.params.id));
  route('GET', '/api/assets/:id/file', async (req, reply) => {
    const version = req.query.version == null ? null : integer(req.query.version, 0, 1, 100000);
    const result = await store.file(req.params.id, version);
    reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'private, max-age=86400');
    if (req.query.download === '1') reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.asset.fileName || result.asset.id)}`);
    return reply.type(result.asset.contentType).send(result.object.Body);
  });
  route('POST', '/api/assets/upload', async (req, reply) => {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
    const result = await store.upload({ contentType, fileName: headerText(req.headers['x-file-name'], 200), meta: metaOf(req), body: req.body });
    return reply.code(result.reused ? 200 : 201).send({ ...result.asset, reused: result.reused });
  });
  route('POST', '/api/assets/:id/links', (req, reply) => store.addLink(req.params.id, req.body || {}).then(link => reply.code(201).send(link)));
  route('DELETE', '/api/assets/links/:linkId', req => store.removeLink(req.params.linkId));
  route('POST', '/api/assets/:id/replace', req => store.replace(req.params.id, {
    contentType: String(req.headers['content-type'] || '').split(';')[0].trim(),
    fileName: headerText(req.headers['x-file-name'], 200),
    note: headerText(req.headers['x-note'], 200),
    meta: metaOf(req),
    body: req.body,
  }));
  route('PATCH', '/api/assets/:id', (req, reply) => store.update(req.params.id, req.body || {}).then(row => reply.send(row)));
  route('DELETE', '/api/assets/:id', req => store.remove(req.params.id));
}

module.exports = { createAssetLibraryStore, registerAssetLibraryRoutes };
