'use strict';

const { createPool } = require('./db-pool');
const { revalidateStorefront } = require('./storefront-revalidate');
const refreshCms = () => revalidateStorefront(['storefront-cms','storefront-products','storefront-layout']);
const { currentActor } = require('./audit-context');
const shellReview = require('./shell-release-review');
const productTemplateReview = require('./product-template-review');
const { isUuidv7, uuidv7 } = require('./uuidv7');

const LANGUAGES = ['zh', 'en', 'de'];
const PAGE_TYPES = ['custom', 'product_template', 'shared_module', 'page_template'];
const COMPONENTS = ['hero', 'twoColumn', 'image', 'carousel', 'divider', 'spacer', 'video', 'productGallery', 'specs', 'features', 'faq', 'cta', 'article', 'comparison', 'reviews', 'accessories', 'manuals'];
const RESERVED_PATHS = ['www', 'catalog', 'api', 'my', 'dealer', 'login'];

const DEFAULT_PAGE_TEMPLATES = [
  {
    id: 'builtin:custom-story',
    builtin: true,
    name: '默认品牌故事模板',
    targetType: 'custom',
    locale: '*',
    document: {
      blocks: [
        { id: 'tpl-hero-1', componentKey: 'hero', schemaVersion: 1, visible: true, props: { eyebrow: 'ALSVID', title: '页面主标题', intro: '在这里介绍品牌理念或核心亮点', ctaLabel: '了解更多', ctaHref: '/www/de/products' }, bindings: {}, sharedRef: null },
        { id: 'tpl-two-1', componentKey: 'twoColumn', schemaVersion: 1, visible: true, props: { title: '核心特点', body: '图文介绍正文内容。', imageId: '', imageSide: 'right' }, bindings: {}, sharedRef: null },
        { id: 'tpl-cta-1', componentKey: 'cta', schemaVersion: 1, visible: true, props: { title: '预约试驾或咨询', text: '欢迎联系我们的专业顾问。', buttonLabel: '联系我们', buttonHref: '/www/de/dealers' }, bindings: {}, sharedRef: null },
      ],
    },
  },
  {
    id: 'builtin:product-ebike',
    builtin: true,
    name: '默认整车商品详情模板',
    targetType: 'product_template',
    locale: '*',
    document: {
      productLayout: { gallery: 'standard', specifications: 'list', reviews: 'list' },
      blocks: [
        { id: 'tpl-specs-1', componentKey: 'specs', schemaVersion: 1, visible: true, props: { heading: '技术参数' }, bindings: { productId: '', fieldSet: 'public_specs', fieldCodes: [] }, sharedRef: null },
        { id: 'tpl-feat-1', componentKey: 'features', schemaVersion: 1, visible: true, props: { heading: '核心卖点', items: [{ title: '轻量化车架', text: '高强度铝合金一体成型。' }] }, bindings: {}, sharedRef: null },
        { id: 'tpl-faq-1', componentKey: 'faq', schemaVersion: 1, visible: true, props: { heading: '常见问题', items: [{ question: '质保期多久？', answer: '整车享受两年官方质保。' }] }, bindings: {}, sharedRef: null },
      ],
    },
  },
];

