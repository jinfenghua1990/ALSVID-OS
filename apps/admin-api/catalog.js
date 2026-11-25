const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { isUuidv7 } = require('./uuidv7');
const { syncHomeLayout, syncStatus, syncConfigured } = require('./production-sync');
const { revalidateStorefront, revalidateStatus } = require('./storefront-revalidate');
const { translateLayoutStrings, translateStatus } = require('./storefront-translate');
const { loadGlossary, lookupMemory, saveMemory, glossarySummary } = require('./translation-memory');
const { signPreviewToken, verifyPreviewToken } = require('./layout-preview-token');
const traffic = require('./traffic');
const sanitizeHtml = require('sanitize-html');
const zlib = require('zlib');

const LANGUAGES = ['zh', 'en', 'de'];
const SITE_ORIGIN = 'https://www.alsvidbike.com';
// 官网装修 HTML 白名单：允许版式/媒体/交互展示标签，禁止 form/input/label。
// 表单标签配合 action 可在公开页面构造钓鱼表单，且装修组件并不生成它们；线上已发布页面核查为 0 使用。
// SVG 图标与内联样式是外部页面导入（如 V1.0 首页回写）的刚需，按受限白名单放开：
// 仅允许纯展示的 SVG 图元与其几何/描边属性；style 属性只允许有限 CSS 声明且禁止 url()/expression。
const SAFE_STYLE_VALUE = /^(?!.*(?:expression|javascript:|vbscript|behavio|@import|url\s*\())[\w\s#%.,()\-+:/*'"]*$/i;
const STYLE_PROP = [SAFE_STYLE_VALUE];
const PAGE_SANITIZE_OPTIONS = {
  // 注意：sanitize-html 的 defaults.allowedTags 不含 img，必须显式列出，否则 <img> 会被整体丢弃（历史 bug）。
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'section', 'header', 'footer', 'main', 'nav', 'picture', 'source', 'video', 'button', 'details', 'summary',
    'svg', 'path', 'g', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs', 'symbol', 'use', 'clippath', 'lineargradient', 'radialgradient', 'stop',
  ]),
  allowedAttributes: {
    '*': ['class', 'id', 'title', 'role', 'aria-*', 'data-*', 'style'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority'],
    button: ['type'],
    svg: ['viewbox', 'xmlns', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden', 'focusable', 'preserveaspectratio'],
    path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'opacity'],
    g: ['fill', 'stroke', 'stroke-width', 'transform', 'opacity', 'clip-path'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'opacity'],
    polyline: ['points', 'fill', 'stroke', 'stroke-width', 'opacity'],
    polygon: ['points', 'fill', 'stroke', 'stroke-width', 'opacity'],
    use: ['href', 'xlink:href'],
    stop: ['offset', 'stop-color', 'stop-opacity'],
    lineargradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientunits'],
    radialgradient: ['id', 'cx', 'cy', 'r', 'gradientunits', 'fx', 'fy'],
  },
  allowedStyles: {
    '*': {
      display: STYLE_PROP, position: STYLE_PROP, top: STYLE_PROP, right: STYLE_PROP, bottom: STYLE_PROP, left: STYLE_PROP,
      width: STYLE_PROP, height: STYLE_PROP, 'max-width': STYLE_PROP, 'min-height': STYLE_PROP,
      color: STYLE_PROP, 'background-color': STYLE_PROP, 'font-weight': STYLE_PROP, 'font-size': STYLE_PROP,
      'text-decoration': STYLE_PROP, 'text-decoration-line': STYLE_PROP, 'text-underline-offset': STYLE_PROP,
      gap: STYLE_PROP, 'white-space': STYLE_PROP, 'letter-spacing': STYLE_PROP, 'line-height': STYLE_PROP,
      opacity: STYLE_PROP, transform: STYLE_PROP, 'border-radius': STYLE_PROP,
      margin: STYLE_PROP, padding: STYLE_PROP, flex: STYLE_PROP, 'align-items': STYLE_PROP, 'justify-content': STYLE_PROP,
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function text(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('发布内容格式或长度无效');
  return value.trim();
}
function detailBlocksOf(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) fail('图文详情最多 50 段');
  return value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) fail('图文详情格式无效');
    if (row.type === 'image') return { type: 'image', imageId: text(row.imageId, 160, true), alt: text(row.alt ?? '', 160) };
    if (row.type === 'text') return { type: 'text', text: text(row.text, 2000, true) };
    return fail('图文详情类型无效');
  });
}
function documentOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('发布内容格式无效');
  const languages = {};
  for (const lang of LANGUAGES) {
    const value = input.languages?.[lang];
    if (value == null) continue;
    if (!Array.isArray(value.specifications) || value.specifications.length > 30) fail('参数最多 30 项');
    languages[lang] = {
      title: text(value.title, 160, true), description: text(value.description, 10000),
      delivery: text(value.delivery ?? '', 2000), warranty: text(value.warranty ?? '', 2000),
      specifications: value.specifications.map(row => ({ label: text(row?.label, 80, true), value: text(row?.value, 500, true) })),
      detailBlocks: detailBlocksOf(value.detailBlocks),
    };
  }
  if (!Object.keys(languages).length) fail('请至少填写一种语言的产品名称');
  if (!Array.isArray(input.mediaIds) || input.mediaIds.length > 12 || input.mediaIds.some(id => typeof id !== 'string' || !id || id.length > 160)) fail('最多选择 12 张产品图片');
  if (new Set(input.mediaIds).size !== input.mediaIds.length) fail('不能重复选择图片');
  const result = { model: text(input.model, 100), languages, mediaIds: input.mediaIds };
  if (input.seo != null) {
    if (typeof input.seo !== 'object' || Array.isArray(input.seo)) fail('SEO 资料格式无效');
    const seo = input.seo;
    const slug = text(seo.slug ?? '', 80);
    const canonical = text(seo.canonical ?? '', 500);
    if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('URL 别名须使用小写字母、数字和连字符');
    if (canonical) {
      let url; try { url = new URL(canonical); } catch { fail('Canonical URL 格式无效'); }
      if (!['http:', 'https:'].includes(url.protocol)) fail('Canonical URL 格式无效');
    }
    result.seo = { slug, title: text(seo.title ?? '', 180), description: text(seo.description ?? '', 500), keywords: text(seo.keywords ?? '', 500), canonical };
  }
  return result;
}
function homepageDocumentOf(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.languages || typeof input.languages !== 'object') fail('首页内容格式无效');
  const languages = {};
  for (const lang of LANGUAGES) {
    const value = input.languages[lang];
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('请补齐中文、英文和德文首页内容');
    const featuredProductIds = value.featuredProductIds;
    if (!Array.isArray(featuredProductIds) || featuredProductIds.length > 6 || featuredProductIds.some(id => typeof id!=='string'||!id.trim()||id.length>160) || new Set(featuredProductIds).size !== featuredProductIds.length) fail('首页精选产品无效，最多选择 6 项');
    languages[lang] = {
      eyebrow: text(value.eyebrow, 100, true),
      title: text(value.title, 180, true),
      intro: text(value.intro, 1000, true),
      browse: text(value.browse, 80, true),
      featuredProductIds,
    };
  }
  return { languages };
}
function createCatalogStore(connectionString) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });
  const columns = 'product_id AS "productId",draft,published,revision,published_revision AS "publishedRevision",legacy_product_market AS "legacyMarket"';
  const empty = id => ({ productId: id, draft: null, published: null, revision: 0, publishedRevision: null, legacyMarket: null });
  async function product(client, id, lock = false) {
    const row = (await client.query('SELECT id,kind,status FROM products WHERE id=$1' + (lock ? ' FOR UPDATE' : ''), [id])).rows[0];
    if (!row) fail('产品不存在', 404);
    return row;
  }
  async function validateMedia(client, id, document) {
    const detailImageIds = [];
    for (const locale of Object.values(document.languages || {})) {
      for (const block of locale.detailBlocks || []) if (block.type === 'image' && block.imageId) detailImageIds.push(block.imageId);
    }
    const ids = [...new Set([...document.mediaIds, ...detailImageIds])];
    if (!ids.length) return;
    const legacy = (await client.query("SELECT id FROM product_media WHERE product_id=$1 AND id=ANY($2::text[]) AND content_type IN ('image/jpeg','image/png','image/webp','image/avif')", [id, ids])).rows;
    const legacyIds = new Set(legacy.map(row => row.id));
    const assetIds = ids.filter(mediaId => !legacyIds.has(mediaId));
    const assets = assetIds.length ? (await client.query("SELECT id::text AS id FROM media_assets WHERE id::text=ANY($1::text[]) AND kind='image' AND content_type IN ('image/jpeg','image/png','image/webp','image/avif')", [assetIds])).rows : [];
    if (legacy.length + assets.length !== ids.length) fail('所选图片不存在，请从素材空间重新选择');
  }
  async function change(id, input, action) {
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新发布内容');
    const draft = action === 'save' ? documentOf(input.document) : null;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const p = await product(c, id, true);
      const old = (await c.query(`SELECT ${columns} FROM catalog_publications WHERE product_id=$1 FOR UPDATE`, [id])).rows[0] || empty(id);
      if (old.revision !== input.revision) fail('发布内容已被更新，请重新加载', 409);
      if (action === 'save') {
        await validateMedia(c, id, draft);
        await c.query('INSERT INTO catalog_publications(product_id,draft,revision) VALUES($1,$2,1) ON CONFLICT(product_id) DO UPDATE SET draft=$2,revision=catalog_publications.revision+1', [id, JSON.stringify(draft)]);
      } else if (action === 'publish') {
        if (p.status !== '启用') fail('请先启用产品');
        if (!old.draft) fail('请先保存发布草稿');
        await validateMedia(c, id, documentOf(old.draft));
        await c.query('UPDATE catalog_publications SET published=draft,revision=revision+1,published_revision=revision+1 WHERE product_id=$1', [id]);
      } else {
        if (!old.published) fail('产品尚未发布');
        await c.query('UPDATE catalog_publications SET published=NULL,published_revision=NULL,revision=revision+1 WHERE product_id=$1', [id]);
      }
      const row = (await c.query(`SELECT ${columns} FROM catalog_publications WHERE product_id=$1`, [id])).rows[0];
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), `catalog.${action}`, `products/${id}/publication`, JSON.stringify(old), JSON.stringify(row)]);
      await c.query('COMMIT');
      // 商品发布内容变更会影响官网首页装修快照的商品卡片：清空短缓存，访客下次请求即时反映。
      if (action === 'publish' || action === 'unpublish') clearProductCardCache();
      return row;
    } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
    finally { c.release(); }
  }
  const visible = "FROM catalog_publications cp JOIN products p ON p.id=cp.product_id WHERE p.status='启用' AND cp.published IS NOT NULL";
  function publicRow(row, lang) {
    // Never spread a product or stored JSON document into a public response.
    const doc = documentOf(row.published), locale = doc.languages[lang];
    if (!locale) return null;
    const slug = row.slug || doc.seo?.slug;
    if (!slug) return null;
    return { id: slug, productId: row.id, slug, kind: row.kind, model: doc.model, title: locale.title, description: locale.description, delivery: locale.delivery || '', warranty: locale.warranty || '', specifications: locale.specifications, detailBlocks: locale.detailBlocks || [], languages: Object.keys(doc.languages), images: doc.mediaIds.map(id => ({ id, url: `/api/catalog/products/${encodeURIComponent(row.id)}/images/${encodeURIComponent(id)}` })), prices: row.prices || [] };
  }
  // 图文详情图片按来源给出可访问 URL：产品图库图片走商品图接口，素材库图片走 cms-media。
  async function detailImageUrls(productId, blocks) {
    const ids = [...new Set((blocks || []).filter(block => block.type === 'image').map(block => block.imageId))];
    if (!ids.length) return blocks || [];
    const legacy = new Set((await pool.query('SELECT id FROM product_media WHERE product_id=$1 AND id=ANY($2::text[])', [productId, ids])).rows.map(r => r.id));
    return blocks.map(block => block.type === 'image' ? { ...block, url: legacy.has(block.imageId) ? `/api/catalog/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(block.imageId)}` : `/api/public/cms-media/${encodeURIComponent(block.imageId)}` } : block);
  }
  async function relatedAccessories(productId, lang) {
    const rows = (await pool.query(`SELECT p.id,p.kind,l.published,l.slug,COALESCE(price.rows,'[]'::jsonb) AS prices
      FROM fits f JOIN products p ON p.entity_uuid=f.part_product_uuid
      JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('currency',offers.currency,'unitPrice',offers.unit_price) ORDER BY offers.currency) AS rows FROM (SELECT lp.currency,min(lp.unit_price)::text AS unit_price FROM storefront_listing_prices lp JOIN storefront_listing_skus ls ON ls.listing_id=lp.listing_id AND ls.sku_uuid=lp.sku_uuid WHERE lp.listing_id=l.id AND lp.published GROUP BY lp.currency) offers) price ON true
      WHERE f.vehicle_product_uuid=(SELECT entity_uuid FROM products WHERE id=$1 AND kind='vehicle') AND p.kind='part' AND p.status='启用' AND l.published->'languages' ? $2
      ORDER BY p.name,p.id LIMIT 12`, [productId, lang])).rows;
    return rows.map(row => publicRow(row, lang)).filter(Boolean);
  }
  async function homepageProducts(client, ids, lang) {
    if (!ids.length) return [];
    const rows=(await client.query(`SELECT p.id,p.kind,l.published,l.slug FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL WHERE (p.id=ANY($1::text[]) OR l.slug=ANY($1::text[])) AND p.status='启用' AND l.published->'languages' ? $2 ORDER BY COALESCE(array_position($1::text[],p.id),array_position($1::text[],l.slug))`,[ids,lang])).rows;
    return rows.map(row=>publicRow(row,lang));
  }
  async function changeHomepage(input, action) {
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新首页内容');
    const draft=action==='save'?homepageDocumentOf(input.document):null, c=await pool.connect();
    try {
      await c.query('BEGIN');
      const old=(await c.query('SELECT id,draft,published,revision,published_revision AS "publishedRevision" FROM site_pages WHERE slug=$1 FOR UPDATE',['home'])).rows[0];
      if(!old)fail('首页内容记录不存在',404);
      if(old.revision!==input.revision)fail('首页内容已更新，请重新加载',409);
      const candidate=action==='save'?draft:old.draft;
      if(action==='save'||action==='publish'){
        if(!candidate)fail('请先保存首页草稿');
        for(const lang of LANGUAGES){const rows=await homepageProducts(c,candidate.languages[lang].featuredProductIds,lang);if(rows.length!==candidate.languages[lang].featuredProductIds.length)fail('精选产品必须已在对应语言发布')}
      }else if(!old.published)fail('首页尚未发布');
      let after;
      if(action==='save') after=(await c.query('UPDATE site_pages SET draft=$1,revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$3 RETURNING id,draft,published,revision,published_revision AS "publishedRevision",updated_by AS "updatedBy",updated_at AS "updatedAt"',[JSON.stringify(draft),currentActor(),old.id])).rows[0];
      else if(action==='publish') after=(await c.query('UPDATE site_pages SET published=draft,revision=revision+1,published_revision=revision+1,updated_by=$1,updated_at=now() WHERE id=$2 RETURNING id,draft,published,revision,published_revision AS "publishedRevision",updated_by AS "updatedBy",updated_at AS "updatedAt"',[currentActor(),old.id])).rows[0];
      else after=(await c.query('UPDATE site_pages SET published=NULL,published_revision=NULL,revision=revision+1,updated_by=$1,updated_at=now() WHERE id=$2 RETURNING id,draft,published,revision,published_revision AS "publishedRevision",updated_by AS "updatedBy",updated_at AS "updatedAt"',[currentActor(),old.id])).rows[0];
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),`site.home.${action}`,'site-pages/home',JSON.stringify(old),JSON.stringify(after)]);
      await c.query('COMMIT');
      return after;
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  const LAYOUT_COLUMNS='project,html,css,translations,version,published_version AS "publishedVersion",published_at AS "publishedAt",published_by AS "publishedBy",updated_by AS "updatedBy",updated_at AS "updatedAt"';
  // 保存/发布后的回执只需要这些小字段：把 project/html/css 带进 RETURNING 会让数据库
  // 再把几十万字符回传一遍（慢链路上直接多出十几秒），Client 也用不到。
  const LAYOUT_META_COLUMNS='version,published_version AS "publishedVersion",published_at AS "publishedAt",published_by AS "publishedBy",updated_by AS "updatedBy",updated_at AS "updatedAt"';
  // 多语言：中文稿是唯一编辑源，英/德只存“中文原文 → 译文”的文本层
  const LAYOUT_LOCALES=['en','de'];
  // 译文表同时存在两种键：
  //   旧格式（历史数据）：{ '中文原文': '译文' }
  //   新格式（内容 ID 化之后）：{ 'hero.title.0': { src:'中文原文', dst:'译文' } }
  // 旧格式必须原样保留，否则老站点一保存就把已翻好的内容清空；
  // 新格式带上 src 才能判断「中文改过了，译文需要更新」。两种可混存，读取端按条目判断。
  const MAX_TRANSLATION_ENTRIES=2000, MAX_TRANSLATION_KEY=2000, MAX_TRANSLATION_TEXT=4000;
  function cleanTranslationEntry(key,text){
    if(typeof key!=='string'||!key.trim())return null;
    if(key.length>MAX_TRANSLATION_KEY)fail('单条文案过长');
    if(typeof text==='string'){
      if(!text.trim())return null;
      if(text.length>MAX_TRANSLATION_TEXT)fail('单条文案过长');
      return [key.slice(0,MAX_TRANSLATION_KEY),text.slice(0,MAX_TRANSLATION_TEXT)];
    }
    if(!text||typeof text!=='object'||Array.isArray(text))return null;
    const dst=typeof text.dst==='string'?text.dst:null;
    if(dst===null||!dst.trim())return null;
    if(dst.length>MAX_TRANSLATION_TEXT)fail('单条文案过长');
    const src=typeof text.src==='string'?text.src.slice(0,MAX_TRANSLATION_TEXT):'';
    return [key.slice(0,MAX_TRANSLATION_KEY),{src,dst:dst.slice(0,MAX_TRANSLATION_TEXT)}];
  }
  function cleanTranslations(value){
    if(value===undefined||value===null)return undefined;
    if(typeof value!=='object'||Array.isArray(value))fail('翻译内容格式无效');
    const out={};
    for(const locale of LAYOUT_LOCALES){
      const table=value[locale];
      if(table===undefined||table===null){out[locale]={};continue}
      if(typeof table!=='object'||Array.isArray(table))fail('翻译内容格式无效');
      const pairs={};
      for(const [key,text] of Object.entries(table)){
        const entry=cleanTranslationEntry(key,text);
        if(!entry)continue;
        pairs[entry[0]]=entry[1];
        if(Object.keys(pairs).length>MAX_TRANSLATION_ENTRIES)fail('翻译条目过多');
      }
      out[locale]=pairs;
    }
    return out;
  }
  // 发布快照里的语言版本：html/css 已按该语言渲染好，这里只做体积与结构校验
  function cleanLocaleSnapshots(value){
    if(value===undefined||value===null)return {};
    if(typeof value!=='object'||Array.isArray(value))fail('多语言页面格式无效');
    const out={};
    for(const locale of LAYOUT_LOCALES){
      const snapshot=value[locale];
      if(!snapshot)continue;
      const html=cleanPageHtml(layoutText(snapshot.html,`${locale} 页面 HTML`,2*1024*1024));
      const css=layoutText(snapshot.css,`${locale} 页面样式`,2*1024*1024);
      if(!html||!String(html).trim())continue;
      out[locale]={html,css:css||''};
    }
    return out;
  }
  // grapesjs 导出的 HTML 会自带 <body> 包裹，发布前去掉，避免页面里再套一层 body
  function cleanPageHtml(html){
    if(typeof html!=='string')return html;
    const body=html.trim().replace(/^<body[^>]*>/i,'').replace(/<\/body>\s*$/i,'').trim();
    return sanitizeHtml(body, PAGE_SANITIZE_OPTIONS);
  }
  function cleanPageCss(css){return typeof css==='string'?css.replace(/<\/style/gi,''):css;}
  function layoutText(value,label,limit){
    if(value===undefined||value===null)return null;
    if(typeof value!=='string')fail(`${label}格式无效`);
    if(Buffer.byteLength(value,'utf8')>limit)fail(`${label}超过长度限制`);
    return value;
  }
  // 跨区数据库链路只有 ~10 KB/s 量级，首页装修的 html/css 动辄几十上百 KB，
  // 直接读一次要十几秒。这里在写入时把大文本 gzip+base64 存进原 text 字段（带前缀），
  // 读取时透明还原：不改表结构，老数据（无前缀）照常直读。
  const PACK_PREFIX = 'gz1:';
  const PACK_MIN_CHARS = 4096;
  function packText(value) {
    if (typeof value !== 'string' || value.length < PACK_MIN_CHARS || value.startsWith(PACK_PREFIX)) return value;
    try { return PACK_PREFIX + zlib.gzipSync(Buffer.from(value, 'utf8')).toString('base64'); } catch (_) { return value; }
  }
  function unpackText(value) {
    if (typeof value !== 'string' || !value.startsWith(PACK_PREFIX)) return value;
    try { return zlib.gunzipSync(Buffer.from(value.slice(PACK_PREFIX.length), 'base64')).toString('utf8'); } catch (_) { return ''; }
  }
  // 工作台只需要版本号/时间来做「内容版本」展示，不需要 800KB 级的 project 正文。
  // 数据库链路每 KB 都很贵（跨区直连约 15–20 KB/s），所以 metaOnly 走轻查询。
  async function storefrontLayoutDraft(metaOnly = false) {
    const columns = metaOnly
      ? 'slug,version,published_version AS "publishedVersion",published_at AS "publishedAt",updated_by AS "updatedBy",updated_at AS "updatedAt"'
      : LAYOUT_COLUMNS;
    const row=(await pool.query(`SELECT ${columns} FROM storefront_layout_drafts WHERE slug=$1`,['home'])).rows[0]||null;
    if(row&&!metaOnly){ row.html=unpackText(row.html); row.css=unpackText(row.css); }
    return row;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  // 官网首页装修快照里的商品卡片只有 data-alsvid-product-id 和占位文案。
  // 输出给访客前按已发布的商品资料注入标题/主图：后台改商品即生效，不必重新装修发布。
  // 短时效内存缓存：同一批商品（4 个车型）跨请求不变，缓存 60s 即可消除绝大多数重复查询；
  // 商品发布/下线时主动清空，保证后台改动最多 60s 内（或即时）反映到官网首页。
  const PRODUCT_CARD_CACHE_TTL = 60 * 1000;
  const productCardCache = new Map();
  function productCardCacheKey(ids, locale) { return `${locale}|${[...ids].sort().join(',')}`; }
  function getCachedProductCards(ids, locale) {
    const hit = productCardCache.get(productCardCacheKey(ids, locale));
    if (hit && Date.now() - hit.at < PRODUCT_CARD_CACHE_TTL) return hit.products;
    if (hit) productCardCache.delete(productCardCacheKey(ids, locale));
    return null;
  }
  function setCachedProductCards(ids, locale, products) {
    productCardCache.set(productCardCacheKey(ids, locale), { at: Date.now(), products });
  }
  function clearProductCardCache() { productCardCache.clear(); clearPublishedLayoutCache(); }
  async function decorateProductCards(html, locale) {
    if (typeof html !== 'string' || !html.includes('data-alsvid-product-id=')) return html;
    try {
      const ids = [...new Set([...html.matchAll(/data-alsvid-product-id="([^"]+)"/g)].map(match => match[1]))];
      if (!ids.length) return html;
      let products = getCachedProductCards(ids, locale);
      if (!products) {
        const rows = (await pool.query(`SELECT p.id,p.kind,l.published,l.slug,'[]'::jsonb AS prices
          FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL
          WHERE p.id=ANY($1::text[]) AND p.status='启用' AND l.published->'languages' ? $2`, [ids, locale])).rows;
        products = new Map(rows.map(row => [row.id, publicRow(row, locale)]).filter(([, item]) => item));
        setCachedProductCards(ids, locale, products);
      }
      return html.replace(/<article\b([^>]*\bdata-alsvid-product-id="([^"]+)"[^>]*)>([\s\S]*?)<\/article>/g, (full, attrs, id, inner) => {
        const item = products.get(id);
        if (!item) return '';
        let body = inner;
        const image = item.images?.[0]?.url;
        if (image) body = body.replace(/<div\s+class="product-image"[^>]*>[\s\S]*?<\/div>/i,
          `<div class="product-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.title)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;display:block" /></div>`);
        if (item.title) body = body.replace(/<h3\b[^>]*>[\s\S]*?<\/h3>/i, `<h3>${escapeHtml(item.title)}</h3>`);
        body = body.replace(/(<a\b[^>]*\bhref=")[^"]*(")/i, `$1/www/${encodeURIComponent(locale)}/products/${encodeURIComponent(item.slug)}$2`);
        return `<article${attrs}>${body}</article>`;
      });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', code: 'LAYOUT_PRODUCT_DECORATE_FAILED', message: String(error?.message || '').slice(0, 200) }));
      return html;
    }
  }
  // 公开访问每次都要读 published 大字段并重新跑一遍清洗，跨区慢链路下会拖到秒级。
  // 用「语言 + 已发布版本号」做键做内存缓存，命中时只查两个小字段；发布/下线主动清空。
  const publishedLayoutCache = new Map();
  const PUBLISHED_LAYOUT_TTL = 5 * 60 * 1000;
  function clearPublishedLayoutCache() { publishedLayoutCache.clear(); }
  async function publishedStorefrontLayout(locale) {
    const meta=(await pool.query('SELECT published_version AS "publishedVersion",published_at AS "publishedAt",(published IS NOT NULL) AS present FROM storefront_layout_drafts WHERE slug=$1',['home'])).rows[0];
    if(!meta?.present)return null;
    const cacheKey=`${locale||'zh'}|${meta.publishedVersion||0}`;
    const cached=publishedLayoutCache.get(cacheKey);
    if(cached&&Date.now()-cached.at<PUBLISHED_LAYOUT_TTL)return cached.value;
    const row=(await pool.query('SELECT published FROM storefront_layout_drafts WHERE slug=$1',['home'])).rows[0];
    if(!row?.published)return null;
    const base={html:row.published.html||'',css:row.published.css||'',version:meta.publishedVersion||null,publishedAt:meta.publishedAt||null};
    const locales=row.published.locales&&typeof row.published.locales==='object'?row.published.locales:{};
    // available 的语义必须是「现在真的能对外提供哪些语言」，而不是「有哪些翻译版本」。
    // 中文是源稿，存在 base.html 里而不在 locales 里，早先被漏掉，导致 /zh 明明能正常渲染、
    // 接口却只报 ['de','en']，看接口会误判中文没发布。这里把源语言补回去并显式声明。
    const translated=Object.keys(locales).filter(code=>code!=='zh'&&unpackText(locales[code]?.html));
    const available=unpackText(base.html)?['zh',...translated]:translated;
    const sourceLocale='zh';
    let value;
    if(locale&&locale!=='zh'){
      const snapshot=locales[locale];
      // 该语言没发布就返回 null，让前台回退到系统默认模板（而不是显示中文版式）
      if(!unpackText(snapshot?.html))return null;
      value={html:await decorateProductCards(cleanPageHtml(unpackText(snapshot.html)),locale),css:cleanPageCss(unpackText(snapshot.css||'')),version:base.version,publishedAt:base.publishedAt,locale,available,sourceLocale};
    } else {
      value={...base,html:await decorateProductCards(cleanPageHtml(unpackText(base.html)),'zh'),css:cleanPageCss(unpackText(base.css)),locale:'zh',available,sourceLocale};
    }
    publishedLayoutCache.set(cacheKey,{at:Date.now(),value});
    return value;
  }
  // 草稿预览（仅管理员）：发布前先在真实页面里看一遍草稿，不必改动线上快照。
  async function draftStorefrontLayout(locale='zh') {
    const row=(await pool.query('SELECT html,css,version FROM storefront_layout_drafts WHERE slug=$1',['home'])).rows[0];
    const draftHtml=unpackText(row?.html||''), draftCss=unpackText(row?.css||'');
    if(!row||!draftHtml.trim())return null;
    return {html:await decorateProductCards(cleanPageHtml(draftHtml),locale),css:cleanPageCss(draftCss),version:row.version||null,publishedAt:null,locale,available:[],sourceLocale:'zh',preview:true};
  }
  // 发布：把当前草稿的 HTML/CSS 固化为访客可见快照；草稿继续可改，互不影响。
  async function publishStorefrontLayoutDraft(input={}) {
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('请先读取最新云端草稿');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('alsvid_v2:storefront:layout-home'))");
      const old=(await c.query('SELECT id,version,html,css,published_version AS "publishedVersion" FROM storefront_layout_drafts WHERE slug=$1 FOR UPDATE',['home'])).rows[0];
      if(!old)fail('云端还没有装修草稿，请先保存草稿再发布');
      if(old.version!==input.expectedVersion)fail('云端装修草稿已更新，请重新读取后再发布',409);
      const html=cleanPageHtml(layoutText(input.html,'页面 HTML',2*1024*1024)||unpackText(old.html));
      const css=layoutText(input.css,'页面样式',2*1024*1024)||unpackText(old.css);
      if(!html||!String(html).trim())fail('当前草稿没有可发布的页面内容');
      const locales=cleanLocaleSnapshots(input.locales);
      // 快照与正文都按需压缩存储，读取端 unpackText 透明还原
      const packedLocales={};
      for(const [code,entry] of Object.entries(locales||{})) packedLocales[code]={html:packText(entry?.html||''),css:packText(entry?.css||'')};
      // 兜底：调用方没带 locales 时，绝不能把已发布的英/德快照抹成空。
      // 只在这种少见路径上多读一次 published，正常发布（显式带 locales）不受影响。
      if(input.locales===undefined||input.locales===null){
        const prev=(await c.query('SELECT published FROM storefront_layout_drafts WHERE id=$1',[old.id])).rows[0]?.published;
        const prevLocales=prev&&typeof prev==='object'?prev.locales:null;
        if(prevLocales&&typeof prevLocales==='object'){
          for(const [code,entry] of Object.entries(prevLocales)) if(!packedLocales[code]) packedLocales[code]=entry;
        }
      }
      const releaseVersion=await nextLayoutVersion(c,old);
      const snapshot=JSON.stringify({html:packText(html),css:packText(css||''),version:releaseVersion,sourceDraftVersion:old.version,locales:packedLocales});
      const after=(await c.query('UPDATE storefront_layout_drafts SET html=$1,css=$2,published=$3::jsonb,published_version=$6,published_by=$4,published_at=now() WHERE id=$5 RETURNING published_version AS "publishedVersion",published_at AS "publishedAt"',[packText(html),packText(css||''),snapshot,currentActor(),old.id,releaseVersion])).rows[0];
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'storefront.layout.publish','storefront-layout-drafts/home',JSON.stringify({publishedVersion:old.publishedVersion||null}),JSON.stringify({publishedVersion:after.publishedVersion,bytes:Buffer.byteLength(html,'utf8'),locales:Object.keys(locales)})]);
      // 版本快照：回滚的唯一依据。audit_log 只记元数据，不含内容，故单独落表。
      // 快照失败则整个发布事务回滚。
      await recordLayoutVersion(c,{version:after.publishedVersion,snapshot,origin:'publish',publishedBy:currentActor()});
      await c.query('COMMIT');
      clearPublishedLayoutCache();
      // 发布成功后把同一份版式推给生产站；未配置同步时直接返回 skipped，不影响本地发布结果
      const productionSync = await syncHomeLayout({ html, css, version: after.publishedVersion });
      // 再通知新站 8091 失效装修缓存，做到「发布即生效」，不依赖 TTL 到期
      const storefrontRevalidate = await revalidateStorefront();
      return { ...after, productionSync, storefrontRevalidate };
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  // ── 按语言独立发布 + 覆盖率门禁 ──────────────────────────────────────────
  // 一次「全部发布」把三语绑在一起：德文没翻完就没法先发中文，中文改一个标点又要把
  // 英德重发一遍。这里拆成单语言发布，每种语言各自持有 version/publishedAt。
  const LAYOUT_LOCALE_LABELS={en:'英文',de:'德文'};
  // 未翻译的节点在渲染时会包一层 .alsvid-untranslated，服务端据此就能独立核算覆盖率，
  // 不必信任前端报上来的数字。
  function countUntranslatedMarkers(html){
    const hits=String(html||'').match(/alsvid-untranslated/g);
    return hits?hits.length:0;
  }
  // 线上页面不该带编辑期的虚线标记：剥掉外层 span 保留中文原文，访客看到的是干净的页面
  function stripUntranslatedMarkers(html){
    return String(html||'').replace(/<span\b[^>]*class="[^"]*\balsvid-untranslated\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g,'$1');
  }
  function localeSnapshotOf(published){
    const source=published&&typeof published==='object'?published:{};
    const locales=source.locales&&typeof source.locales==='object'?{...source.locales}:{};
    return {html:source.html||'',css:source.css||'',version:source.version||null,locales};
  }
  async function publishStorefrontLocale(input={}){
    const locale=String(input.locale||'').trim();
    if(locale!=='zh'&&!LAYOUT_LOCALES.includes(locale))fail('不支持的语言：'+(locale||'（空）'));
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('请先读取最新云端草稿');
    const rawHtml=layoutText(input.html,'页面 HTML',2*1024*1024);
    const rawCss=layoutText(input.css,'页面样式',2*1024*1024)||'';
    if(!rawHtml||!String(rawHtml).trim())fail('该语言还没有可发布的页面内容');
    const untranslated=locale==='zh'?0:countUntranslatedMarkers(rawHtml);
    // 门禁：还有未翻译节点时默认拒绝，避免把半成品语言推给访客
    if(untranslated>0&&input.force!==true){
      fail(`${LAYOUT_LOCALE_LABELS[locale]||locale}页面还有 ${untranslated} 处文案没有译文，未发布。补齐译文后重试，或确认强制发布。`,422);
    }
    const html=cleanPageHtml(stripUntranslatedMarkers(rawHtml));
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('alsvid_v2:storefront:layout-home'))");
      const old=(await c.query('SELECT id,version,published,published_version AS "publishedVersion" FROM storefront_layout_drafts WHERE slug=$1 FOR UPDATE',['home'])).rows[0];
      if(!old)fail('云端还没有装修草稿，请先保存草稿再发布');
      if(old.version!==input.expectedVersion)fail('云端装修草稿已更新，请重新读取后再发布',409);
      const snapshot=localeSnapshotOf(old.published);
      // 中文是源语言：它没发布过就先发中文，否则 /zh 会拿到空页面
      if(locale!=='zh'&&!unpackText(snapshot.html).trim())fail('请先发布中文首页，再发布其他语言');
      const releaseVersion=await nextLayoutVersion(c,old);
      if(locale==='zh'){snapshot.html=packText(html);snapshot.css=packText(rawCss||'')}
      else snapshot.locales[locale]={html:packText(html),css:packText(rawCss||''),version:releaseVersion,publishedAt:new Date().toISOString(),publishedBy:currentActor()};
      snapshot.version=releaseVersion;snapshot.sourceDraftVersion=old.version;
      const after=(await c.query('UPDATE storefront_layout_drafts SET published=$1::jsonb,published_version=$4,published_by=$2,published_at=now() WHERE id=$3 RETURNING published_version AS "publishedVersion",published_at AS "publishedAt"',[JSON.stringify(snapshot),currentActor(),old.id,releaseVersion])).rows[0];
      // 单语言发布同样改变 published，必须留版本快照，否则回滚会跨过这一步
      await recordLayoutVersion(c,{version:after.publishedVersion,snapshot:JSON.stringify(snapshot),origin:'locale',publishedBy:currentActor(),note:(LAYOUT_LOCALE_LABELS[locale]||locale)+' 单独发布'});
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'storefront.layout.publish_locale','storefront-layout-drafts/home',JSON.stringify({publishedVersion:old.publishedVersion||null,locale}),JSON.stringify({publishedVersion:after.publishedVersion,locale,untranslated})]);
      await c.query('COMMIT');
      clearPublishedLayoutCache();
      // 生产站只承接中文首页这一份版式，非中文语言不推
      const productionSync=locale==='zh'?await syncHomeLayout({html,css:rawCss||'',version:after.publishedVersion}):{ok:false,skipped:true,reason:'按语言发布只更新本系统，不同步旧站'};
      const storefrontRevalidate=await revalidateStorefront();
      return {...after,locale,untranslated,productionSync,storefrontRevalidate};
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  async function unpublishStorefrontLocale(input={}){
    const locale=String(input.locale||'').trim();
    if(locale==='zh')fail('中文是源语言，下线整个首页请用「撤回发布」');
    if(!LAYOUT_LOCALES.includes(locale))fail('不支持的语言：'+(locale||'（空）'));
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('alsvid_v2:storefront:layout-home'))");
      const old=(await c.query('SELECT id,version,published,published_version AS "publishedVersion" FROM storefront_layout_drafts WHERE slug=$1 FOR UPDATE',['home'])).rows[0];
      if(!old?.published)fail('首页还没有发布，无需下线');
      const snapshot=localeSnapshotOf(old.published);
      if(!snapshot.locales[locale]){await c.query('ROLLBACK');return {locale,removed:false,publishedVersion:old.publishedVersion||null}}
      delete snapshot.locales[locale];
      const releaseVersion=await nextLayoutVersion(c,old);
      snapshot.version=releaseVersion;snapshot.sourceDraftVersion=old.version;
      const after=(await c.query('UPDATE storefront_layout_drafts SET published=$1::jsonb,published_version=$4,published_by=$2,published_at=now() WHERE id=$3 RETURNING published_version AS "publishedVersion"',[JSON.stringify(snapshot),currentActor(),old.id,releaseVersion])).rows[0];
      await recordLayoutVersion(c,{version:after.publishedVersion,snapshot:JSON.stringify(snapshot),origin:'locale',publishedBy:currentActor(),note:(LAYOUT_LOCALE_LABELS[locale]||locale)+' 下线'});
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'storefront.layout.unpublish_locale','storefront-layout-drafts/home',JSON.stringify({locale}),JSON.stringify({locale,publishedVersion:after.publishedVersion})]);
      await c.query('COMMIT');
      clearPublishedLayoutCache();
      const storefrontRevalidate=await revalidateStorefront();
      return {locale,removed:true,publishedVersion:after.publishedVersion,storefrontRevalidate};
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  // 每种语言各自的发布状态：只从 jsonb 里取几个小字段，不把几百 KB 的快照读出来。
  // 历史快照里的 locales 没有自己的 version（那时只有「全部发布」），
  // 所以「有没有 html」才是是否上线的唯一判据，版本号缺省回落到全局 published_version。
  async function storefrontLocaleStatus(){
    const row=(await pool.query(`SELECT published_version AS "publishedVersion",
      length(published->'locales'->'en'->>'html') AS "enLen",
      length(published->'locales'->'de'->>'html') AS "deLen",
      published->'locales'->'en'->>'version' AS "enVersion",
      published->'locales'->'en'->>'publishedAt' AS "enPublishedAt",
      published->'locales'->'de'->>'version' AS "deVersion",
      published->'locales'->'de'->>'publishedAt' AS "dePublishedAt",
      length(published->>'html') AS "zhLen"
      FROM storefront_layout_drafts WHERE slug=$1`,['home'])).rows[0];
    const globalVersion=row?.publishedVersion||null;
    const localeOf=(len,version,publishedAt)=>({
      published:Number(len||0)>0,
      version:Number(len||0)>0?(Number(version)||globalVersion):null,
      publishedAt:Number(len||0)>0?(publishedAt||null):null,
    });
    return {
      publishedVersion:globalVersion,
      zh:localeOf(row?.zhLen,globalVersion,null),
      en:localeOf(row?.enLen,row?.enVersion,row?.enPublishedAt),
      de:localeOf(row?.deLen,row?.deVersion,row?.dePublishedAt),
    };
  }
  // ── 术语库管理（迁移 182）──────────────────────────────────────────────
  // 放在 store 里而不是路由里：路由层拿不到连接池，之前直接在路由里用 pool
  // 会报 "pool is not defined"，被全局错误处理吞成「产品目录操作失败」。
  async function translationGlossaryList(){
    try{
      const rows=(await pool.query('SELECT id,term,locale,kind,translation,note FROM translation_glossary ORDER BY kind,locale,term')).rows;
      return {available:true,items:rows};
    }catch(error){
      if(error?.code==='42P01')return {available:false,items:[],reason:'术语库表尚未建立（迁移 182 未执行）'};
      throw error;
    }
  }
  async function translationGlossarySave(input={}){
    const term=String(input.term||'').trim(), kind=input.kind==='prefer'?'prefer':'protect';
    if(!term)fail('术语不能为空');
    if(term.length>200)fail('术语不能超过 200 字');
    const locale=kind==='prefer'?(input.locale==='de'?'de':input.locale==='en'?'en':null):'*';
    if(kind==='prefer'&&!locale)fail('固定译法必须指定语言（en 或 de）');
    const translation=kind==='prefer'?String(input.translation||'').trim():null;
    if(kind==='prefer'&&!translation)fail('固定译法不能为空');
    const note=input.note?String(input.note).trim().slice(0,300):null;
    return (await pool.query(
      `INSERT INTO translation_glossary(term,locale,kind,translation,note) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (term,locale,kind) DO UPDATE SET translation=EXCLUDED.translation,note=EXCLUDED.note,updated_at=now()
       RETURNING id,term,locale,kind,translation,note`,[term,locale,kind,translation,note])).rows[0];
  }
  async function translationGlossaryRemove(id){
    const removed=(await pool.query('DELETE FROM translation_glossary WHERE id=$1 RETURNING id,term',[id])).rows[0];
    if(!removed)fail('该术语不存在',404);
    return removed;
  }
  async function translationGlossarySummary(){ return glossarySummary(pool); }
  // 自动翻译入口：术语库与记忆都要连库，所以必须在这里组装后注入纯函数模块
  async function autoTranslateLayout({strings,targets,existing}){
    let glossary=null, memory=null;
    try{
      glossary=await loadGlossary(pool);
      memory={
        lookup:(texts,codes)=>lookupMemory(pool,texts,codes),
        save:rows=>saveMemory(pool,rows),
      };
    }catch(error){
      console.error(JSON.stringify({level:'warn',code:'TRANSLATION_GLOSSARY_LOAD_FAILED',message:String(error?.message||'').slice(0,200)}));
    }
    return translateLayoutStrings({strings,targets,existing,glossary,memory});
  }
  // 手动重试：把「当前线上快照」再推一次生产（发布时推送失败后补推，不用重新发布）
  async function syncPublishedLayoutToProduction() {
    // 没配置同步就别去读那份几百 KB 的快照，直接告诉调用方为什么没推
    if(!syncConfigured())return syncHomeLayout({});
    const row=(await pool.query("SELECT published FROM storefront_layout_drafts WHERE slug=$1",['home'])).rows[0];
    const snapshot=row?.published;
    if(!snapshot||!snapshot.html)return {ok:false,skipped:true,reason:'还没有已发布的版式，先发布一次'};
    const html=unpackText(snapshot.html), css=unpackText(snapshot.css||'');
    return syncHomeLayout({html,css,version:snapshot.version||null});
  }
  // ── 发布版本历史与回滚（迁移 178） ──
  // 快照是发布事务的强制条件，不允许关闭。
  // All callers hold the same transaction advisory lock. Release IDs are independent of draft revisions.
  async function nextLayoutVersion(client,row){
    const max=(await client.query("SELECT COALESCE(MAX(version),0) AS version FROM storefront_layout_versions WHERE slug='home'")).rows[0].version;
    return Math.max(Number(max),Number(row.publishedVersion||0),Number(row.version||0)-1)+1;
  }
  async function recordLayoutVersion(client,{version,snapshot,origin='publish',rolledBackFrom=null,publishedBy,note=null}){
    if(!Number.isSafeInteger(version)||version<=0)fail('版本快照编号无效，已取消操作',500);
    // 必须用 SAVEPOINT 隔离：PostgreSQL 里一条语句失败会让整个事务进入 aborted 状态，
    // 后续 COMMIT 会静默变成 ROLLBACK。先回滚到保存点，再决定是放行还是让发布失败。
    try{
      await client.query('SAVEPOINT layout_version');
      await client.query(
        `INSERT INTO storefront_layout_versions(slug,version,snapshot,published_by,published_at,origin,rolled_back_from,note)
         VALUES('home',$1,$2::jsonb,$3,now(),$4,$5,$6)
`,
        [version,snapshot,publishedBy,origin,rolledBackFrom,note]);
      await client.query('RELEASE SAVEPOINT layout_version');
    }catch(error){
      await client.query('ROLLBACK TO SAVEPOINT layout_version').catch(()=>{});
      const missingTable = error?.code === '42P01';
      console.error(JSON.stringify({level:'error',code:'LAYOUT_VERSION_RECORD_FAILED',sqlState:error?.code||null,message:String(error?.message||'').slice(0,200)}));
      // 抛出后由 publishStorefrontLayoutDraft 的 catch 回滚整个事务 —— 发布不会生效
      fail('版本快照保存失败，已取消本次发布（' + (missingTable ? '版本历史表不存在，请先执行迁移 178' : String(error?.message||'未知错误').slice(0,120)) + '）', 500);
    }
  }
  async function layoutVersions(limit=20){
    const size=Math.min(Math.max(Number(limit)||20,1),100);
    try{
      const rows=(await pool.query(
        `SELECT version,published_by AS "publishedBy",published_at AS "publishedAt",origin,rolled_back_from AS "rolledBackFrom",note,
                pg_column_size(snapshot) AS "bytes"
         FROM storefront_layout_versions WHERE slug='home' ORDER BY version DESC LIMIT $1`,[size])).rows;
      return {available:true,items:rows};
    }catch(error){
      if(error?.code==='42P01')return {available:false,items:[],reason:'版本历史表尚未建立（迁移 178 未执行）'};
      throw error;
    }
  }
  // 单版本完整快照：供后台「版本对比」使用（前端拿到两份 HTML 做行级 diff）。
  // 快照存的是 gz1: 压缩文本，这里透明解压。
  async function layoutVersionDetail(version){
    const target=Number(version);
    if(!Number.isSafeInteger(target)||target<=0)fail('版本号无效');
    let row;
    try{
      row=(await pool.query(
        `SELECT version,published_by AS "publishedBy",published_at AS "publishedAt",origin,rolled_back_from AS "rolledBackFrom",note,snapshot
         FROM storefront_layout_versions WHERE slug='home' AND version=$1`,[target])).rows[0];
    }catch(error){
      if(error?.code==='42P01')return null;
      throw error;
    }
    if(!row)return null;
    const snap=typeof row.snapshot==='string'?JSON.parse(row.snapshot):(row.snapshot||{});
    const locales=snap?.locales&&typeof snap.locales==='object'?snap.locales:{};
    return {
      version:row.version,
      publishedBy:row.publishedBy,
      publishedAt:row.publishedAt,
      origin:row.origin,
      rolledBackFrom:row.rolledBackFrom,
      note:row.note,
      html:unpackText(snap?.html||''),
      css:unpackText(snap?.css||''),
      locales:Object.fromEntries(Object.entries(locales).map(([code,entry])=>[code,{html:unpackText(entry?.html||''),css:unpackText(entry?.css||'')}])),
    };
  }
  // 回滚 = 把历史快照重新发布一次，产生新的版本号。不删除任何历史，链路始终可追溯。
  async function rollbackStorefrontLayout({version,note}={}){
    const target=Number(version);
    if(!Number.isSafeInteger(target)||target<=0)fail('请选择要回滚的版本');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('alsvid_v2:storefront:layout-home'))");
      let source;
      try{
        source=(await c.query("SELECT version,snapshot,published_by AS \"publishedBy\" FROM storefront_layout_versions WHERE slug='home' AND version=$1",[target])).rows[0];
      }catch(error){
        if(error?.code==='42P01')fail('版本历史表尚未建立，无法回滚（请先执行迁移 178）');
        throw error;
      }
      if(!source)fail('找不到该版本的发布快照',404);
      const old=(await c.query("SELECT id,version,published_version AS \"publishedVersion\" FROM storefront_layout_drafts WHERE slug=$1 FOR UPDATE",['home'])).rows[0];
      if(!old)fail('云端还没有装修草稿');
      const current=(await c.query("SELECT rolled_back_from FROM storefront_layout_versions WHERE slug='home' AND version=$1",[old.publishedVersion])).rows[0];
      if(old.publishedVersion===target||current?.rolled_back_from===target)fail('当前线上就是这个版本，无需回滚',409);
      const releaseVersion=await nextLayoutVersion(c,old);
      const original=typeof source.snapshot==='string'?JSON.parse(source.snapshot):source.snapshot;
      const snapshot=JSON.stringify({...original,version:releaseVersion});
      const after=(await c.query('UPDATE storefront_layout_drafts SET published=$1::jsonb,published_version=$4,published_by=$2,published_at=now() WHERE id=$3 RETURNING published_version AS "publishedVersion",published_at AS "publishedAt"',[snapshot,currentActor(),old.id,releaseVersion])).rows[0];
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'storefront.layout.rollback','storefront-layout-drafts/home',JSON.stringify({publishedVersion:old.publishedVersion||null}),JSON.stringify({publishedVersion:after.publishedVersion,rolledBackFrom:target})]);
      await recordLayoutVersion(c,{version:after.publishedVersion,snapshot,origin:'rollback',rolledBackFrom:target,publishedBy:currentActor(),note:typeof note==='string'&&note.trim()?note.trim().slice(0,500):null});
      await c.query('COMMIT');
      clearPublishedLayoutCache();
      const storefrontRevalidate=await revalidateStorefront();
      return {...after,rolledBackFrom:target,storefrontRevalidate};
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  async function unpublishStorefrontLayout() {
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('alsvid_v2:storefront:layout-home'))");
      const old=(await c.query('SELECT id,published_version AS "publishedVersion" FROM storefront_layout_drafts WHERE slug=$1 FOR UPDATE',['home'])).rows[0];
      if(!old||!old.publishedVersion){await c.query('ROLLBACK');return {publishedVersion:null};}
      await c.query('UPDATE storefront_layout_drafts SET published=NULL,published_version=NULL,published_by=NULL,published_at=NULL WHERE id=$1',[old.id]);
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'storefront.layout.unpublish','storefront-layout-drafts/home',JSON.stringify({publishedVersion:old.publishedVersion}),JSON.stringify({publishedVersion:null})]);
      await c.query('COMMIT');
      clearPublishedLayoutCache();
      // 撤回后前台阶必须立即回到默认模板，否则访客仍会看到已撤回的版式
      const storefrontRevalidate = await revalidateStorefront();
      return {publishedVersion:null,storefrontRevalidate};
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  async function saveStorefrontLayoutDraft(input,saveSnapshot=false) {
    if(!input||!input.project||typeof input.project!=='object'||Array.isArray(input.project))fail('装修方案格式无效');
    if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)fail('请先读取最新云端草稿');
    const html=cleanPageHtml(layoutText(input.html,'页面 HTML',2*1024*1024)),css=layoutText(input.css,'页面样式',2*1024*1024);
    const translations=cleanTranslations(input.translations);
    const translationsJson=translations?JSON.stringify(translations):null;
    let serialized;
    try{serialized=JSON.stringify(input.project)}catch(_){fail('装修方案格式无效')}
    if(typeof serialized!=='string'||Buffer.byteLength(serialized,'utf8')>4*1024*1024)fail('装修方案不能超过 4 MB');
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('alsvid_v2:storefront:layout-home'))");
      const old=(await c.query('SELECT id,version,updated_by AS "updatedBy",updated_at AS "updatedAt" FROM storefront_layout_drafts WHERE slug=$1 FOR UPDATE',['home'])).rows[0]||null;
      const version=old?.version||0;
      if(version!==input.expectedVersion)fail('云端装修草稿已更新，请重新读取',409);
      // html/css 压缩后再落库（读取端透明还原），避免几十 KB 文本在慢链路上拖成十几秒
      const htmlPack=html===null||html===undefined?null:packText(html);
      const cssPack=css===null||css===undefined?null:packText(css);
      const after=old
        ?(await c.query(`UPDATE storefront_layout_drafts SET project=$1,html=COALESCE($4,html),css=COALESCE($5,css),translations=COALESCE($6::jsonb,translations),version=version+1,updated_by=$2,updated_at=now() WHERE id=$3 RETURNING ${LAYOUT_META_COLUMNS}`,[serialized,currentActor(),old.id,htmlPack,cssPack,translationsJson])).rows[0]
        :(await c.query(`INSERT INTO storefront_layout_drafts(slug,project,html,css,translations,version,updated_by) VALUES($1,$2,$4,$5,COALESCE($6::jsonb,'{}'::jsonb),1,$3) RETURNING ${LAYOUT_META_COLUMNS}`,['home',serialized,currentActor(),htmlPack,cssPack,translationsJson])).rows[0];
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),'storefront.layout_draft.save','storefront-layout-drafts/home',old?JSON.stringify({version:old.version,updatedAt:old.updatedAt}):null,JSON.stringify({version:after.version,updatedAt:after.updatedAt})]);
      if(saveSnapshot){
        const row=(await c.query("SELECT html,css,version,published_version AS \"publishedVersion\" FROM storefront_layout_drafts WHERE slug='home'")).rows[0];
        const snapshotVersion=await nextLayoutVersion(c,row);
        const snapshot=JSON.stringify({html:row.html||'',css:row.css||'',version:snapshotVersion,sourceDraftVersion:row.version,locales:{}});
        const note=typeof input.note==='string'?input.note.trim().slice(0,120):'';
        await recordLayoutVersion(c,{version:snapshotVersion,snapshot,origin:'manual',publishedBy:currentActor(),note:note||'手动保存'});
        after.snapshotVersion=snapshotVersion;
      }
      await c.query('COMMIT');
      return after;
    }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
  }
  // 保存版本：把当前内容落盘成草稿（版本号 +1），并在版本历史里留一份 origin='manual' 的快照。
  // 与「发布」的区别是完全不碰 published / published_version，线上不受影响。
  async function saveLayoutSnapshot(input={}) { return saveStorefrontLayoutDraft(input,true); }
  return {
    clearProductCardCache,
    async getDraft(id) { await product(pool, id); return (await pool.query(`SELECT ${columns} FROM catalog_publications WHERE product_id=$1`, [id])).rows[0] || empty(id); },
    save: (id, input) => change(id, input, 'save'),
    publish: (id, input) => change(id, input, 'publish'),
    unpublish: (id, input) => change(id, input, 'unpublish'),
    async homepageAdmin() {return (await pool.query('SELECT id,draft,published,revision,published_revision AS "publishedRevision",updated_by AS "updatedBy",updated_at AS "updatedAt" FROM site_pages WHERE slug=$1',['home'])).rows[0]||null;},
    saveHomepage: input=>changeHomepage(input,'save'),
    publishHomepage: input=>changeHomepage(input,'publish'),
    unpublishHomepage: input=>changeHomepage(input,'unpublish'),
    storefrontLayoutDraft,
    publishedStorefrontLayout,
    draftStorefrontLayout,
    publishStorefrontLayoutDraft,
    unpublishStorefrontLayout,
    // 按语言独立发布：中文/英文/德文各自上线、各自下线，互不牵连
    publishStorefrontLocale,
    unpublishStorefrontLocale,
    storefrontLocaleStatus,
    // 术语库与翻译记忆（迁移 182）
    translationGlossaryList,
    translationGlossarySave,
    translationGlossaryRemove,
    translationGlossarySummary,
    autoTranslateLayout,
    syncPublishedLayoutToProduction,
    productionSyncStatus: () => syncStatus(),
    // 新站 8091 的缓存刷新状态（与上面推旧站 V1.0 的通道是两套，不要混用）
    storefrontRevalidateStatus: () => revalidateStatus(),
    // 手动补刷：发布时刷新失败（新站重启、网络抖动等）用它重试，只影响缓存，不改线上版本
    refreshStorefront: () => revalidateStorefront(),
    layoutVersions,
    layoutVersionDetail,
    rollbackStorefrontLayout,
    previewToken: signPreviewToken,
    verifyPreviewToken,
    saveStorefrontLayoutDraft,
    saveLayoutSnapshot,
    async homepage(lang) {const row=(await pool.query('SELECT published FROM site_pages WHERE slug=$1',['home'])).rows[0];if(!row?.published)return null;const content=row.published.languages?.[lang];if(!content)return null;return {...content,products:await homepageProducts(pool,content.featuredProductIds,lang)};},
    async list(lang, page, kind = null, search = '', sort = '') {
      const filters=[],values=[lang,(page-1)*24];
      if(kind){values.push(kind);filters.push(`p.kind=$${values.length}`)}
      if(search){values.push(search.toLocaleLowerCase());const term=`$${values.length}`;filters.push(`(position(${term} in lower(coalesce(l.published->'languages'->$1->>'title','')))>0 OR position(${term} in lower(coalesce(l.published->'languages'->$1->>'description','')))>0 OR position(${term} in lower(coalesce(l.published->>'model','')))>0 OR position(${term} in lower(coalesce(p.name,'')))>0 OR position(${term} in lower(coalesce(p.model,'')))>0 OR EXISTS (SELECT 1 FROM storefront_listing_skus ls JOIN skus s ON s.entity_uuid=ls.sku_uuid JOIN storefront_listing_prices lp ON lp.listing_id=ls.listing_id AND lp.sku_uuid=ls.sku_uuid WHERE ls.listing_id=l.id AND lp.published AND (position(${term} in lower(s.code))>0 OR position(${term} in lower(coalesce(s.spec,'')))>0 OR position(${term} in lower(coalesce(s.color_code,'')))>0)))`)}
      const filter=filters.length?` AND ${filters.join(' AND ')}`:'';
      // 销量=已付款/已发货/已送达订单的商品数量合计；无订单时 sold=0，顺序回退 p.id 保持稳定。
      const salesJoin=sort==='sales'?" LEFT JOIN LATERAL (SELECT COALESCE(sum(oi.quantity),0)::int AS sold FROM storefront_order_items oi JOIN storefront_orders o ON o.id=oi.order_id AND o.status IN ('paid','shipped','delivered') JOIN storefront_listing_skus ls ON ls.sku_uuid=oi.sku_uuid WHERE ls.listing_id=l.id) sales ON true":'';
      const orderBy=sort==='sales'?'sales.sold DESC,p.id':'p.id';
      const rows = (await pool.query(`SELECT p.id,p.kind,l.published,l.slug,COALESCE(price.rows,'[]'::jsonb) AS prices FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('currency',offers.currency,'unitPrice',offers.unit_price) ORDER BY offers.currency) AS rows FROM (SELECT lp.currency,min(lp.unit_price)::text AS unit_price FROM storefront_listing_prices lp JOIN storefront_listing_skus ls ON ls.listing_id=lp.listing_id AND ls.sku_uuid=lp.sku_uuid WHERE lp.listing_id=l.id AND lp.published GROUP BY lp.currency) offers) price ON true${salesJoin} WHERE p.status='启用' AND l.published->'languages' ? $1${filter} ORDER BY ${orderBy} LIMIT 25 OFFSET $2`, values)).rows;
      return { items: rows.slice(0, 24).map(row => publicRow(row, lang)), hasMore: rows.length > 24 };
    },
    async get(slug, lang, options = {}) {
      const { draft = false } = options;
      // 草稿预览：管理员带 draft=1 时读取商品草稿内容（主图/图文详情），发布前即可在装修预览里看到效果。
      const doc = draft ? 'l.draft' : 'l.published';
      // 第三个条件兜底：SEO 商品 ID 是产品主档的唯一真源，正常情况下已同步到 l.slug；
      // 万一历史数据/同步未覆盖，也要能按 SEO ID 直接打开商品页，而不是 404。
      const row = (await pool.query(`SELECT p.id,p.kind,l.published,l.slug,${doc} AS document FROM storefront_listings l JOIN products p ON p.entity_uuid=l.product_uuid WHERE l.channel='website' AND ${doc} IS NOT NULL AND l.published IS NOT NULL AND (l.slug=$1 OR p.id=$1 OR BTRIM(LOWER(p.specs->>'_seoProductId'))=$1) AND p.status='启用' AND ${doc}->'languages' ? $2 ORDER BY CASE WHEN l.slug=$1 THEN 0 WHEN p.id=$1 THEN 1 ELSE 2 END LIMIT 1`, [slug,lang])).rows[0];
      if (!row) return null;
      const product = publicRow({ ...row, published: row.document }, lang);
      return { ...product, detailBlocks: await detailImageUrls(row.id, product.detailBlocks), relatedAccessories: row.kind === 'vehicle' ? await relatedAccessories(row.id, lang) : [] };
    },
    async offers(slug,lang) {return (await pool.query(`SELECT s.code AS sku,s.spec,s.color_code AS color,lp.currency,lp.unit_price::text AS "unitPrice" FROM storefront_listings l JOIN products p ON p.entity_uuid=l.product_uuid JOIN storefront_listing_skus ls ON ls.listing_id=l.id JOIN skus s ON s.entity_uuid=ls.sku_uuid JOIN storefront_listing_prices lp ON lp.listing_id=l.id AND lp.sku_uuid=s.entity_uuid WHERE l.channel='website' AND (l.slug=$1 OR p.id=$1 OR BTRIM(LOWER(p.specs->>'_seoProductId'))=$1) AND l.published IS NOT NULL AND p.status='启用' AND l.published->'languages' ? $2 AND lp.published ORDER BY s.code,lp.currency`,[slug,lang])).rows;},
    async availability(slug,lang) {
      const product=(await pool.query(`SELECT p.entity_uuid,l.id AS listing_id FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND (l.slug=$1 OR p.id=$1 OR BTRIM(LOWER(p.specs->>'_seoProductId'))=$1) AND l.published IS NOT NULL
        WHERE p.status='启用' AND l.published->'languages' ? $2`,[slug,lang])).rows[0];
      if(!product)return null;
      const ready=(await pool.query(`SELECT to_regclass('alsvid_v2.inventory_condition_ledger') IS NOT NULL AS conditions,
        to_regclass('alsvid_v2.inventory_reservations') IS NOT NULL AS reservations,
        to_regclass('alsvid_v2.warehouse_locations') IS NOT NULL AS locations`)).rows[0];
      if(!ready.conditions||!ready.reservations||!ready.locations)return {available:null};
      const rows=(await pool.query(`SELECT s.code AS sku,EXISTS(
        SELECT 1 FROM warehouses w
        LEFT JOIN LATERAL (SELECT COALESCE(sum(cl.quantity_delta),0) AS quantity FROM inventory_condition_ledger cl
          JOIN warehouse_locations loc ON loc.id=cl.location_uuid WHERE loc.warehouse_uuid=w.entity_uuid AND loc.status='启用' AND cl.sku_uuid=s.entity_uuid AND cl.condition='available') stock ON true
        LEFT JOIN LATERAL (SELECT COALESCE(sum(r.quantity),0) AS quantity FROM inventory_reservations r
          WHERE r.warehouse_uuid=w.entity_uuid AND r.sku_uuid=s.entity_uuid AND r.status='reserved') reserved ON true
        WHERE w.country_code='DE' AND w.status='启用' AND w.warehouse_purpose='B2C 仓'
          AND stock.quantity-reserved.quantity>0) AS available
        FROM storefront_listing_skus ls JOIN skus s ON s.entity_uuid=ls.sku_uuid JOIN storefront_listing_prices lp ON lp.listing_id=ls.listing_id AND lp.sku_uuid=s.entity_uuid
        WHERE ls.listing_id=$1 AND lp.published AND lp.currency='EUR' GROUP BY s.code ORDER BY s.code`,[product.listing_id])).rows;
      return {available:rows.some(row=>row.available),items:rows};
    },
    async sitemapProducts() {return (await pool.query(`SELECT l.slug,array_agg(DISTINCT languages.code ORDER BY languages.code) AS languages FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL CROSS JOIN LATERAL jsonb_object_keys(l.published->'languages') AS languages(code) WHERE p.status='启用' AND languages.code=ANY($1::text[]) AND l.slug<>'' GROUP BY p.id,l.slug ORDER BY p.id`,[LANGUAGES])).rows;},
    async adminOffers() {return (await pool.query('SELECT o.id,p.id AS "productId",p.name AS "productName",s.code AS sku,o.currency,o.unit_price::text AS "unitPrice",o.published,o.revision FROM storefront_offers o JOIN skus s ON s.entity_uuid=o.sku_uuid JOIN products p ON p.entity_uuid=s.product_uuid ORDER BY p.name,s.code,o.currency')).rows;},
    async saveOffer(input,id=null) {
      const sku=String(input.sku||'').trim(),currency=input.currency,price=typeof input.unitPrice==='number'||typeof input.unitPrice==='string'?String(input.unitPrice).trim():'',published=input.published;
      if(!sku||sku.length>80||!['EUR','CNY'].includes(currency)||!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>100000000||typeof published!=='boolean'||(id&&(!isUuidv7(id)||!Number.isInteger(input.revision))))fail('公开价格资料无效');
      const c=await pool.connect();try {await c.query('BEGIN');const product=(await c.query('SELECT s.entity_uuid,p.status FROM skus s JOIN products p ON p.entity_uuid=s.product_uuid WHERE s.code=$1 FOR SHARE OF s,p',[sku])).rows[0];if(!product)fail('SKU 不存在',404);if(!id&&product.status!=='启用')fail('停用产品不能新增商城报价');let old=null,row;
        if(id){old=(await c.query('SELECT id,sku_uuid AS "skuUuid",currency,unit_price::text AS "unitPrice",published,revision FROM storefront_offers WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)fail('公开价格不存在',404);if(old.revision!==input.revision)fail('公开价格已更新，请重新载入',409);if(old.skuUuid!==product.entity_uuid||old.currency!==currency)fail('不能修改价格所属 SKU 或币种');
          row=(await c.query('UPDATE storefront_offers SET unit_price=$1,published=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,unit_price::text AS "unitPrice",published,revision',[price,published,id])).rows[0];
        }else row=(await c.query('INSERT INTO storefront_offers(sku_uuid,currency,unit_price,published) VALUES($1,$2,$3,$4) RETURNING id,unit_price::text AS "unitPrice",published,revision',[product.entity_uuid,currency,price,published])).rows[0];
        const after={...row,sku,currency};await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),id?'storefront.offer.update':'storefront.offer.create',`storefront-offers/${row.id}`,old?JSON.stringify(old):null,JSON.stringify(after)]);await c.query('COMMIT');return after;
      }catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23505')fail('该 SKU 和币种的价格已存在',409);throw e}finally{c.release()}
    },
    async image(id, mediaId) {
      const legacy = (await pool.query(`SELECT pm.object_key AS key,pm.content_type AS "contentType" FROM product_media pm JOIN products p ON p.id=pm.product_id JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL WHERE p.id=$1 AND pm.id=$2 AND p.status='启用' AND l.published->'mediaIds' ? pm.id AND pm.content_type IN ('image/jpeg','image/png','image/webp','image/avif')`, [id, mediaId])).rows[0];
      if (legacy) return legacy;
      return (await pool.query(`SELECT ma.object_key AS key,ma.content_type AS "contentType" FROM media_assets ma JOIN products p ON p.id=$1 JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL WHERE p.id=$1 AND p.status='启用' AND l.published->'mediaIds' ? ma.id::text AND ma.id::text=$2 AND ma.kind='image' AND ma.content_type IN ('image/jpeg','image/png','image/webp','image/avif')`, [id, mediaId])).rows[0] || null;
    },
    close: () => pool.end(),
  };
}
function registerCatalogRoutes(app, { catalog, objectStorage }) {
  function route(method, url, handler, isPublic = false, bodyLimit = 128 * 1024) {
    app.route({ method, url, config: { publicCatalog: isPublic }, bodyLimit, handler: async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!catalog) return reply.code(503).send({ error: '产品目录暂时不可用' });
      try { return await handler(req, reply); }
      catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '产品目录操作失败' }); }
    } });
  }
  function language(req) { const lang = req.query.lang || 'en'; if (!LANGUAGES.includes(lang)) fail('不支持的语言'); return lang; }
  const xml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  route('GET','/robots.txt',(req,reply)=>reply.type('text/plain; charset=utf-8').header('Cache-Control','public, max-age=3600').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /my\nDisallow: /dealer\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`),true);
  route('GET','/sitemap.xml',async(req,reply)=>{
    const alternates=[{lang:'en',path:'/'},{lang:'zh',path:'/www/zh'},{lang:'de',path:'/www/de'},{lang:'x-default',path:'/'}];
    const urlRow=(path,links=[])=>`<url><loc>${xml(new URL(path,SITE_ORIGIN).toString())}</loc>${links.map(link=>`<xhtml:link rel="alternate" hreflang="${xml(link.lang)}" href="${xml(new URL(link.path,SITE_ORIGIN).toString())}"/>`).join('')}</url>`;
    const products=await catalog.sitemapProducts(),catalogLanguages=LANGUAGES.filter(lang=>products.some(product=>product.languages.includes(lang))),catalogAlternates=catalogLanguages.map(lang=>({lang,path:`/www/${lang}/products`}));
    const urls=[...alternates.slice(0,3).map(link=>urlRow(link.path,alternates)),...catalogLanguages.map(lang=>urlRow(`/www/${lang}/products`,catalogAlternates))];
    for(const product of products)for(const lang of LANGUAGES.filter(code=>product.languages.includes(code))){const slug=product.slug;if(slug)urls.push(urlRow(`/www/${lang}/products/${encodeURIComponent(slug)}`));}
    reply.type('application/xml; charset=utf-8').header('Cache-Control','public, max-age=3600');
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`;
  },true);
  route('GET','/api/catalog/homepage',req=>catalog.homepage(language(req)),true);
  route('GET', '/api/catalog/products', req => { const page = Number(req.query.page || 1),kind=req.query.kind||null,search=String(req.query.q||'').trim(),sort=req.query.sort==='sales'?'sales':''; if (!Number.isSafeInteger(page) || page < 1 || page > 10000) fail('页码无效'); if(kind&&!['vehicle','part'].includes(kind))fail('产品分类无效'); if(search.length>120)fail('搜索内容不能超过 120 个字符'); return catalog.list(language(req), page, kind, search, sort); }, true);
  route('GET', '/api/catalog/products/:id', async (req, reply) => { const draft = String(req.query.draft || '') === '1' && req.user?.role === 'admin'; if (draft) reply.header('Cache-Control', 'no-store'); const row = await catalog.get(req.params.id, language(req), { draft }); return row || reply.code(404).send({ error: '产品未发布或不存在' }); }, true);
  route('GET', '/api/catalog/products/:id/offers', req => catalog.offers(req.params.id,language(req)), true);
  route('GET', '/api/catalog/products/:id/availability', async (req,reply) => {
    const result=await catalog.availability(req.params.id,language(req));
    if(!result)return reply.code(404).send({error:'产品未发布或不存在'});
    reply.header('Cache-Control','no-store');
    return result;
  }, true);
  route('GET', '/api/catalog/products/:id/images/:mediaId', async (req, reply) => {
    const media = await catalog.image(req.params.id, req.params.mediaId);
    if (!media) return reply.code(404).send({ error: '图片未发布或不存在' });
    if (!objectStorage) return reply.code(503).send({ error: '图片服务暂时不可用' });
    try { const obj = await objectStorage.get(media.key); return reply.header('X-Content-Type-Options', 'nosniff').type(media.contentType).send(obj.Body); }
    catch (_) { return reply.code(502).send({ error: '图片暂时不可用' }); }
  }, true);
  route('GET', '/api/storefront/offers', req => {if(req.user?.role!=='admin')fail('仅管理员可维护公开价格',403);return catalog.adminOffers()});
  route('POST', '/api/storefront/offers', (req,reply) => {if(req.user?.role!=='admin')fail('仅管理员可维护公开价格',403);return catalog.saveOffer(req.body||{}).then(row=>reply.code(201).send(row))});
  route('PUT', '/api/storefront/offers/:id', req => {if(req.user?.role!=='admin')fail('仅管理员可维护公开价格',403);return catalog.saveOffer(req.body||{},req.params.id)});
  route('GET','/api/site/homepage',req=>{if(req.user?.role!=='admin')fail('仅管理员可编辑官网首页',403);return catalog.homepageAdmin()});
  route('GET','/api/site/layout-draft',async req=>{if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);return {data:await catalog.storefrontLayoutDraft(req.query?.meta==='1')}});
  route('PUT','/api/site/layout-draft',req=>{if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);return catalog.saveStorefrontLayoutDraft(req.body||{}).then(data=>({data}))},false,5*1024*1024);
  // 保存版本：草稿 + 快照一起落盘，不改线上（版本历史里 origin=manual）
  route('POST','/api/site/layout-draft/snapshot',req=>{if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);return catalog.saveLayoutSnapshot(req.body||{}).then(data=>({data}))},false,5*1024*1024);
  route('POST','/api/site/layout-draft/publish',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return catalog.publishStorefrontLayoutDraft(req.body||{}).then(data=>({data}))},false,5*1024*1024);
  route('POST','/api/site/layout-draft/unpublish',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return catalog.unpublishStorefrontLayout()});
  // 单语言发布：只替换这一种语言的快照，其余语言保持线上原样
  route('POST','/api/site/layout-draft/publish-locale',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return catalog.publishStorefrontLocale(req.body||{}).then(data=>({data}))},false,5*1024*1024);
  route('POST','/api/site/layout-draft/unpublish-locale',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return catalog.unpublishStorefrontLocale(req.body||{}).then(data=>({data}))});
  route('GET','/api/site/layout-draft/locale-status',req=>{if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);return catalog.storefrontLocaleStatus().then(data=>({data}))});
  // 装修文案自动翻译：只补缺失条目，已有译文（无论人工还是上次机翻）一律不覆盖。
  // 引擎由 TRANSLATE_PROVIDER 决定，业务侧不感知厂商；未配置时返回 placeholder 标记，
  // 前端据此要求人工确认，避免「[DE] 原文」这种占位文本被当成正式译文自动上线。
  route('GET','/api/site/layout-translations/status',async req=>{
    if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);
    // 顺带带上术语库与记忆的规模，面板上能直接看出「记忆有没有在积累」
    const glossary=await catalog.translationGlossarySummary().catch(()=>({available:false,protect:0,prefer:0,memory:{en:0,de:0}}));
    return {data:{...translateStatus(),glossary}};
  });
  // 术语库管理：protect=任何语言都不许翻译的串，prefer=指定语言的固定译法
  route('GET','/api/site/layout-translations/glossary',async req=>{
    if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);
    return {data:await catalog.translationGlossaryList()};
  });
  route('POST','/api/site/layout-translations/glossary',async req=>{
    if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);
    return {data:await catalog.translationGlossarySave(req.body||{})};
  });
  route('DELETE','/api/site/layout-translations/glossary/:id',async req=>{
    if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);
    return {data:await catalog.translationGlossaryRemove(req.params.id)};
  });
  route('POST','/api/site/layout-translations/auto',async req=>{
    if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);
    const body=req.body||{};
    const strings=Array.isArray(body.strings)?body.strings:[];
    if(strings.length>2000)fail('单次最多翻译 2000 条');
    for(const item of strings){if(typeof item!=='string')fail('文案格式无效');if(item.length>2000)fail('单条文案过长');}
    const targets=Array.isArray(body.targets)?body.targets.filter(code=>code==='en'||code==='de'):['en','de'];
    const existing=body.existing&&typeof body.existing==='object'&&!Array.isArray(body.existing)?body.existing:{};
    // 术语库与翻译记忆：命中记忆就不再调引擎，固定译法命中就不必送翻。
    // 组装在 store 里完成（路由层拿不到连接池），迁移未执行时自动退化为
    // 只有代码里的品牌词保护。
    const result=await catalog.autoTranslateLayout({strings,targets,existing});
    return {data:result};
  },false,5*1024*1024);
  // 生产同步：状态查询 + 手动重推（发布时自动推送失败后补推）
  route('GET','/api/site/layout-draft/production-sync',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return {data:catalog.productionSyncStatus()}});
  route('POST','/api/site/layout-draft/production-sync',async req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return {data:await catalog.syncPublishedLayoutToProduction()}});
  // 发布版本历史与回滚（依赖迁移 178；未迁移时返回 available:false，不影响其它功能）
  route('GET','/api/site/layout-draft/versions',req=>{if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);return catalog.layoutVersions(req.query?.limit)});
  // 单版本快照，供版本对比。必须排在 /versions 之后，靠路径段数区分。
  route('GET','/api/site/layout-draft/versions/:version',async(req,reply)=>{
    if(req.user?.role!=='admin')fail('仅管理员可管理商城装修',403);
    const detail=await catalog.layoutVersionDetail(req.params.version);
    if(!detail)return reply.code(404).send({error:'该版本快照不存在（或版本历史表尚未建立）'});
    return detail;
  });
  route('POST','/api/site/layout-draft/rollback',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return catalog.rollbackStorefrontLayout(req.body||{}).then(data=>({data}))});
  // 新站 8091 缓存刷新通道状态
  route('GET','/api/site/layout-draft/storefront-revalidate',req=>{if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);return {data:catalog.storefrontRevalidateStatus()}});
  // 手动补刷新站缓存（发布时刷新失败的重试入口；幂等，不改动已发布版本）
  route('POST','/api/site/layout-draft/storefront-revalidate',async req=>{
    if(req.user?.role!=='admin')fail('仅管理员可发布商城装修',403);
    const result=await catalog.refreshStorefront();
    if(!result.ok&&!result.skipped)fail('新站缓存刷新失败：'+(result.reason||'未知原因'),502);
    return {data:result};
  });
  // 草稿预览令牌：签发给 8091 的 Draft Mode，短时效、绑定语言、无状态
  route('POST','/api/site/layout-draft/preview-token',req=>{
    if(req.user?.role!=='admin')fail('仅管理员可预览装修草稿',403);
    const issued=catalog.previewToken({locale:typeof req.body?.locale==='string'?req.body.locale:'zh'});
    if(!issued)fail('预览未配置：需要设置 ALSVID_PREVIEW_SECRET（至少 32 字节）',503);
    return {data:issued};
  });
  // 凭预览令牌读取草稿：8091 服务端专用，不接受浏览器直接访问以外的方式（令牌本身即凭证）
  route('GET','/api/public/layout-preview',async(req,reply)=>{
    const verified=catalog.verifyPreviewToken(typeof req.query.token==='string'?req.query.token:'');
    if(!verified.ok)return reply.code(401).send({error:verified.reason});
    const requested=['zh','en','de'].includes(String(req.query.locale||''))?String(req.query.locale):verified.locale;
    const draft=await catalog.draftStorefrontLayout(requested);
    if(!draft)return reply.code(404).send({error:'云端还没有可预览的装修草稿'});
    // 草稿只有一个中文源稿，de/en 的快照是发布时才渲染的。
    // 这里如实告知调用方，避免前台把中文稿当成德语预览展示而不自知。
    draft.requestedLocale=requested;
    draft.draftSourceLocale='zh';
    reply.header('Cache-Control','no-store');
    reply.header('X-Robots-Tag','noindex, nofollow');
    return draft;
  },true);
  route('GET','/api/site/layout',async(req,reply)=>{
    const raw=typeof req.query.locale==='string'?req.query.locale.trim().toLowerCase():'';
    const locale=['zh','en','de'].includes(raw)?raw:'zh';
    // 草稿预览：只有管理员能看，且不缓存，避免草稿被搜索引擎或 CDN 收走
    if(req.query.draft==='1'){
      if(req.user?.role!=='admin')fail('仅管理员可预览装修草稿',403);
      const draft=await catalog.draftStorefrontLayout(locale);
      if(!draft)return reply.code(404).send({error:'云端还没有可预览的装修草稿'});
      reply.header('Cache-Control','no-store');
      return draft;
    }
    const data=await catalog.publishedStorefrontLayout(locale);
    // 该语言未发布 → 404，让前台回退系统默认模板，而不是拿中文版式顶替
    if(!data)return reply.code(404).send({error:locale==='zh'?'官网首页尚未发布装修方案':`${locale} 版本尚未发布`});
    // 服务端已有内存缓存兜底，浏览器侧不要再压 max-age：否则发布后 60 秒内刷新仍看到旧版，
    // 很容易被当成「发布没生效」。no-cache 允许存但每次必须回源，回源命中内存缓存很快。
    reply.header('Cache-Control','no-cache');
    reply.header('Vary','Accept-Language');
    return data;
  },true);
  route('PUT','/api/site/homepage',req=>{if(req.user?.role!=='admin')fail('仅管理员可编辑官网首页',403);return catalog.saveHomepage(req.body||{})});
  route('POST','/api/site/homepage/publish',req=>{if(req.user?.role!=='admin')fail('仅管理员可编辑官网首页',403);return catalog.publishHomepage(req.body||{})});
  route('POST','/api/site/homepage/unpublish',req=>{if(req.user?.role!=='admin')fail('仅管理员可编辑官网首页',403);return catalog.unpublishHomepage(req.body||{})});
  route('GET', '/api/products/:id/publication', req => catalog.getDraft(req.params.id));
  for (const [method, suffix, action] of [['PUT', '', 'save'], ['POST', '/publish', 'publish'], ['POST', '/unpublish', 'unpublish']]) {
    route(method, '/api/products/:id/publication' + suffix, (req, reply) => {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可发布产品' });
      return catalog[action](req.params.id, req.body || {});
    });
  }

  // ── SEO 与流量中心（商城运营 › 流量运营）──
  route('GET', '/api/seo/sources', () => traffic.listSources());
  route('PUT', '/api/seo/sources/:source', (req) => traffic.saveSource(req.params.source, req.body || {}));
  route('POST', '/api/seo/sources/:source/test', (req) => traffic.testSource(req.params.source));
  // 统一拉取入口：适配器未接入时返回 501 + 明确文案，前端显示「拉取适配器未接入」
  route('POST', '/api/seo/sources/:source/sync', (req) => traffic.syncSource(req.params.source, traffic.normalizeRange(req.query || {})));
  route('GET', '/api/seo/sync-log', () => traffic.syncStatus(Number(req.query?.limit || 60)));
  // 电商转化分析：漏斗/金额以本系统订单与收款台账为准
  route('GET', '/api/seo/conversion', async (req) => {
    const range = traffic.normalizeRange(req.query || {});
    const [overview, products, countries] = await Promise.all([
      traffic.conversionOverview(range),
      traffic.conversionByProduct(range, 20),
      traffic.conversionByCountry(range),
    ]);
    return { data: { range: { days: range.span, start: range.start.toISOString(), end: range.end.toISOString() }, overview, products, countries } };
  });
  // 技术 SEO 巡检：本系统自爬 + robots/sitemap 校验，无需外部凭据
  // origin 统一走部署配置（ALSVID_STOREFRONT_PUBLIC_ORIGIN），不硬编码本地端口；未配置时明确报错而非偷偷指向 localhost
  route('GET', '/api/seo/tech-audit', async (req) => {
    const origin = String(req.query?.origin || process.env.ALSVID_TECH_AUDIT_ORIGIN || process.env.ALSVID_STOREFRONT_PUBLIC_ORIGIN || '').trim();
    if (!origin || !/^https?:\/\//.test(origin)) {
      const error = new Error('未配置商城站点地址：请设置 ALSVID_STOREFRONT_PUBLIC_ORIGIN（正式域名或部署地址），不要在代码里写本地端口');
      error.statusCode = 503;
      throw error;
    }
    return { data: await traffic.techAudit(origin) };
  });
}
module.exports = { createCatalogStore, registerCatalogRoutes, documentOf, PAGE_SANITIZE_OPTIONS };
