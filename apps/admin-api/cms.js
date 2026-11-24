'use strict';

const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { isUuidv7, uuidv7 } = require('./uuidv7');

const LANGUAGES = ['zh', 'en', 'de'];
const PAGE_TYPES = ['custom', 'product_template'];
const COMPONENTS = ['hero', 'twoColumn', 'video', 'productGallery', 'specs', 'features', 'faq', 'cta', 'article'];
const RESERVED_PATHS = ['www', 'catalog', 'api', 'my', 'dealer', 'login'];

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function text(value, max, required = false) {
  if (value == null) { if (required) fail('必填内容不能为空'); return ''; }
  if (typeof value !== 'string' || value.length > max) fail('内容格式或长度无效');
  const result = value.trim();
  if (required && !result) fail('必填内容不能为空');
  return result;
}
function link(value, max = 500) {
  const result = text(value, max);
  if (!result) return '';
  if (result.startsWith('/') && !result.startsWith('//')) return result;
  try {
    const url = new URL(result);
    if (['http:', 'https:'].includes(url.protocol)) return result;
  } catch (_) {}
  fail('链接需使用站内路径或 http(s) 地址');
}
function assetId(value) {
  const result = text(value, 80);
  if (!result) return '';
  if (!isUuidv7(result)) fail('素材编号无效');
  return result;
}
function normalizePath(value) {
  const raw = text(value, 160, true).toLocaleLowerCase().replace(/\/+/g, '/');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (!/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(path)) fail('页面路径仅支持小写字母、数字和连字符');
  const first = path.slice(1).split('/')[0];
  if (RESERVED_PATHS.includes(first)) fail('该路径与系统路由冲突，请更换');
  return path;
}
function items(value, max, fields) {
  if (!Array.isArray(value) || value.length > max) fail(`列表最多 ${max} 项`);
  return value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('列表项格式无效');
    const result = {};
    for (const [key, size, required] of fields) result[key] = text(row[key], size, required);
    return result;
  });
}
function articleSections(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 12) fail('文章段落最多 12 段');
  return value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('文章段落格式无效');
    return { heading: text(row.heading, 180), body: text(row.body, 6000), imageId: assetId(row.imageId), imageAlt: text(row.imageAlt, 160) };
  });
}
function blockOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('组件格式无效');
  const componentKey = input.componentKey;
  if (!COMPONENTS.includes(componentKey)) fail('包含未登记的装修组件，请删除后重试');
  const id = text(input.id, 80) || `b-${uuidv7().slice(-12)}`;
  const props = input.props && typeof input.props === 'object' && !Array.isArray(input.props) ? input.props : {};
  const bindings = input.bindings && typeof input.bindings === 'object' && !Array.isArray(input.bindings) ? input.bindings : {};
  let cleanProps = {}, cleanBindings = {};
  if (componentKey === 'hero') cleanProps = { eyebrow: text(props.eyebrow, 100), title: text(props.title, 180, true), intro: text(props.intro, 1000), ctaLabel: text(props.ctaLabel, 60), ctaHref: link(props.ctaHref) };
  else if (componentKey === 'twoColumn') cleanProps = { title: text(props.title, 180), body: text(props.body, 4000), imageId: assetId(props.imageId), imageSide: props.imageSide === 'left' ? 'left' : 'right' };
  else if (componentKey === 'video') {
    const videoId = assetId(props.videoId);
    if (!videoId) fail('请选择页面视频素材');
    cleanProps = { title: text(props.title, 180), caption: text(props.caption, 600), videoId };
  }
  else if (componentKey === 'productGallery') {
    const ids = Array.isArray(bindings.productIds) ? bindings.productIds : [];
    if (ids.length > 8 || ids.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) fail('商品图库最多关联 8 个产品');
    cleanProps = { heading: text(props.heading, 120) };
    cleanBindings = { productIds: [...new Set(ids.map(value => value.trim()))] };
  } else if (componentKey === 'specs') {
    cleanProps = { heading: text(props.heading, 120) };
    cleanBindings = { productId: text(bindings.productId, 80), fieldSet: 'public_specs' };
  } else if (componentKey === 'features') cleanProps = { heading: text(props.heading, 120), items: items(props.items, 6, [['title', 120, true], ['text', 400]]) };
  else if (componentKey === 'faq') cleanProps = { heading: text(props.heading, 120), items: items(props.items, 12, [['question', 200, true], ['answer', 2000, true]]) };
  else if (componentKey === 'article') cleanProps = { heading: text(props.heading, 180), intro: text(props.intro, 1200), imageId: assetId(props.imageId), imageAlt: text(props.imageAlt, 160), sections: articleSections(props.sections) };
  else cleanProps = { title: text(props.title, 180, true), text: text(props.text, 600), buttonLabel: text(props.buttonLabel, 60), buttonHref: link(props.buttonHref) };
  return { id, componentKey, schemaVersion: 1, visible: input.visible !== false, props: cleanProps, bindings: cleanBindings };
}
// 商品详情页 8 模块中的全局模块（②营销 ③④预留 ⑥评价开关 ⑦退换货 ⑧其他）。
// 顺序固定不可拖拽；③④内容为空时前台自动隐藏。缺省字段全部给默认值，旧草稿可直接保存/发布。
const DEFAULT_PRODUCT_MODULES = {
  marketing: { enabled: false, imageId: '', href: '', text: '' },
  reserved3: { enabled: false, imageId: '', href: '', text: '' },
  reserved4: { enabled: false, imageId: '', href: '', text: '' },
  reviews: { enabled: true, limit: 20, style: 'list' },
  returns: { enabled: false, title: '', body: '' },
  other: { enabled: false, title: '', body: '' },
};
function bannerModuleOf(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { enabled: row.enabled === true, imageId: assetId(row.imageId ?? ''), href: link(row.href ?? ''), text: text(row.text ?? '', 600) };
}
function copyModuleOf(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { enabled: row.enabled === true, title: text(row.title ?? '', 180), body: text(row.body ?? '', 4000) };
}
function modulesOf(input) {
  const value = input.modules == null ? {} : input.modules;
  if (typeof value !== 'object' || Array.isArray(value)) fail('商品详情模块配置无效');
  const reviews = value.reviews && typeof value.reviews === 'object' && !Array.isArray(value.reviews) ? value.reviews : {};
  const limit = Number(reviews.limit ?? DEFAULT_PRODUCT_MODULES.reviews.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) fail('评价显示条数须为 1-50 的整数');
  return {
    marketing: bannerModuleOf(value.marketing),
    reserved3: bannerModuleOf(value.reserved3),
    reserved4: bannerModuleOf(value.reserved4),
    reviews: { enabled: reviews.enabled !== false, limit, style: reviews.style === 'cards' ? 'cards' : 'list' },
    returns: copyModuleOf(value.returns),
    other: copyModuleOf(value.other),
  };
}
// 「全部产品」列表页版式：分类导航 + 自动展示（默认按销量倒序）。未配置返回 null，前台维持系统渲染。
function catalogLayoutOf(input) {
  if (input.catalogLayout == null) return null;
  const value = input.catalogLayout;
  if (typeof value !== 'object' || Array.isArray(value)) fail('列表页版式无效');
  const categories = Array.isArray(value.categories) ? value.categories : [];
  if (categories.length > 20) fail('分类导航最多 20 个');
  const cleanCategories = categories.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('分类格式无效');
    const ids = Array.isArray(row.productIds) ? row.productIds : [];
    if (ids.length > 50 || ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 160)) fail('分类关联商品无效（每个分类最多 50 个）');
    return { name: text(row.name, 80, true), productIds: [...new Set(ids.map(id => id.trim()))] };
  });
  return { sort: value.sort === 'default' ? 'default' : 'sales', categories: cleanCategories };
}
function documentOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.blocks)) fail('页面草稿格式无效');
  if (input.blocks.length > 40) fail('单页最多 40 个组件');
  const blocks = input.blocks.map(blockOf);
  if (new Set(blocks.map(block => block.id)).size !== blocks.length) fail('组件编号重复');
  const layout = input.productLayout == null ? {} : input.productLayout;
  if (typeof layout !== 'object' || Array.isArray(layout)) fail('商品模块样式无效');
  const styles = {
    gallery: ['standard', 'immersive', 'mosaic', 'columns'],
    specifications: ['list', 'table', 'accordion'],
    reviews: ['list', 'cards'],
  };
  const productLayout = {};
  for (const [key, allowed] of Object.entries(styles)) {
    const value = layout[key] ?? (key === 'gallery' ? 'standard' : 'list');
    if (!allowed.includes(value)) fail('商品模块样式无效');
    productLayout[key] = value;
  }
  return { blocks, productLayout, modules: modulesOf(input), catalogLayout: catalogLayoutOf(input) };
}
function seoOf(input) {
  if (input == null) return { title: '', description: '' };
  if (typeof input !== 'object' || Array.isArray(input)) fail('SEO 资料格式无效');
  return { title: text(input.title, 180), description: text(input.description, 500) };
}
function createCmsStore(connectionString) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });
  const columns = `id::text AS id,page_type AS "pageType",locale,path,page_name AS "name",status,draft,published,revision,published_revision AS "publishedRevision",published_version AS "publishedVersion",draft_seo AS "draftSeo",published_seo AS "publishedSeo",published_label AS "publishedLabel",draft_label AS "draftLabel",updated_by AS "updatedBy",updated_at AS "updatedAt"`;
  async function validateAssets(client, document) {
    const images = [], videos = [];
    for (const block of document.blocks) {
      if (block.componentKey === 'twoColumn' && block.props.imageId) images.push(block.props.imageId);
      if (block.componentKey === 'article') {
        if (block.props.imageId) images.push(block.props.imageId);
        for (const section of block.props.sections || []) if (section.imageId) images.push(section.imageId);
      }
      if (block.componentKey === 'video' && block.props.videoId) videos.push(block.props.videoId);
    }
    for (const key of ['marketing', 'reserved3', 'reserved4']) {
      const imageId = document.modules?.[key]?.imageId;
      if (imageId) images.push(imageId);
    }
    if (images.length) {
      const rows = (await client.query("SELECT id::text AS id FROM media_assets WHERE id::text=ANY($1::text[]) AND kind='image'", [images])).rows;
      if (rows.length !== new Set(images).size) fail('所选素材不存在或不是图片，请重新选择');
    }
    if (videos.length) {
      const rows = (await client.query("SELECT id::text AS id FROM media_assets WHERE id::text=ANY($1::text[]) AND kind='video' AND category='page'", [videos])).rows;
      if (rows.length !== new Set(videos).size) fail('所选素材不存在或不是视频，请重新选择');
    }
  }
  async function row(id) {
    if (!isUuidv7(id)) fail('页面不存在', 404);
    const data = (await pool.query(`SELECT ${columns} FROM site_pages WHERE id=$1`, [id])).rows[0];
    if (!data) fail('页面不存在', 404);
    return data;
  }
  async function enrich(blocks, locale) {
    const galleryIds = blocks.filter(block => block.componentKey === 'productGallery').flatMap(block => block.bindings.productIds || []);
    const specIds = blocks.filter(block => block.componentKey === 'specs').map(block => block.bindings.productId).filter(Boolean);
    const videoIds = blocks.filter(block => block.componentKey === 'video').map(block => block.props.videoId).filter(Boolean);
    const ids = [...new Set([...galleryIds, ...specIds])];
    if (!ids.length && !videoIds.length) return blocks;
    const rows = ids.length ? (await pool.query(`SELECT p.id,p.kind,l.published,l.slug FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL WHERE (p.id=ANY($1::text[]) OR l.slug=ANY($1::text[])) AND p.status='启用' AND l.published->'languages' ? $2`, [ids, locale])).rows : [];
    const map = new Map(rows.flatMap(r => {
      const doc = r.published, content = doc.languages[locale];
      const value = {
        product: { id: r.id, slug: r.slug, kind: r.kind, title: content.title, image: doc.mediaIds[0] ? { url: `/api/catalog/products/${encodeURIComponent(r.id)}/images/${encodeURIComponent(doc.mediaIds[0])}` } : null },
        specifications: content.specifications,
      };
      return [[r.id, value], ...(r.slug ? [[r.slug, value]] : [])];
    }));
    return blocks.map(block => {
      if (block.componentKey === 'productGallery') return { ...block, data: { products: (block.bindings.productIds || []).map(id => map.get(id)?.product).filter(Boolean) } };
      if (block.componentKey === 'specs') return { ...block, data: { specifications: map.get(block.bindings.productId)?.specifications || [] } };
      if (block.componentKey === 'video') return { ...block, data: { videoUrl: block.props.videoId ? `/api/public/cms-media/${encodeURIComponent(block.props.videoId)}` : '' } };
      return block;
    });
  }
  return {
    async list(query = {}) {
      const filters = ["page_type IN ('home','product_template','custom')"], values = [];
      if (query.type) { if (!['home', ...PAGE_TYPES].includes(query.type)) fail('页面类型无效'); values.push(query.type); filters.push(`page_type=$${values.length}`); }
      if (query.locale) { if (!LANGUAGES.includes(query.locale)) fail('语言无效'); values.push(query.locale); filters.push(`locale=$${values.length}`); }
      if (query.path) { values.push(normalizePath(query.path)); filters.push(`path=$${values.length}`); }
      if (query.q) { values.push(String(query.q).trim().slice(0, 120).toLocaleLowerCase()); filters.push(`(position($${values.length} in lower(page_name))>0 OR position($${values.length} in lower(path))>0)`); }
      return (await pool.query(`SELECT id::text AS id,page_type AS "pageType",locale,path,page_name AS "name",status,revision,published_revision AS "publishedRevision",published_version AS "publishedVersion",published_label AS "publishedLabel",draft_label AS "draftLabel",draft IS NOT NULL AS "hasDraft",draft_seo AS "draftSeo",published_seo AS "publishedSeo",(SELECT v.created_at FROM site_page_versions v WHERE v.page_id=site_pages.id AND v.version=site_pages.published_version) AS "publishedAt",updated_by AS "updatedBy",updated_at AS "updatedAt" FROM site_pages WHERE ${filters.join(' AND ')} ORDER BY page_type='home' DESC,updated_at DESC LIMIT 200`, values)).rows;
    },
    async get(id) {
      const data = await row(id);
      const versions = (await pool.query('SELECT count(*)::int AS n FROM site_page_versions WHERE page_id=$1', [data.id])).rows[0];
      return { ...data, versionCount: versions.n };
    },
    async create(input = {}) {
      if (!PAGE_TYPES.includes(input.pageType)) fail('页面类型无效');
      const locale = input.locale;
      if (!LANGUAGES.includes(locale)) fail('语言无效');
      const path = normalizePath(input.path), name = text(input.name, 120, true), document = documentOf(input.draft || { blocks: [] }), seo = seoOf(input.seo);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await validateAssets(c, document);
        const slugBase = `cms-${locale}-${path.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page'}`.slice(0, 100);
        let slug = slugBase, n = 1;
        while ((await c.query('SELECT 1 FROM site_pages WHERE slug=$1', [slug])).rowCount) slug = `${slugBase}-${++n}`.slice(0, 120);
        const created = (await c.query(`INSERT INTO site_pages(slug,page_type,locale,path,page_name,status,draft,draft_seo,revision,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,'active',$6,$7,1,$8,now()) RETURNING ${columns}`, [slug, input.pageType, locale, path, name, JSON.stringify(document), JSON.stringify(seo), currentActor()])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.create', `site-pages/${created.id}`, null, JSON.stringify({ name, pageType: input.pageType, locale, path })]);
        await c.query('COMMIT');
        return created;
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') fail('同语言下该页面路径已存在', 409);
        throw error;
      } finally { c.release(); }
    },
    async saveDraft(id, input = {}) {
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新页面');
      const document = documentOf(input.draft), seo = seoOf(input.seo);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns},revision AS rev FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.rev !== input.revision) fail('页面草稿已被其他人更新，请重新加载', 409);
        await validateAssets(c, document);
        const name = input.name === undefined ? old.name : text(input.name, 120, true);
        const path = old.pageType === 'home' || old.pageType === 'product_template' && old.path.startsWith('/products/') ? old.path : normalizePath(input.path === undefined ? old.path : input.path);
        const after = (await c.query(`UPDATE site_pages SET page_name=$1,path=$2,draft=$3,draft_seo=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE id=$6 RETURNING ${columns}`, [name, path, JSON.stringify(document), JSON.stringify(seo), currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.save', `site-pages/${id}`, JSON.stringify({ revision: old.rev }), JSON.stringify({ revision: after.revision })]);
        await c.query('COMMIT');
        return after;
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') fail('同语言下该页面路径已存在', 409);
        throw error;
      } finally { c.release(); }
    },
    async publish(id, input = {}) {
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新页面');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns},revision AS rev FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.rev !== input.revision) fail('页面草稿已被其他人更新，请重新加载', 409);
        if (!old.draft) fail('请先保存页面草稿');
        const document = documentOf(old.draft);
        if (old.pageType !== 'product_template' && !document.blocks.some(block => block.visible !== false)) fail('页面至少需要一个可见组件才能发布');
        await validateAssets(c, document);
        const next = (await c.query('SELECT COALESCE(max(version),0)+1 AS version FROM site_page_versions WHERE page_id=$1', [id])).rows[0].version;
        await c.query('INSERT INTO site_page_versions(page_id,version,snapshot,seo,label,created_by) VALUES($1,$2,$3,$4,$5,$6)', [id, next, JSON.stringify(document), JSON.stringify(old.draftSeo || {}), old.draftLabel || null, currentActor()]);
        const after = (await c.query(`UPDATE site_pages SET published=$1,published_seo=$2,published_revision=revision+1,published_version=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE id=$5 RETURNING ${columns}`, [JSON.stringify(document), JSON.stringify(old.draftSeo || {}), next, currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.publish', `site-pages/${id}`, JSON.stringify({ publishedVersion: old.publishedVersion, revision: old.rev }), JSON.stringify({ publishedVersion: next, revision: after.revision })]);
        await c.query('COMMIT');
        return after;
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    async versions(id) {
      await row(id);
      return (await pool.query('SELECT version,seo,label,created_by AS "createdBy",created_at AS "createdAt" FROM site_page_versions WHERE page_id=$1 AND deleted_at IS NULL ORDER BY version DESC', [id])).rows;
    },
    async rollback(id, input = {}) {
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新页面');
      const version = Number(input.version);
      if (!Number.isSafeInteger(version) || version < 1) fail('版本号无效');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns},revision AS rev FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.rev !== input.revision) fail('页面已更新，请重新加载', 409);
        const snapshot = (await c.query('SELECT snapshot,seo,label FROM site_page_versions WHERE page_id=$1 AND version=$2 AND deleted_at IS NULL', [id, version])).rows[0];
        if (!snapshot) fail('历史版本不存在', 404);
        const next = (await c.query('SELECT COALESCE(max(version),0)+1 AS version FROM site_page_versions WHERE page_id=$1', [id])).rows[0].version;
        await c.query('INSERT INTO site_page_versions(page_id,version,snapshot,seo,label,created_by) VALUES($1,$2,$3,$4,$5,$6)', [id, next, JSON.stringify(snapshot.snapshot), JSON.stringify(snapshot.seo || {}), snapshot.label || null, currentActor()]);
        const after = (await c.query(`UPDATE site_pages SET published=$1,published_seo=$2,published_revision=revision+1,published_version=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE id=$5 RETURNING ${columns}`, [JSON.stringify(snapshot.snapshot), JSON.stringify(snapshot.seo || {}), next, currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.rollback', `site-pages/${id}`, JSON.stringify({ publishedVersion: old.publishedVersion }), JSON.stringify({ rolledBackFrom: version, publishedVersion: next })]);
        await c.query('COMMIT');
        return after;
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    // 以指定历史版本为基础重建草稿：只改草稿，不动线上内容，也不覆盖原历史快照
    async restoreDraft(id, input = {}) {
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新页面');
      const version = Number(input.version);
      if (!Number.isSafeInteger(version) || version < 1) fail('版本号无效');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns},revision AS rev FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.rev !== input.revision) fail('页面已更新，请重新加载', 409);
        const snap = (await c.query('SELECT snapshot,seo FROM site_page_versions WHERE page_id=$1 AND version=$2 AND deleted_at IS NULL', [id, version])).rows[0];
        if (!snap) fail('历史版本不存在或已删除', 404);
        const document = documentOf(snap.snapshot);
        await validateAssets(c, document);
        const after = (await c.query(`UPDATE site_pages SET draft=$1,draft_seo=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$4 RETURNING ${columns}`, [JSON.stringify(document), JSON.stringify(snap.seo || {}), currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.restore_draft', `site-pages/${id}`, JSON.stringify({ revision: old.rev, draftHasContent: Boolean(old.draft) }), JSON.stringify({ revision: after.revision, restoredFrom: version })]);
        await c.query('COMMIT');
        return after;
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    // 软删除历史版本：保留快照数据可追溯，禁止删当前线上版本与最后一个版本
    async deleteVersion(id, input = {}) {
      const version = Number(input.version);
      if (!Number.isSafeInteger(version) || version < 1) fail('版本号无效');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const page = (await c.query(`SELECT ${columns} FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!page) fail('页面不存在', 404);
        if (Number(page.publishedVersion) === version) fail('当前线上版本不能删除', 409);
        const target = (await c.query('SELECT version,snapshot,seo,created_by,created_at FROM site_page_versions WHERE page_id=$1 AND version=$2 AND deleted_at IS NULL', [id, version])).rows[0];
        if (!target) fail('历史版本不存在或已删除', 404);
        const remain = (await c.query('SELECT count(*)::int AS n FROM site_page_versions WHERE page_id=$1 AND deleted_at IS NULL', [id])).rows[0].n;
        if (remain <= 1) fail('至少保留一个历史版本', 409);
        await c.query('UPDATE site_page_versions SET deleted_at=now() WHERE page_id=$1 AND version=$2', [id, version]);
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.version.delete', `site-pages/${id}/versions/${version}`, JSON.stringify(target), JSON.stringify({ version, softDeleted: true })]);
        await c.query('COMMIT');
        return { ok: true, version };
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    // 轻量重命名：只改页面名，不触碰草稿内容与 revision
    async rename(id, input = {}) {
      const name = text(input.name, 120, true);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns} FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.name === name) { await c.query('COMMIT'); return old; }
        const after = (await c.query(`UPDATE site_pages SET page_name=$1,updated_by=$2,updated_at=now() WHERE id=$3 RETURNING ${columns}`, [name, currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.rename', `site-pages/${id}`, JSON.stringify({ name: old.name }), JSON.stringify({ name })]);
        await c.query('COMMIT');
        return after;
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    // 版本别名：线上/草稿存在页面行上，历史版本存在版本行上
    async setLabels(id, input = {}) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns} FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        const publishedLabel = input.publishedLabel === undefined ? old.publishedLabel : (text(input.publishedLabel, 60) || null);
        const draftLabel = input.draftLabel === undefined ? old.draftLabel : (text(input.draftLabel, 60) || null);
        const after = (await c.query(`UPDATE site_pages SET published_label=$1,draft_label=$2,updated_by=$3 WHERE id=$4 RETURNING ${columns}`, [publishedLabel, draftLabel, currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.labels', `site-pages/${id}`, JSON.stringify({ publishedLabel: old.publishedLabel, draftLabel: old.draftLabel }), JSON.stringify({ publishedLabel, draftLabel })]);
        await c.query('COMMIT');
        return after;
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    async setVersionLabel(id, input = {}) {
      const version = Number(input.version);
      if (!Number.isSafeInteger(version) || version < 1) fail('版本号无效');
      const label = input.label === undefined ? null : (text(input.label, 60) || null);
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const page = (await c.query(`SELECT ${columns} FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!page) fail('页面不存在', 404);
        const target = (await c.query('SELECT version,label FROM site_page_versions WHERE page_id=$1 AND version=$2 AND deleted_at IS NULL', [id, version])).rows[0];
        if (!target) fail('历史版本不存在或已删除', 404);
        const after = (await c.query('UPDATE site_page_versions SET label=$1 WHERE page_id=$2 AND version=$3 RETURNING version,label', [label, id, version])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.version.label', `site-pages/${id}/versions/${version}`, JSON.stringify({ label: target.label }), JSON.stringify({ label })]);
        await c.query('COMMIT');
        return after;
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    async setStatus(id, status) {
      if (!['active', 'disabled'].includes(status)) fail('页面状态无效');
      const old = await row(id);
      if (old.pageType === 'home' && status === 'disabled') fail('官网首页不能停用');
      return (await pool.query('UPDATE site_pages SET status=$1,updated_by=$2,updated_at=now() WHERE id=$3 RETURNING id::text AS id,status', [status, currentActor(), id])).rows[0];
    },
    async remove(id) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns} FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.pageType === 'home') fail('官网首页不能删除');
        if (old.publishedVersion && old.status !== 'disabled') fail('已发布页面不能直接删除，请先停用', 409);
        await c.query('DELETE FROM site_pages WHERE id=$1', [id]);
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.delete', `site-pages/${id}`, JSON.stringify({ name: old.name, path: old.path }), null]);
        await c.query('COMMIT');
        return { ok: true };
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { c.release(); }
    },
    async publicPage(locale, path, options = {}) {
      if (!LANGUAGES.includes(locale)) fail('语言无效');
      const normalized = normalizePath(path);
      const { version = null, draft = false } = options;
      // 草稿预览：仅后台装修工作区使用（路由层已校验管理员身份）
      if (draft) {
        const d = (await pool.query("SELECT id::text AS id,page_name AS \"name\",draft,draft_seo AS seo FROM site_pages WHERE page_type='custom' AND locale=$1 AND path=$2 AND status='active'", [locale, normalized])).rows[0];
        if (!d) return null;
        const blocks = Array.isArray(d.draft?.blocks) ? d.draft.blocks : [];
        return { id: d.id, name: d.name, locale, path: normalized, seo: d.seo || {}, blocks: await enrich(blocks, locale), preview: 'draft' };
      }
      // 历史版本预览：读取该版本快照，不动当前线上内容
      if (version) {
        const v = (await pool.query('SELECT v.version, v.snapshot, v.seo, p.id::text AS id, p.page_name AS "name" FROM site_page_versions v JOIN site_pages p ON p.id=v.page_id WHERE p.page_type=\'custom\' AND p.locale=$1 AND p.path=$2 AND p.status=\'active\' AND v.version=$3 AND v.deleted_at IS NULL', [locale, normalized, version])).rows[0];
        if (!v) return null;
        const snapshot = v.snapshot || {};
        const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
        return { id: v.id, name: v.name, locale, path: normalized, seo: v.seo || {}, blocks: await enrich(blocks, locale), preview: `v${v.version}` };
      }
      const data = (await pool.query("SELECT id::text AS id,page_name AS \"name\",published,published_seo AS seo FROM site_pages WHERE page_type='custom' AND locale=$1 AND path=$2 AND status='active' AND published IS NOT NULL", [locale, normalized])).rows[0];
      if (!data) return null;
      return { id: data.id, name: data.name, locale, path: normalized, seo: data.seo || {}, blocks: await enrich(Array.isArray(data.published?.blocks) ? data.published.blocks : [], locale) };
    },
    async publicSitemap() {
      return (await pool.query("SELECT locale,path FROM site_pages WHERE page_type='custom' AND status='active' AND published IS NOT NULL AND path IS NOT NULL ORDER BY locale,path")).rows;
    },
    async publicProductTemplate(locale, productId = '', options = {}) {
      if (!LANGUAGES.includes(locale)) fail('语言无效');
      const { version = null, draft = false } = options;
      const productPath = productId ? normalizePath(`/products/${productId}`) : '';
      // 老数据没有 modules/catalogLayout 字段：读取时补默认值，保证发布前后前台一致。
      const payload = async (document, data) => ({
        id: data.id, name: data.name, locale, isProductSpecific: data.isProductSpecific, seo: data.seo || {},
        productLayout: document.productLayout || { gallery: 'standard', specifications: 'list', reviews: 'list' },
        modules: document.modules || DEFAULT_PRODUCT_MODULES,
        catalogLayout: document.catalogLayout || null,
        blocks: await enrich(Array.isArray(document.blocks) ? document.blocks : [], locale),
        preview: draft ? 'draft' : version ? `v${version}` : undefined,
      });
      // 草稿预览：仅后台装修工作区使用（路由层已校验管理员身份）
      if (draft) {
        const data = (await pool.query("SELECT id::text AS id,page_name AS \"name\",draft AS document,draft_seo AS seo,(path=$2) AS \"isProductSpecific\" FROM site_pages WHERE page_type='product_template' AND locale=$1 AND status='active' AND draft IS NOT NULL AND (path=$2 OR path NOT LIKE '/products/%') ORDER BY (path=$2) DESC,updated_at DESC LIMIT 1", [locale, productPath])).rows[0];
        return data ? payload(data.document || {}, data) : null;
      }
      // 历史版本预览：读取该版本快照，不动当前线上内容
      if (version) {
        const data = (await pool.query("SELECT v.snapshot AS document,v.seo,p.id::text AS id,p.page_name AS \"name\",(p.path=$2) AS \"isProductSpecific\" FROM site_page_versions v JOIN site_pages p ON p.id=v.page_id WHERE p.page_type='product_template' AND p.locale=$1 AND p.status='active' AND v.version=$3 AND v.deleted_at IS NULL AND (p.path=$2 OR p.path NOT LIKE '/products/%') ORDER BY (p.path=$2) DESC LIMIT 1", [locale, productPath, version])).rows[0];
        return data ? payload(data.document || {}, data) : null;
      }
      const data = (await pool.query("SELECT id::text AS id,page_name AS \"name\",published AS document,published_seo AS seo,(path=$2) AS \"isProductSpecific\" FROM site_pages WHERE page_type='product_template' AND locale=$1 AND status='active' AND published IS NOT NULL AND (path=$2 OR path NOT LIKE '/products/%') ORDER BY (path=$2) DESC,updated_at DESC LIMIT 1", [locale, productPath])).rows[0];
      if (!data) return null;
      return payload(data.document || {}, data);
    },
    close: () => pool.end(),
  };
}

function registerCmsRoutes(app, cms) {
  function route(method, url, handler, isPublic = false) {
    app.route({ method, url, config: { publicCatalog: isPublic }, bodyLimit: 2 * 1024 * 1024, handler: async (req, reply) => {
      reply.header('Cache-Control', isPublic ? 'public, max-age=60' : 'no-store');
      if (!cms) return reply.code(503).send({ error: '页面服务暂不可用' });
      if (!isPublic && req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可管理页面' });
      try { return await handler(req, reply); }
      catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '页面操作失败' }); }
    } });
  }
  route('GET', '/api/cms/pages', req => cms.list({ type: req.query.type || '', locale: req.query.locale || '', q: req.query.q || '', path: req.query.path || '' }));
  route('POST', '/api/cms/pages', (req, reply) => cms.create(req.body || {}).then(data => reply.code(201).send(data)));
  route('GET', '/api/cms/pages/:id', req => cms.get(req.params.id));
  route('PUT', '/api/cms/pages/:id/draft', req => cms.saveDraft(req.params.id, req.body || {}));
  route('POST', '/api/cms/pages/:id/publish', req => cms.publish(req.params.id, req.body || {}));
  route('GET', '/api/cms/pages/:id/versions', req => cms.versions(req.params.id));
  route('POST', '/api/cms/pages/:id/rollback', req => cms.rollback(req.params.id, req.body || {}));
  route('POST', '/api/cms/pages/:id/versions/:version/restore-draft', req => cms.restoreDraft(req.params.id, { version: req.params.version, revision: Number(req.body?.revision) }));
  route('DELETE', '/api/cms/pages/:id/versions/:version', req => cms.deleteVersion(req.params.id, { version: req.params.version }));
  route('PATCH', '/api/cms/pages/:id/name', req => cms.rename(req.params.id, { name: req.body?.name }));
  route('PATCH', '/api/cms/pages/:id/labels', req => cms.setLabels(req.params.id, req.body || {}));
  route('PATCH', '/api/cms/pages/:id/versions/:version/label', req => cms.setVersionLabel(req.params.id, { version: req.params.version, label: req.body?.label }));
  route('PATCH', '/api/cms/pages/:id/status', req => cms.setStatus(req.params.id, req.body?.status));
  route('DELETE', '/api/cms/pages/:id', req => cms.remove(req.params.id));
  route('GET', '/api/cms/pages/public', (req, reply) => {
    const draft = String(req.query.draft || '') === '1';
    const version = Number(req.query.version || 0) || null;
    // 草稿预览只给管理员；公开路由不能缓存草稿内容
    if (draft) {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可预览草稿' });
      reply.header('Cache-Control', 'no-store');
    }
    return cms.publicPage(String(req.query.locale || ''), String(req.query.path || ''), { version, draft });
  }, true);
  route('GET', '/api/cms/pages/sitemap', () => cms.publicSitemap(), true);
  route('GET', '/api/cms/product-template', (req, reply) => {
    const draft = String(req.query.draft || '') === '1';
    const version = Number(req.query.version || 0) || null;
    // 草稿预览只给管理员；公开路由不能缓存草稿内容
    if (draft) {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可预览草稿' });
      reply.header('Cache-Control', 'no-store');
    }
    return cms.publicProductTemplate(String(req.query.locale || ''), String(req.query.productId || ''), { draft, version });
  }, true);
}

module.exports = { createCmsStore, registerCmsRoutes };