function cloneBlocksPreservingRefs(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).map(b => ({
    ...b,
    id: `b-${uuidv7().slice(-12)}`,
    props: b.props ? JSON.parse(JSON.stringify(b.props)) : {},
    bindings: b.bindings ? JSON.parse(JSON.stringify(b.bindings)) : {},
    // 保留共享引用（follow / pinned），不被复制断开
    sharedRef: b.sharedRef ? { ...b.sharedRef } : null,
  }));
}

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function assertLegalReady(path, document, seo) {
  if(String(path||'').startsWith('/legal/')&&/\{\{TODO_[A-Z_]+\}\}/i.test(JSON.stringify({document,seo})))fail('法定页面仍含待填写占位符，禁止发布',422);
}
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
  if (path === '/') return '/';
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
  else if (componentKey === 'image') cleanProps = { imageId: assetId(props.imageId), alt: text(props.alt, 160), caption: text(props.caption, 400), href: link(props.href) };
  else if (componentKey === 'carousel') {
    const slides = Array.isArray(props.items) ? props.items : [];
    if (slides.length > 8) fail('图片轮播最多 8 张');
    cleanProps = { heading: text(props.heading, 120), items: slides.map(row => ({ imageId: assetId(row?.imageId), alt: text(row?.alt, 160), caption: text(row?.caption, 240), href: link(row?.href) })).filter(row => row.imageId) };
  } else if (componentKey === 'divider') cleanProps = { style: props.style === 'soft' ? 'soft' : 'line' };
  else if (componentKey === 'spacer') {
    const height = Number(props.height ?? 48);
    if (![16, 24, 32, 48, 64, 80, 96, 120].includes(height)) fail('留白高度无效');
    cleanProps = { height };
  }
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
    const fieldCodes = Array.isArray(bindings.fieldCodes) ? bindings.fieldCodes : [];
    if (fieldCodes.length > 60 || fieldCodes.some(code => typeof code !== 'string' || !/^[a-z0-9_]{1,80}$/.test(code))) fail('参数字段选择无效');
    cleanProps = { heading: text(props.heading, 120) };
    cleanBindings = { productId: text(bindings.productId, 80), fieldSet: 'public_specs', fieldCodes: [...new Set(fieldCodes)] };
  } else if (componentKey === 'features') cleanProps = { heading: text(props.heading, 120), items: items(props.items, 6, [['title', 120, true], ['text', 400]]) };
  else if (componentKey === 'faq') cleanProps = { heading: text(props.heading, 120), items: items(props.items, 12, [['question', 200, true], ['answer', 2000, true]]) };
  else if (componentKey === 'article') cleanProps = { heading: text(props.heading, 180), intro: text(props.intro, 1200), imageId: assetId(props.imageId), imageAlt: text(props.imageAlt, 160), sections: articleSections(props.sections) };
  else if (componentKey === 'comparison') {
    const ids = Array.isArray(bindings.productIds) ? bindings.productIds : [];
    if (ids.length > 4 || ids.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) fail('对比模块最多关联 4 个产品');
    cleanProps = { heading: text(props.heading, 120), emptyNotice: text(props.emptyNotice, 200) };
    cleanBindings = { productIds: [...new Set(ids.map(value => value.trim()))] };
  } else if (componentKey === 'reviews') {
    const limit = Number(props.limit ?? 10);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) fail('评价展示条数需在 1-50 之间');
    cleanProps = { heading: text(props.heading, 120), limit };
    cleanBindings = { productId: text(bindings.productId, 80) };
  } else if (componentKey === 'accessories') {
    const limit = Number(props.limit ?? 12);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) fail('配件展示条数需在 1-30 之间');
    cleanProps = { heading: text(props.heading, 120), limit };
    cleanBindings = { productId: text(bindings.productId, 80) };
  } else if (componentKey === 'manuals') {
    const manuals = Array.isArray(props.items) ? props.items : [];
    if (manuals.length > 20) fail('说明书与技术文档最多 20 项');
    cleanProps = {
      heading: text(props.heading, 120),
      items: manuals.map(item => ({
        title: text(item?.title, 160, true),
        fileName: text(item?.fileName, 200),
        downloadUrl: link(item?.downloadUrl),
        assetId: assetId(item?.assetId),
        sizeBytes: Number(item?.sizeBytes) || 0,
        format: text(item?.format, 20) || 'PDF',
      })).filter(m => m.downloadUrl || m.assetId || m.title)
    };
    cleanBindings = { productId: text(bindings.productId, 80) };
  } else cleanProps = { title: text(props.title, 180, true), text: text(props.text, 600), buttonLabel: text(props.buttonLabel, 60), buttonHref: link(props.buttonHref) };
  let sharedRef = null;
  if (input.sharedRef && typeof input.sharedRef === 'object' && !Array.isArray(input.sharedRef)) {
    const rawMode = String(input.sharedRef.mode || 'follow').toLowerCase();
    const mode = ['follow', 'pinned', 'independent'].includes(rawMode) ? rawMode : 'follow';
    const moduleId = text(input.sharedRef.moduleId, 80);
    const pinnedVersion = Number.isSafeInteger(Number(input.sharedRef.pinnedVersion)) && Number(input.sharedRef.pinnedVersion) > 0 ? Number(input.sharedRef.pinnedVersion) : null;
    if (mode !== 'independent' && !moduleId) fail('引用共享模块必须指定 moduleId');
    if (mode === 'pinned' && !pinnedVersion) fail('固定版本引用必须指定有效版本号');
    sharedRef = { mode, moduleId, pinnedVersion };
  }
  return { id, componentKey, schemaVersion: 1, visible: input.visible !== false, props: cleanProps, bindings: cleanBindings, sharedRef };
}
// 商品详情页 8 模块中的全局模块（②营销 ③④预留 ⑥评价开关 ⑦退换货 ⑧其他）。
// 顺序固定不可拖拽；③④内容为空时前台自动隐藏。缺省字段全部给默认值，旧草稿可直接保存/发布。
// 营销/预留模块：固定位置的样式化组件（不做自由拖拽），三种标准样式共用一套内容字段
const BANNER_STYLES = ['banner', 'imageText', 'promoBar'];
const BANNER_THEME = {
  background: ['none', 'soft', 'dark'],
  spacing: ['compact', 'normal', 'loose'],
  imageRatio: ['wide', 'square', 'auto'],
  buttonStyle: ['solid', 'outline', 'text'],
};
const DEFAULT_PRODUCT_MODULES = {
  marketing: { enabled: false, style: 'banner', imageId: '', title: '', description: '', buttonText: '', href: '', text: '', theme: { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' } },
  reserved3: { enabled: false, style: 'banner', imageId: '', title: '', description: '', buttonText: '', href: '', text: '', theme: { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' } },
  reserved4: { enabled: false, style: 'banner', imageId: '', title: '', description: '', buttonText: '', href: '', text: '', theme: { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' } },
  reviews: { enabled: true, limit: 20, style: 'list' },
  returns: { enabled: false, title: '', body: '' },
  other: { enabled: false, title: '', body: '' },
};
function bannerModuleOf(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const theme = row.theme && typeof row.theme === 'object' && !Array.isArray(row.theme) ? row.theme : {};
  return {
    enabled: row.enabled === true,
    style: BANNER_STYLES.includes(row.style) ? row.style : 'banner',
    imageId: assetId(row.imageId ?? ''),
    title: text(row.title ?? '', 120),
    description: text(row.description ?? '', 400),
    buttonText: text(row.buttonText ?? '', 40),
    href: link(row.href ?? ''),
    text: text(row.text ?? '', 600),
    theme: {
      background: BANNER_THEME.background.includes(theme.background) ? theme.background : 'none',
      spacing: BANNER_THEME.spacing.includes(theme.spacing) ? theme.spacing : 'normal',
      imageRatio: BANNER_THEME.imageRatio.includes(theme.imageRatio) ? theme.imageRatio : 'wide',
      buttonStyle: BANNER_THEME.buttonStyle.includes(theme.buttonStyle) ? theme.buttonStyle : 'solid',
    },
  };
}
function copyModuleOf(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { enabled: row.enabled === true, title: text(row.title ?? '', 180), body: text(row.body ?? '', 4000) };
}
const PERFORMANCE_DEFAULT_FIELDS = ["@weight","@range","@frame","@folded"];
const PERFORMANCE_ALIASES = {"@weight":["weight","net_weight","bike_weight","vehicle_weight","total_weight","整车重量","整车净重","净重","车重"],"@range":["range","max_range","range_km","range_max","续航","续航里程","最大续航","最大续航里程","助力续航","助力续航里程"],"@frame":["frame_material","frame_material_type","车架材质","车架材料"],"@folded":["folded_size","folding_size","folded_dimensions","folding_dimensions","折叠尺寸","折叠后尺寸","折叠体积尺寸"]};
function performanceOf(value) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const codes = row.fieldCodes ?? PERFORMANCE_DEFAULT_FIELDS;
  if (!Array.isArray(codes) || codes.length !== 4 || new Set(codes).size !== 4 || codes.some(code => typeof code !== 'string' || (!PERFORMANCE_DEFAULT_FIELDS.includes(code) && !/^[a-z0-9_]{1,80}$/.test(code)))) fail('P03 必须选择四个不重复的参数字段');
  return { showParameters: row.showParameters !== false, fieldCodes: [...codes], mediaType: row.mediaType === 'video' ? 'video' : 'image', imageId: assetId(row.imageId ?? ''), videoId: assetId(row.videoId ?? ''), headline: text(row.headline, 180), alignment: ['left','center','right'].includes(row.alignment) ? row.alignment : 'center' };
}
function performanceSpecifications(product, fields, locale, config) {
  if (!product || !config.showParameters) return [];
  const applicable = fields.filter(f => f.enabled && f.shopVisible && f.level === 'product' && (!f.templates?.length || f.templates.includes(product.productType)));
  const used = new Set();
  return config.fieldCodes.flatMap(key => {
    const aliases = PERFORMANCE_ALIASES[key];
    const matches = aliases ? applicable.filter(f => aliases.includes(f.code) || aliases.includes(f.nameZh)) : applicable.filter(f => f.code === key);
    const field = matches.length === 1 ? matches[0] : null;
    if (!field || used.has(field.code)) return [];
    const rows = publicProductSpecifications(product, [field], locale, [field.code]);
    if (rows.length) used.add(field.code);
    return rows;
  });
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
    ...(value.performance == null ? {} : { performance: performanceOf(value.performance) }),
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
  const partProductIds = Array.isArray(value.partProductIds) ? value.partProductIds : [];
  if (partProductIds.length > 50 || partProductIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 160)) fail('配件展示商品选择无效（最多 50 个）');
  const services = Array.isArray(value.services) ? value.services : [];
  if (services.length > 2 || services.some(item => !item || typeof item !== 'object' || !['test-ride','service'].includes(item.key))) fail('服务入口配置无效');
  if (new Set(services.map(item => item.key)).size !== services.length) fail('服务入口不能重复');
  const cleanServices = services.map(item => ({ key: item.key, enabled: item.enabled === true, title: text(item.title, 120, true), description: text(item.description, 500), buttonText: text(item.buttonText, 60, true) }));
  return { sort: value.sort === 'default' ? 'default' : 'sales', categories: cleanCategories, partProductIds: [...new Set(partProductIds.map(id => id.trim()))], services: cleanServices };
}
const SITE_SHELL_PATHS = ['/site-shell/announcement','/site-shell/header','/site-shell/footer'];
function siteShellOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('全局装修配置无效');
  const safeLink = raw => {
    const v=link(raw);
    if (v && (v.includes('\\') || /\s/.test(v))) fail('链接不能含空格或反斜线');
    return v;
  };
  const links = rows => items(rows ?? [], 12, [['label',80,true],['href',500,true]]).map(row=>({label:row.label,href:safeLink(row.href)}));
  if(value.kind==='announcement') return {kind:value.kind,enabled:value.enabled===true,text:text(value.text,300),href:safeLink(value.href ?? '')};
  if(value.kind==='header') return {kind:value.kind,brand:text(value.brand,40),links:links(value.links)};
  if(value.kind==='footer'){
    const groups=value.groups??[];
    if(!Array.isArray(groups)||groups.length>6)fail('页脚最多六组导航');
    return {kind:value.kind,brand:text(value.brand,120),groups:groups.map(group=>{
      if(!group||typeof group!=='object'||Array.isArray(group))fail('页脚分组无效');
      return {title:text(group.title,80,true),links:links(group.links)};
    })};
  }
  fail('全局装修区域无效');
}
function assertShellDocument(path,pageType,document){
  if(SITE_SHELL_PATHS.includes(path)){
    if(pageType!=='shared_module'||document.siteShell?.kind!==path.split('/').pop()||document.blocks.length)fail('全局区域必须使用对应的独立共享配置');
  }else if(document.siteShell)fail('全局配置不能写入普通页面');
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
  const templateMeta = input.templateMeta && typeof input.templateMeta === 'object' && !Array.isArray(input.templateMeta)
    ? {
        templateId: text(input.templateMeta.templateId, 120),
        templateName: text(input.templateMeta.templateName, 120),
        targetType: text(input.templateMeta.targetType, 40),
        appliedAt: text(input.templateMeta.appliedAt, 40),
      }
    : undefined;
  return { blocks, productLayout, modules: modulesOf(input), catalogLayout: catalogLayoutOf(input), ...(templateMeta ? { templateMeta } : {}), ...(input.siteShell ? {siteShell:siteShellOf(input.siteShell)} : {}) };
}
function seoOf(input) {
  if (input == null) return { title: '', description: '' };
  if (typeof input !== 'object' || Array.isArray(input)) fail('SEO 资料格式无效');
  return { title: text(input.title, 180), description: text(input.description, 500) };
}
function formatSpecValue(val, field, locale) {
  if (typeof val === 'boolean' && field.type === 'boolean') {
    return locale === 'de' ? (val ? 'Ja' : 'Nein') : locale === 'en' ? (val ? 'Yes' : 'No') : (val ? '是' : '否');
  }
  let strVal = String(val).trim();
  // 枚举值翻译
  let options = field.options;
  if (typeof options === 'string' && options.trim().startsWith('[')) {
    try { options = JSON.parse(options); } catch (_) { options = null; }
  }
  if (Array.isArray(options) && options.length) {
    const matched = options.find(opt => opt && (String(opt.value) === strVal || String(opt.code) === strVal || String(opt.label) === strVal));
    if (matched) {
      if (locale === 'de' && matched.labelDe) return matched.labelDe;
      if (locale === 'en' && (matched.labelEn || matched.nameEn)) return matched.labelEn || matched.nameEn;
      if (locale === 'zh' && (matched.labelZh || matched.nameZh || matched.label)) return matched.labelZh || matched.nameZh || matched.label;
      if (matched.label) return matched.label;
    }
  }
  // 单位防重复：若值末尾已带有 unit，清理多余的单位后缀
  if (field.unit && typeof field.unit === 'string') {
    const u = field.unit.trim();
    if (u && strVal.endsWith(u)) {
      const stripped = strVal.slice(0, -u.length).trim();
      if (stripped && !isNaN(Number(stripped))) {
        strVal = stripped;
      }
    }
  }
  return strVal;
}

function publicProductSpecifications(product, fields, locale, selectedCodes = new Set()) {
  if (!product || !product.specs || typeof product.specs !== 'object' || Array.isArray(product.specs)) return [];
  const labelKey = locale === 'de' ? 'nameDe' : locale === 'en' ? 'nameEn' : 'nameZh';
  const selectedSet = selectedCodes instanceof Set ? selectedCodes : new Set(selectedCodes || []);
  const fieldOrder = Array.isArray(selectedCodes) && selectedCodes.length ? selectedCodes : null;

  const validFields = fields.filter(field => {
    if (!field.enabled || !field.shopVisible || field.level !== 'product' || typeof field.code !== 'string' || field.code.startsWith('_')) return false;
    if (Array.isArray(field.templates) && field.templates.length && !field.templates.includes(product.productType)) return false;
    if (selectedSet.size && !selectedSet.has(field.code)) return false;
    const value = product.specs[field.code];
    return ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim() !== '';
  });

  // 如果指定了顺序，按照指定顺序排序
  if (fieldOrder) {
    const orderMap = new Map(fieldOrder.map((code, idx) => [code, idx]));
    validFields.sort((a, b) => (orderMap.get(a.code) ?? 9999) - (orderMap.get(b.code) ?? 9999));
  }

  return validFields.map(field => ({
    code: field.code,
    label: field[labelKey] || field.nameZh || field.code,
    value: formatSpecValue(product.specs[field.code], field, locale),
    unit: field.unit || '',
  }));
}

function createCmsStore(connectionString) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });
  const columns = `id::text AS id,page_type AS "pageType",locale,path,page_name AS "name",status,draft,published,revision,published_revision AS "publishedRevision",published_version AS "publishedVersion",draft_seo AS "draftSeo",published_seo AS "publishedSeo",published_label AS "publishedLabel",draft_label AS "draftLabel",updated_by AS "updatedBy",updated_at AS "updatedAt"`;
  async function validateAssets(client, document) {
    const images = [], videos = [];
    for (const block of document.blocks) {
      if (block.componentKey === 'twoColumn' && block.props.imageId) images.push(block.props.imageId);
      if (block.componentKey === 'image' && block.props.imageId) images.push(block.props.imageId);
      if (block.componentKey === 'carousel') for (const slide of block.props.items || []) if (slide.imageId) images.push(slide.imageId);
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
    if (document.modules?.performance?.imageId) images.push(document.modules.performance.imageId);
    if (document.modules?.performance?.videoId) videos.push(document.modules.performance.videoId);
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
  async function loadDesignData(productId, locale, config) {
    if (!productId) return {performanceSpecs:[],masterSpecs:[],packageSpecs:[],downloads:[]};
    const product = (await pool.query(`SELECT p.specs,p.product_type AS "productType" FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL WHERE (p.id::text=$1 OR l.slug=$1) AND p.kind='vehicle' AND p.status='启用' AND p.deleted_at IS NULL AND l.published->'languages' ? $2 LIMIT 1`, [productId, locale])).rows[0];
    if (!product) return {performanceSpecs:[],masterSpecs:[],packageSpecs:[],downloads:[]};
    const fields = (await pool.query(`SELECT code,name_zh AS "nameZh",name_en AS "nameEn",name_de AS "nameDe",unit,level,templates,shop_visible AS "shopVisible",enabled FROM fields WHERE enabled=true AND shop_visible=true AND level='product' ORDER BY code`)).rows;
    const masterSpecs=publicProductSpecifications(product,fields,locale);
    const packageCodes=new Set(fields.filter(f=>['package_contents','packing_list','package_list','box_contents','packaging_contents','included_accessories'].includes(f.code)||['包装清单','包装内容','随车附件','包装内含','装箱清单'].includes(f.nameZh)).map(f=>f.code));
    const downloads=(await pool.query(`SELECT DISTINCT ma.id::text AS id,ma.file_name AS "fileName",ma.label,ma.size_bytes AS "sizeBytes" FROM asset_links al JOIN media_assets ma ON ma.id=al.asset_id JOIN products p ON (al.target_id=p.id::text OR al.target_id=p.entity_uuid::text) JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL WHERE (p.id::text=$1 OR l.slug=$1) AND p.kind='vehicle' AND p.status='启用' AND p.deleted_at IS NULL AND l.published->'languages' ? $2 AND al.target_type='product' AND al.role IN ('certificate','drawing','detail','package') AND ma.visibility='public' AND ma.status='published' AND ma.content_type='application/pdf' ORDER BY ma.file_name LIMIT 50`,[productId,locale])).rows.map(m=>({id:m.id,title:m.label||m.fileName,fileName:m.fileName,sizeBytes:Number(m.sizeBytes)||0,downloadUrl:`/api/public/cms-media/${encodeURIComponent(m.id)}`}));
    return {performanceSpecs:performanceSpecifications(product,fields,locale,config),masterSpecs,packageSpecs:masterSpecs.filter(row=>packageCodes.has(row.code)),downloads};
  }
  async function enrich(blocks, locale, contextProductId = '') {
    // 共享模块引用解析 (follow, pinned, independent)
    const followIds = [], pinnedList = [];
    for (const b of blocks) {
      if (b.sharedRef && b.sharedRef.mode !== 'independent' && isUuidv7(b.sharedRef.moduleId)) {
        if (b.sharedRef.mode === 'follow') followIds.push(b.sharedRef.moduleId);
        else if (b.sharedRef.mode === 'pinned' && b.sharedRef.pinnedVersion) {
          pinnedList.push({ id: b.sharedRef.moduleId, version: b.sharedRef.pinnedVersion });
        }
      }
    }
    const sharedDataMap = new Map();
    if (followIds.length) {
      const uniqueFollow = [...new Set(followIds)];
      const rows = (await pool.query('SELECT id::text AS id, published FROM site_pages WHERE id=ANY($1::uuid[]) AND published IS NOT NULL', [uniqueFollow])).rows;
      for (const r of rows) {
        const doc = typeof r.published === 'string' ? JSON.parse(r.published) : r.published;
        if (doc && Array.isArray(doc.blocks) && doc.blocks.length) {
          sharedDataMap.set(`follow:${r.id}`, doc.blocks[0]);
        }
      }
    }
    for (const item of pinnedList) {
      const row = (await pool.query('SELECT snapshot FROM site_page_versions WHERE page_id=$1 AND version=$2 AND deleted_at IS NULL', [item.id, item.version])).rows[0];
      if (row) {
        const doc = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
        if (doc && Array.isArray(doc.blocks) && doc.blocks.length) {
          sharedDataMap.set(`pinned:${item.id}:${item.version}`, doc.blocks[0]);
        }
      }
    }

    // 将解析后的共享模块内容注入当前 blocks
    const resolvedBlocks = blocks.map(b => {
      if (!b.sharedRef || b.sharedRef.mode === 'independent' || !b.sharedRef.moduleId) return b;
      const key = b.sharedRef.mode === 'follow' ? `follow:${b.sharedRef.moduleId}` : `pinned:${b.sharedRef.moduleId}:${b.sharedRef.pinnedVersion}`;
      const sharedSource = sharedDataMap.get(key);
      if (sharedSource) {
        return {
          ...b,
          componentKey: sharedSource.componentKey || b.componentKey,
          props: { ...b.props, ...(sharedSource.props || {}) },
          sharedMeta: { sourceId: b.sharedRef.moduleId, mode: b.sharedRef.mode, resolved: true }
        };
      }
      return b;
    });

    const specsBlocks = resolvedBlocks.filter(block => block.componentKey === 'specs');
    const compBlocks = resolvedBlocks.filter(block => block.componentKey === 'comparison');
    const reviewsBlocks = resolvedBlocks.filter(block => block.componentKey === 'reviews');
    const accessoryBlocks = resolvedBlocks.filter(block => block.componentKey === 'accessories');
    const manualBlocks = resolvedBlocks.filter(block => block.componentKey === 'manuals');

    const galleryIds = blocks.filter(block => block.componentKey === 'productGallery').flatMap(block => block.bindings?.productIds || []);
    // 商品详情模板未绑定固定商品时，使用当前访问的商品 ID/SEO slug，做到一套模板服务所有车型。
    const specIds = specsBlocks.map(block => contextProductId || block.bindings?.productId).filter(Boolean);
    const compIds = compBlocks.flatMap(block => block.bindings?.productIds || []);
    const videoIds = blocks.filter(block => block.componentKey === 'video').map(block => block.props.videoId).filter(Boolean);
    const ids = [...new Set([...galleryIds, ...specIds, ...compIds])];

    const rows = ids.length ? (await pool.query(`SELECT p.id::text AS id,p.kind,p.name,p.product_type AS "productType",p.specs,l.published,l.slug,COALESCE(price.rows,'[]'::jsonb) AS prices
      FROM products p JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL
      LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('currency',offers.currency,'unitPrice',offers.unit_price,'referencePrice',offers.reference_price) ORDER BY offers.currency) AS rows FROM (SELECT DISTINCT ON (lp.currency) lp.currency,lp.unit_price::text AS unit_price,lp.reference_price::text AS reference_price FROM storefront_effective_listing_prices lp JOIN storefront_listing_skus ls ON ls.listing_id=lp.listing_id AND ls.sku_uuid=lp.sku_uuid JOIN skus s ON s.entity_uuid=ls.sku_uuid AND NOT s.disabled WHERE lp.listing_id=l.id AND lp.published ORDER BY lp.currency,lp.unit_price,lp.sku_uuid) offers) price ON true
      WHERE (p.id::text=ANY($1::text[]) OR l.slug=ANY($1::text[])) AND p.status='启用' AND p.deleted_at IS NULL AND l.published->'languages' ? $2`, [ids, locale])).rows : [];
    const fieldRows = (specsBlocks.length || compBlocks.length) ? (await pool.query(`SELECT code,name_zh AS "nameZh",name_en AS "nameEn",name_de AS "nameDe",unit,level,templates,shop_visible AS "shopVisible",enabled
      FROM fields WHERE enabled=true AND shop_visible=true AND level='product' ORDER BY code`)).rows : [];
    const map = new Map(rows.flatMap(r => {
      const doc = r.published, content = doc?.languages?.[locale] || {};
      const value = {
        id: r.id,
        slug: r.slug,
        kind: r.kind,
        title: content.title || r.name,
        image: doc?.mediaIds?.[0] ? { url: `/api/catalog/products/${encodeURIComponent(r.id)}/images/${encodeURIComponent(doc.mediaIds[0])}` } : null,
        specs: r.specs || {},
        productType: r.productType,
        prices: r.prices || [],
        product: { id: r.id, slug: r.slug, kind: r.kind, title: content.title || r.name, image: doc?.mediaIds?.[0] ? { url: `/api/catalog/products/${encodeURIComponent(r.id)}/images/${encodeURIComponent(doc.mediaIds[0])}` } : null },
      };
      return [[r.id, value], ...(r.slug ? [[r.slug, value]] : [])];
    }));

    // 真实评价模块数据绑定 (严格从 storefront_reviews 查询公开真实评价与统计，禁止假值)
    const reviewsMap = new Map();
    const reviewPids = [...new Set(reviewsBlocks.map(b => contextProductId || b.bindings?.productId).filter(Boolean))];
    for (const pid of reviewPids) {
      try {
        const reviewRows = (await pool.query(`SELECT r.id,r.rating,r.content,r.reply,r.replied_at AS "repliedAt",r.created_at AS "createdAt",COALESCE(u.username,'') AS username
          FROM storefront_reviews r JOIN storefront_orders o ON o.id=r.order_id
          LEFT JOIN app_users u ON u.entity_uuid=r.owner_user_uuid
          WHERE NOT r.hidden AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) item WHERE item->>'productId'=$1)
          ORDER BY r.created_at DESC LIMIT 50`, [pid])).rows;
        const countRow = (await pool.query(`SELECT count(*)::int AS total,COALESCE(round(avg(r.rating)::numeric,2),0)::text AS average,count(*) FILTER (WHERE r.rating>=4)::int AS good,jsonb_build_object('1',count(*) FILTER (WHERE r.rating=1),'2',count(*) FILTER (WHERE r.rating=2),'3',count(*) FILTER (WHERE r.rating=3),'4',count(*) FILTER (WHERE r.rating=4),'5',count(*) FILTER (WHERE r.rating=5)) AS distribution
          FROM storefront_reviews r JOIN storefront_orders o ON o.id=r.order_id
          WHERE NOT r.hidden AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) item WHERE item->>'productId'=$1)`, [pid])).rows[0];
        reviewsMap.set(pid, {
          summary: {
            total: countRow?.total || 0,
            average: countRow?.average || '0',
            distribution: countRow?.distribution || { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
            goodRate: countRow?.total ? Math.round(countRow.good * 100 / countRow.total) : 0,
          },
          items: reviewRows.map(r => ({
            id: r.id,
            rating: r.rating,
            content: r.content,
            reply: r.reply,
            repliedAt: r.repliedAt,
            createdAt: r.createdAt,
            author: r.username ? (r.username.length > 2 ? r.username[0] + '***' + r.username.slice(-1) : r.username[0] + '***') : 'Verified Buyer',
            isVerifiedBuyer: true,
          })),
        });
      } catch (_) {
        reviewsMap.set(pid, { summary: { total: 0, average: '0', distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, goodRate: 0 }, items: [] });
      }
    }

    // 适配配件模块数据绑定 (严格从 fits 适配关系表查询真实匹配的启用配件，禁止假值)
    const accessoriesMap = new Map();
    const accessoryPids = [...new Set(accessoryBlocks.map(b => contextProductId || b.bindings?.productId).filter(Boolean))];
    for (const pid of accessoryPids) {
      try {
        const accRows = (await pool.query(`SELECT p.id::text AS id,p.name,p.kind,l.published,l.slug,COALESCE(price.rows,'[]'::jsonb) AS prices
          FROM fits f JOIN products p ON p.entity_uuid=f.part_product_uuid
          JOIN storefront_listings l ON l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL
          LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('currency',offers.currency,'unitPrice',offers.unit_price,'referencePrice',offers.reference_price) ORDER BY offers.currency) AS rows FROM (SELECT DISTINCT ON (lp.currency) lp.currency,lp.unit_price::text AS unit_price,lp.reference_price::text AS reference_price FROM storefront_effective_listing_prices lp JOIN storefront_listing_skus ls ON ls.listing_id=lp.listing_id AND ls.sku_uuid=lp.sku_uuid JOIN skus s ON s.entity_uuid=ls.sku_uuid AND NOT s.disabled WHERE lp.listing_id=l.id AND lp.published ORDER BY lp.currency,lp.unit_price,lp.sku_uuid) offers) price ON true
          WHERE f.vehicle_product_uuid=(SELECT entity_uuid FROM products WHERE (id::text=$1 OR entity_uuid::text=$1) AND kind='vehicle' LIMIT 1) AND p.kind='part' AND p.status='启用' AND p.deleted_at IS NULL AND l.published->'languages' ? $2
          ORDER BY p.name,p.id LIMIT 30`, [pid, locale])).rows;
        accessoriesMap.set(pid, accRows.map(r => ({
          id: r.id,
          slug: r.slug,
          title: r.published?.languages?.[locale]?.title || r.name,
          image: r.published?.mediaIds?.[0] ? { url: `/api/catalog/products/${encodeURIComponent(r.id)}/images/${encodeURIComponent(r.published.mediaIds[0])}` } : null,
          prices: r.prices || [],
        })));
      } catch (_) {
        accessoriesMap.set(pid, []);
      }
    }

    // 说明书与技术文档数据绑定 (从 asset_links / media_assets 读取真实产品关联文档，禁止假值)
    const manualsMap = new Map();
    const manualPids = [...new Set(manualBlocks.map(b => contextProductId || b.bindings?.productId).filter(Boolean))];
    for (const pid of manualPids) {
      try {
        const docRows = (await pool.query(`SELECT ma.id::text AS id,ma.file_name AS "fileName",ma.label,ma.content_type AS "contentType",ma.size_bytes AS "sizeBytes"
          FROM asset_links al JOIN media_assets ma ON ma.id=al.asset_id
          WHERE (al.target_id=$1 OR al.target_id=(SELECT entity_uuid::text FROM products WHERE (id::text=$1 OR entity_uuid::text=$1) LIMIT 1))
            AND al.target_type IN ('product','part') AND al.role IN ('certificate','drawing','detail','package')
            AND ma.status='启用'
          ORDER BY al.sort_order,ma.created_at DESC LIMIT 20`, [pid])).rows;
        manualsMap.set(pid, docRows.map(m => ({
          id: m.id,
          title: m.label || m.fileName || 'Document',
          fileName: m.fileName || '',
          sizeBytes: Number(m.sizeBytes) || 0,
          format: m.contentType?.includes('pdf') ? 'PDF' : m.fileName?.split('.').pop()?.toUpperCase() || 'DOC',
          downloadUrl: `/api/assets/${encodeURIComponent(m.id)}/file?download=1`,
        })));
      } catch (_) {
        manualsMap.set(pid, []);
      }
    }

    return resolvedBlocks.map(block => {
      if (block.componentKey === 'productGallery') return { ...block, data: { products: (block.bindings?.productIds || []).map(id => map.get(id)?.product).filter(Boolean) } };
      if (block.componentKey === 'specs') {
        const productRef = contextProductId || block.bindings?.productId;
        const product = map.get(productRef);
        const selectedCodes = new Set(block.bindings?.fieldCodes || []);
        let specifications = product ? publicProductSpecifications(product, fieldRows, locale, selectedCodes) : [];
        if (!specifications.length && Array.isArray(block.props?.items) && block.props.items.length) {
          specifications = block.props.items.filter(item => item && (item.label || item.value)).map(item => ({
            code: item.code || '',
            label: item.label || '',
            value: String(item.value || ''),
            unit: item.unit || '',
          }));
        }
        return { ...block, data: { specifications } };
      }
      if (block.componentKey === 'comparison') {
        const compProducts = (block.bindings?.productIds || []).map(id => map.get(id)).filter(Boolean).map(p => ({
          id: p.id,
          slug: p.slug,
          kind: p.kind,
          title: p.title,
          image: p.image,
          prices: p.prices,
          specifications: publicProductSpecifications(p, fieldRows, locale),
        }));
        const labelSet = new Set();
        for (const cp of compProducts) {
          for (const sp of cp.specifications) labelSet.add(sp.label);
        }
        return { ...block, data: { comparison: { products: compProducts, specLabels: Array.from(labelSet) } } };
      }
      if (block.componentKey === 'reviews') {
        const targetPid = contextProductId || block.bindings?.productId;
        const revData = targetPid ? reviewsMap.get(targetPid) : null;
        const limit = Number(block.props?.limit) || 10;
        return {
          ...block,
          data: {
            reviews: {
              summary: revData?.summary || { total: 0, average: '0', distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, goodRate: 0 },
              items: (revData?.items || []).slice(0, limit),
            }
          }
        };
      }
      if (block.componentKey === 'accessories') {
        const targetPid = contextProductId || block.bindings?.productId;
        const accList = targetPid ? (accessoriesMap.get(targetPid) || []) : [];
        const limit = Number(block.props?.limit) || 12;
        return { ...block, data: { accessories: accList.slice(0, limit) } };
      }
      if (block.componentKey === 'manuals') {
        const targetPid = contextProductId || block.bindings?.productId;
        const dbManuals = targetPid ? (manualsMap.get(targetPid) || []) : [];
        const propManuals = (block.props?.items || []).map(item => ({
          id: item.assetId || item.id || `m-${Math.random().toString(36).slice(2, 8)}`,
          title: item.title || item.fileName || 'Document',
          fileName: item.fileName || '',
          sizeBytes: Number(item.sizeBytes) || 0,
          format: item.format || 'PDF',
          downloadUrl: item.downloadUrl || (item.assetId ? `/api/assets/${encodeURIComponent(item.assetId)}/file?download=1` : ''),
        }));
        return { ...block, data: { manuals: [...dbManuals, ...propManuals].slice(0, 20) } };
      }
      if (block.componentKey === 'video') return { ...block, data: { videoUrl: block.props.videoId ? `/api/public/cms-media/${encodeURIComponent(block.props.videoId)}` : '' } };
      return block;
    });
  }
  return {
    async list(query = {}) {
      const filters = [query.type === 'shared_module' || query.type === 'page_template' ? "page_type IN ('shared_module','page_template')" : "page_type IN ('home','product_template','custom')"], values = [];
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
      assertShellDocument(path,input.pageType,document);
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
        const path = old.pageType === 'home' || SITE_SHELL_PATHS.includes(old.path) || old.pageType === 'product_template' && old.path.startsWith('/products/') ? old.path : normalizePath(input.path === undefined ? old.path : input.path);
        assertShellDocument(path,old.pageType,document);
        const after = (await c.query(`UPDATE site_pages SET page_name=$1,path=$2,draft=$3,draft_seo=$4,revision=revision+1,updated_by=$5,updated_at=now() WHERE id=$6 RETURNING ${columns}`, [name, path, JSON.stringify(document), JSON.stringify(seo), currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.save', `site-pages/${id}`, JSON.stringify({ revision: old.rev }), JSON.stringify({ revision: after.revision })]);
        await c.query('COMMIT');
        return {...after,storefrontRevalidate:await refreshCms()};
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') fail('同语言下该页面路径已存在', 409);
        throw error;
      } finally { c.release(); }
    },
    async publish(id, input = {}, reviewActor = null) {
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新页面');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns},revision AS rev FROM site_pages WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.rev !== input.revision) fail('页面草稿已被其他人更新，请重新加载', 409);
        if (!old.draft) fail('请先保存页面草稿');
        const review = old.pageType === 'product_template'
          ? productTemplateReview.requireReviewedRelease(old, reviewActor, input)
          : shellReview.requireReviewedRelease(old,reviewActor,input);
        const document = documentOf(old.draft);
        assertLegalReady(old.path,document,old.draftSeo);
        assertShellDocument(old.path,old.pageType,document);
        if (old.pageType !== 'product_template' && !document.siteShell && !document.blocks.some(block => block.visible !== false)) fail('页面至少需要一个可见组件才能发布');
        await validateAssets(c, document);
        if(review&&old.status==='disabled')await c.query("UPDATE site_pages SET status='active' WHERE id=$1",[id]);
        const next = (await c.query('SELECT COALESCE(max(version),0)+1 AS version FROM site_page_versions WHERE page_id=$1', [id])).rows[0].version;
        await c.query('INSERT INTO site_page_versions(page_id,version,snapshot,seo,label,created_by) VALUES($1,$2,$3,$4,$5,$6)', [id, next, JSON.stringify(document), JSON.stringify(old.draftSeo || {}), old.draftLabel || null, currentActor()]);
        const after = (await c.query(`UPDATE site_pages SET published=$1,published_seo=$2,published_revision=revision+1,published_version=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE id=$5 RETURNING ${columns}`, [JSON.stringify(document), JSON.stringify(old.draftSeo || {}), next, currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.publish', `site-pages/${id}`, JSON.stringify({ publishedVersion: old.publishedVersion, revision: old.rev }), JSON.stringify({ publishedVersion: next, revision: after.revision, ...(review?{review}: {}) })]);
        await c.query('COMMIT');
        return {...after,storefrontRevalidate:await refreshCms()};
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
        if(SITE_SHELL_PATHS.includes(old.path))fail('公共模块历史版本须先恢复为草稿，再完成六项预览发布',409);
        const snapshot = (await c.query('SELECT snapshot,seo,label FROM site_page_versions WHERE page_id=$1 AND version=$2 AND deleted_at IS NULL', [id, version])).rows[0];
        if (!snapshot) fail('历史版本不存在', 404);
        const next = (await c.query('SELECT COALESCE(max(version),0)+1 AS version FROM site_page_versions WHERE page_id=$1', [id])).rows[0].version;
        await c.query('INSERT INTO site_page_versions(page_id,version,snapshot,seo,label,created_by) VALUES($1,$2,$3,$4,$5,$6)', [id, next, JSON.stringify(snapshot.snapshot), JSON.stringify(snapshot.seo || {}), snapshot.label || null, currentActor()]);
        const after = (await c.query(`UPDATE site_pages SET published=$1,published_seo=$2,published_revision=revision+1,published_version=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE id=$5 RETURNING ${columns}`, [JSON.stringify(snapshot.snapshot), JSON.stringify(snapshot.seo || {}), next, currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.rollback', `site-pages/${id}`, JSON.stringify({ publishedVersion: old.publishedVersion }), JSON.stringify({ rolledBackFrom: version, publishedVersion: next })]);
        await c.query('COMMIT');
        return {...after,storefrontRevalidate:await refreshCms()};
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
        assertShellDocument(old.path,old.pageType,document);
        await validateAssets(c, document);
        const after = (await c.query(`UPDATE site_pages SET draft=$1,draft_seo=$2,revision=revision+1,updated_by=$3,updated_at=now() WHERE id=$4 RETURNING ${columns}`, [JSON.stringify(document), JSON.stringify(snap.seo || {}), currentActor(), id])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.page.restore_draft', `site-pages/${id}`, JSON.stringify({ revision: old.rev, draftHasContent: Boolean(old.draft) }), JSON.stringify({ revision: after.revision, restoredFrom: version })]);
        await c.query('COMMIT');
        return {...after,storefrontRevalidate:await refreshCms()};
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
        return {...after,storefrontRevalidate:await refreshCms()};
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
        return {...after,storefrontRevalidate:await refreshCms()};
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
        return {...after,storefrontRevalidate:await refreshCms()};
      } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; } finally { c.release(); }
    },
    async setStatus(id, status) {
      if (!['active', 'disabled'].includes(status)) fail('页面状态无效');
      const old = await row(id);
      if(SITE_SHELL_PATHS.includes(old.path)&&status==='active')fail('公共模块重新启用须经发布审核',409);
      if (old.pageType === 'home' && status === 'disabled') fail('官网首页不能停用');
      const updated=(await pool.query('UPDATE site_pages SET status=$1,revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$3 RETURNING id::text AS id,status', [status, currentActor(), id])).rows[0];
      return {...updated,storefrontRevalidate:await refreshCms()};
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
      const { version = null, draft = false, pageId = '', expectedRevision = null } = options;
      const isHome = normalized === '/';
      // 首页可能为 home 类型且 locale='*' 或对应语言
      const isShell=SITE_SHELL_PATHS.includes(normalized);
      const typeFilter = isShell ? "page_type='shared_module'" : isHome ? "page_type IN ('home','custom')" : "page_type='custom'";
      const localeFilter = isHome ? "(locale=$1 OR locale='*')" : "locale=$1";

      // 草稿预览：仅后台装修工作区使用（路由层已校验管理员身份）
      if (draft) {
        const d = (await pool.query(`SELECT id::text AS id,page_name AS "name",draft,draft_seo AS seo FROM site_pages WHERE ${typeFilter} AND ${localeFilter} AND path=$2 AND status='active' ORDER BY (locale=$1) DESC, updated_at DESC LIMIT 1`, [locale, normalized])).rows[0];
        if (!d) return null;
        const blocks = Array.isArray(d.draft?.blocks) ? d.draft.blocks : [];
        return { id: d.id, name: d.name, locale, path: normalized, seo: d.seo || {}, blocks: await enrich(blocks, locale), ...(isShell?{siteShell:d.draft?.siteShell||null}:{}), preview: 'draft' };
      }
      // 历史版本预览：读取该版本快照，不动当前线上内容
      if (version) {
        const v = (await pool.query(`SELECT v.version, v.snapshot, v.seo, p.id::text AS id, p.page_name AS "name" FROM site_page_versions v JOIN site_pages p ON p.id=v.page_id WHERE ${typeFilter.replace(/page_type/g, 'p.page_type')} AND ${localeFilter.replace(/locale/g, 'p.locale')} AND p.path=$2 AND p.status='active' AND v.version=$3 AND v.deleted_at IS NULL ORDER BY (p.locale=$1) DESC LIMIT 1`, [locale, normalized, version])).rows[0];
        if (!v) return null;
        const snapshot = v.snapshot || {};
        const blocks = Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
        return { id: v.id, name: v.name, locale, path: normalized, seo: v.seo || {}, blocks: await enrich(blocks, locale), ...(isShell?{siteShell:snapshot.siteShell||null}:{}), preview: `v${v.version}` };
      }
      const data = (await pool.query(`SELECT id::text AS id,page_name AS "name",published,published_seo AS seo FROM site_pages WHERE ${typeFilter} AND ${localeFilter} AND path=$2 AND status='active' AND published IS NOT NULL ORDER BY (locale=$1) DESC, updated_at DESC LIMIT 1`, [locale, normalized])).rows[0];
      if (!data) return null;
      return { id: data.id, name: data.name, locale, path: normalized, seo: data.seo || {}, blocks: await enrich(Array.isArray(data.published?.blocks) ? data.published.blocks : [], locale), ...(isShell?{siteShell:data.published?.siteShell||null}:{}) };
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
        performance: performanceOf(document.modules?.performance),
        ...(await loadDesignData(productId, locale, performanceOf(document.modules?.performance))),
        catalogLayout: document.catalogLayout || null,
        blocks: await enrich(Array.isArray(document.blocks) ? document.blocks : [], locale, productId),
        preview: draft ? 'draft' : version ? `v${version}` : undefined,
      });
      // 草稿预览：仅后台装修工作区使用（路由层已校验管理员身份）
      if (draft) {
        const data = pageId
          ? (await pool.query("SELECT id::text AS id,page_name AS \"name\",draft AS document,draft_seo AS seo,(path=$3) AS \"isProductSpecific\" FROM site_pages WHERE id=$1 AND locale=$2 AND page_type='product_template' AND status='active' AND draft IS NOT NULL AND revision=$4", [pageId, locale, productPath, expectedRevision])).rows[0]
          : (await pool.query("SELECT id::text AS id,page_name AS \"name\",draft AS document,draft_seo AS seo,(path=$2) AS \"isProductSpecific\" FROM site_pages WHERE page_type='product_template' AND locale=$1 AND status='active' AND draft IS NOT NULL AND (path=$2 OR path NOT LIKE '/products/%') ORDER BY (path=$2) DESC,updated_at DESC LIMIT 1", [locale, productPath])).rows[0];
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
    async listTemplates(query = {}) {
      const targetType = query.targetType || '';
      const rows = (await pool.query(
        `SELECT id::text AS id, page_name AS "name", locale, path, draft, published, updated_by AS "updatedBy", updated_at AS "updatedAt"
         FROM site_pages WHERE page_type='page_template' AND status='active' ORDER BY updated_at DESC LIMIT 100`
      )).rows;
      // 计算每个模板的关联引用页面
      const refRows = (await pool.query(
        `SELECT id::text AS id, page_name AS "name", page_type AS "pageType", locale, path,
                COALESCE(draft->'templateMeta'->>'templateId', published->'templateMeta'->>'templateId') AS "templateId"
         FROM site_pages WHERE page_type IN ('home','custom','product_template')
           AND (draft->'templateMeta'->>'templateId' IS NOT NULL OR published->'templateMeta'->>'templateId' IS NOT NULL)`
      )).rows;
      const refMap = new Map();
      for (const r of refRows) {
        if (!r.templateId) continue;
        if (!refMap.has(r.templateId)) refMap.set(r.templateId, []);
        refMap.get(r.templateId).push({ id: r.id, name: r.name, pageType: r.pageType, locale: r.locale, path: r.path });
      }
      const builtins = DEFAULT_PAGE_TEMPLATES
        .filter(t => !targetType || t.targetType === targetType)
        .map(t => ({
          id: t.id, builtin: true, name: t.name, targetType: t.targetType, locale: t.locale,
          blockCount: t.document.blocks.length,
          refCount: (refMap.get(t.id) || []).length,
          referencedBy: refMap.get(t.id) || [],
        }));
      const custom = rows
        .map(r => {
          const doc = r.draft || r.published || {};
          const tType = doc.templateMeta?.targetType || (r.path?.startsWith('/tpl/product') ? 'product_template' : 'custom');
          return {
            id: r.id, builtin: false, name: r.name, targetType: tType, locale: r.locale,
            blockCount: Array.isArray(doc.blocks) ? doc.blocks.length : 0,
            refCount: (refMap.get(r.id) || []).length,
            referencedBy: refMap.get(r.id) || [],
            updatedBy: r.updatedBy, updatedAt: r.updatedAt,
          };
        })
        .filter(t => !targetType || t.targetType === targetType);
      return [...builtins, ...custom];
    },
    async saveAsTemplate(input = {}) {
      const name = text(input.name, 120, true);
      const targetType = ['custom', 'product_template', 'home'].includes(input.targetType) ? input.targetType : 'custom';
      const locale = LANGUAGES.includes(input.locale) ? input.locale : 'de';
      let sourceDoc = input.document;
      if (!sourceDoc && isUuidv7(input.sourcePageId)) {
        const src = await row(input.sourcePageId);
        sourceDoc = src.draft || src.published;
      }
      if (!sourceDoc) fail('缺少可用于保存为模板的页面内容');
      const doc = documentOf(sourceDoc);
      doc.templateMeta = { templateId: '', templateName: name, targetType, appliedAt: new Date().toISOString() };
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await validateAssets(c, doc);
        const tplSlug = `tpl-${uuidv7().slice(-12)}`;
        const tplPath = normalizePath(`/tpl/${targetType === 'product_template' ? 'product' : 'page'}/${tplSlug}`);
        const created = (await c.query(
          `INSERT INTO site_pages(slug,page_type,locale,path,page_name,status,draft,published,revision,published_revision,published_version,updated_by,updated_at)
           VALUES($1,'page_template',$2,$3,$4,'active',$5,$5,1,1,1,$6,now()) RETURNING ${columns}`,
          [tplSlug, locale, tplPath, name, JSON.stringify(doc), currentActor()]
        )).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.template.create', `site-pages/${created.id}`, null, JSON.stringify({ name, targetType, locale })]);
        await c.query('COMMIT');
        return { ...created, targetType };
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { c.release(); }
    },
    async applyTemplate(pageId, input = {}) {
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('请先加载最新页面');
      const templateId = text(input.templateId, 120, true);
      let tplName = '', tplDoc = null, tplTargetType = 'custom';
      if (templateId.startsWith('builtin:')) {
        const found = DEFAULT_PAGE_TEMPLATES.find(t => t.id === templateId);
        if (!found) fail('内置模板不存在', 404);
        tplName = found.name; tplDoc = found.document; tplTargetType = found.targetType;
      } else {
        const tpl = await row(templateId);
        if (tpl.pageType !== 'page_template') fail('目标不是有效模板', 400);
        tplName = tpl.name; tplDoc = tpl.draft || tpl.published; tplTargetType = tplDoc?.templateMeta?.targetType || 'custom';
      }
      if (!tplDoc) fail('模板内容为空');
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const old = (await c.query(`SELECT ${columns},revision AS rev FROM site_pages WHERE id=$1 FOR UPDATE`, [pageId])).rows[0];
        if (!old) fail('页面不存在', 404);
        if (old.rev !== input.revision) fail('页面草稿已被其他人更新，请重新加载', 409);
        const currentDoc = old.draft || old.published || { blocks: [] };
        let nextBlocks = cloneBlocksPreservingRefs(tplDoc.blocks);
        // 若目标页面是商品模板，保留固定业务区：productLayout、modules、catalogLayout 与原 specs 绑定
        let nextDoc;
        if (old.pageType === 'product_template') {
          const existingSpecs = (currentDoc.blocks || []).find(b => b.componentKey === 'specs');
          const contentBlocks = nextBlocks.filter(b => b.componentKey !== 'specs');
          if (existingSpecs) contentBlocks.push(existingSpecs);
          else {
            const tplSpecs = nextBlocks.find(b => b.componentKey === 'specs');
            if (tplSpecs) contentBlocks.push(tplSpecs);
          }
          nextDoc = documentOf({
            blocks: contentBlocks,
            productLayout: currentDoc.productLayout || tplDoc.productLayout,
            modules: currentDoc.modules || tplDoc.modules,
            catalogLayout: currentDoc.catalogLayout || tplDoc.catalogLayout,
            templateMeta: { templateId, templateName: tplName, targetType: tplTargetType, appliedAt: new Date().toISOString() },
          });
        } else {
          nextDoc = documentOf({
            blocks: nextBlocks,
            templateMeta: { templateId, templateName: tplName, targetType: tplTargetType, appliedAt: new Date().toISOString() },
          });
        }
        await validateAssets(c, nextDoc);
        const after = (await c.query(
          `UPDATE site_pages SET draft=$1,revision=revision+1,updated_by=$2,updated_at=now() WHERE id=$3 RETURNING ${columns}`,
          [JSON.stringify(nextDoc), currentActor(), pageId]
        )).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'cms.template.apply', `site-pages/${pageId}`, JSON.stringify({ revision: old.rev }), JSON.stringify({ templateId, templateName: tplName, revision: after.revision })]);
        await c.query('COMMIT');
        return after;
      } catch (error) {
        await c.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { c.release(); }
    },
    async deleteTemplate(templateId) {
      if (String(templateId).startsWith('builtin:')) fail('系统默认模板不可删除', 400);
      const tpl = await row(templateId);
      if (tpl.pageType !== 'page_template') fail('目标不是有效模板', 400);
      const refs = (await pool.query(
        `SELECT count(*)::int AS n FROM site_pages WHERE page_type IN ('home','custom','product_template') AND (draft->'templateMeta'->>'templateId'=$1 OR published->'templateMeta'->>'templateId'=$1)`,
        [templateId]
      )).rows[0].n;
      if (refs > 0) fail(`仍有 ${refs} 个页面正在使用该模板，请先解除关联`, 409);
      await pool.query('DELETE FROM site_pages WHERE id=$1 AND page_type=\'page_template\'', [templateId]);
      return { ok: true };
    },
    async ensureProductOverride(input = {}) {
      const productId = text(input.productId, 80, true);
      const locale = LANGUAGES.includes(input.locale) ? input.locale : 'de';
      const overridePath = normalizePath(`/products/${productId}`);
      const existing = (await pool.query(
        `SELECT ${columns} FROM site_pages WHERE page_type='product_template' AND locale=$1 AND path=$2`,
        [locale, overridePath]
      )).rows[0];
      if (existing) return existing;
      // 基于该语言通用商品模板或默认商品模板初始化
      const baseTpl = (await pool.query(
        `SELECT draft, published FROM site_pages WHERE page_type='product_template' AND locale=$1 AND status='active' AND path NOT LIKE '/products/%' ORDER BY updated_at DESC LIMIT 1`,
        [locale]
      )).rows[0];
      const baseDoc = baseTpl?.draft || baseTpl?.published || DEFAULT_PAGE_TEMPLATES[1].document;
      const doc = documentOf({
        ...baseDoc,
        blocks: cloneBlocksPreservingRefs(baseDoc.blocks || []),
      });
      const name = text(input.name, 120) || `商品独立覆盖 (${productId})`;
      const slug = `cms-${locale}-prod-${productId.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.slice(0, 100);
      const created = (await pool.query(
        `INSERT INTO site_pages(slug,page_type,locale,path,page_name,status,draft,draft_seo,revision,updated_by,updated_at)
         VALUES($1,'product_template',$2,$3,$4,'active',$5,$6,1,$7,now()) RETURNING ${columns}`,
        [slug, locale, overridePath, name, JSON.stringify(doc), JSON.stringify({ title: '', description: '' }), currentActor()]
      )).rows[0];
      return created;
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
  route('POST', '/api/cms/pages/:id/release-review', async req => {
    const page=await cms.get(req.params.id);
    if(page.revision!==req.body?.revision)fail('草稿已修改，请重新加载',409);
    return shellReview.start(page,req.user.id);
  });
  route('POST', '/api/cms/pages/:id/product-template-review', async req => {
    const page = await cms.get(req.params.id);
    if (page.revision !== req.body?.revision) fail('草稿已修改，请重新加载', 409);
    return productTemplateReview.start(page, req.user.id, {
      previewScope: req.body?.previewScope,
      productId: req.body?.productId,
    });
  });
  route('GET', '/api/cms/product-template-review-preview', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    const ticket = productTemplateReview.read(req.query.token);
    const locale = String(req.query.locale || '');
    const productId = String(req.query.productId || '');
    if (locale !== ticket.locale || (ticket.previewScope === 'product' && productId !== ticket.productId) || (ticket.previewScope === 'listing' && productId)) fail('预览凭证与当前页面不匹配', 403);
    const page = await cms.get(ticket.id);
    const template = ticket.draft
      ? await cms.publicProductTemplate(locale, productId, { draft: true, pageId: ticket.id, expectedRevision: ticket.revision })
      : await cms.publicProductTemplate(locale, productId);
    if (ticket.draft && !template) fail('草稿已修改，请重新开始预览', 409);
    const receipt = productTemplateReview.rendered(ticket, page);
    return { template, receipt, session: ticket.session, locale, device: ticket.device, draft: ticket.draft };
  }, true);
  route('GET', '/api/cms/shell-review-preview', async (req,reply) => {
    reply.header('Cache-Control','no-store');
    reply.header('X-Robots-Tag','noindex, nofollow');
    const ticket=shellReview.read(req.query.token);
    const page=await cms.get(ticket.id);
    const receipt=shellReview.rendered(ticket,page);
    const source=ticket.locale===page.locale?{siteShell:page.draft.siteShell}:await cms.publicPage(ticket.locale,page.path);
    return {locale:ticket.locale,device:ticket.device,kind:page.draft.siteShell.kind,config:source?.siteShell||null,draft:ticket.locale===page.locale,session:ticket.session,receipt};
  },true);
  route('POST', '/api/cms/pages/:id/review-publish', req => {if(!req.user?.id)fail('管理员身份无效',403);return cms.publish(req.params.id,req.body||{},req.user.id)});
  route('GET', '/api/cms/pages/:id/versions', req => cms.versions(req.params.id));
  route('POST', '/api/cms/pages/:id/rollback', req => cms.rollback(req.params.id, req.body || {}));
  route('POST', '/api/cms/pages/:id/versions/:version/restore-draft', req => cms.restoreDraft(req.params.id, { version: req.params.version, revision: Number(req.body?.revision) }));
  route('DELETE', '/api/cms/pages/:id/versions/:version', req => cms.deleteVersion(req.params.id, { version: req.params.version }));
  route('PATCH', '/api/cms/pages/:id/name', req => cms.rename(req.params.id, { name: req.body?.name }));
  route('PATCH', '/api/cms/pages/:id/labels', req => cms.setLabels(req.params.id, req.body || {}));
  route('PATCH', '/api/cms/pages/:id/versions/:version/label', req => cms.setVersionLabel(req.params.id, { version: req.params.version, label: req.body?.label }));
  route('PATCH', '/api/cms/pages/:id/status', req => cms.setStatus(req.params.id, req.body?.status));
  route('DELETE', '/api/cms/pages/:id', req => cms.remove(req.params.id));
  route('GET', '/api/cms/templates', req => cms.listTemplates({ targetType: req.query.targetType || '' }));
  route('POST', '/api/cms/templates', (req, reply) => cms.saveAsTemplate(req.body || {}).then(data => reply.code(201).send(data)));
  route('POST', '/api/cms/pages/:id/apply-template', req => cms.applyTemplate(req.params.id, req.body || {}));
  route('DELETE', '/api/cms/templates/:id', req => cms.deleteTemplate(req.params.id));
  route('POST', '/api/cms/product-override', req => cms.ensureProductOverride(req.body || {}));
  route('GET', '/api/cms/pages/public', (req, reply) => {
    const draft = String(req.query.draft || '') === '1';
    const version = Number(req.query.version || 0) || null;
    // 草稿与历史版本预览只给管理员；公开路由不能向匿名访客透出未发布内容或缓存历史快照
    if (draft || version) {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可预览草稿或历史版本' });
      reply.header('Cache-Control', 'no-store');
    }
    return cms.publicPage(String(req.query.locale || ''), String(req.query.path || ''), { version, draft });
  }, true);
  route('GET', '/api/cms/pages/sitemap', () => cms.publicSitemap(), true);
  route('GET', '/api/cms/product-template', (req, reply) => {
    const draft = String(req.query.draft || '') === '1';
    const version = Number(req.query.version || 0) || null;
    // 草稿与历史版本预览只给管理员；公开路由不能向匿名访客透出未发布内容或缓存历史快照
    if (draft || version) {
      if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可预览草稿或历史版本' });
      reply.header('Cache-Control', 'no-store');
    }
    return cms.publicProductTemplate(String(req.query.locale || ''), String(req.query.productId || ''), { draft, version });
  }, true);
}

module.exports = { createCmsStore, registerCmsRoutes, publicProductSpecifications, siteShellOf, assertShellDocument, performanceOf, performanceSpecifications, catalogLayoutOf };
