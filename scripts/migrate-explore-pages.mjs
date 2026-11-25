#!/usr/bin/env node
// 把 V1.0 正式站（www.alsvidbike.com）的 /explore/* 页面正文迁成 V2.0 CMS 页面。
//
// 设计要点：
// 1) 默认只抓取 + 生成 JSON，绝不写库。加 --apply 才调 8089 管理接口创建/更新草稿。
// 2) 迁移目标是「保住原 URL + 原 title/description + 原正文」，不是重定向。
//    所以路径固定为 /explore/<slug>，语言各自一条页面（zh/en/de 是独立页面，不做翻译合并）。
// 3) 正文用 article 长文区块承载；正式站图片先记进 imageSource，--apply 时尝试按文件名
//    在素材库里找同 id 的图片，找不到就留空并报到 unresolvedImages，不静默丢图。
//
// 用法：
//   node scripts/migrate-explore-pages.mjs                 # 只抓取，生成 JSON
//   node scripts/migrate-explore-pages.mjs --only ct,fc    # 只处理指定 slug
//   ALSVID_ADMIN_USER=... ALSVID_ADMIN_PASS=... \
//     node scripts/migrate-explore-pages.mjs --apply       # 写入 8089（默认只建草稿不发布）
//   ... --apply --publish                                  # 连同发布一起做
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PRODUCTION = 'https://www.alsvidbike.com';
const LOCALES = ['zh', 'en', 'de'];
// 正式站 sitemap 里 /explore/* 的全部 slug（24 个），三语共 72 条 URL。
const SLUGS = [
  'about-design', 'about-engineering', 'about-manufacturing', 'about-news', 'about-story',
  'accessory-basket', 'accessory-cup-holder', 'accessory-light', 'accessory-mudguard', 'accessory-parts', 'accessory-rack',
  'ct', 'fc', 'fc1', 'fc2', 'ft', 'gt', 'l1', 'l7',
  'technology-assist', 'technology-battery', 'technology-folding', 'technology-material', 'technology-safety',
];
// 这 3 个是车型详情，本应落在商品详情页；先按月迁成 CMS 页面保住 URL，另行评估是否并入 /e-bikes。
const MODEL_SLUGS = new Set(['fc1', 'fc2', 'l7']);

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const valueOf = name => {
  // 同时支持 --only=a,b 和 --only a,b 两种写法
  const inline = args.find(arg => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : '';
};
const BASE = valueOf('base') || 'http://127.0.0.1:8089';
const OUT = valueOf('out') || 'apps/admin-api/migrations/data/explore-pages.json';
const only = valueOf('only') ? new Set(valueOf('only').split(',').map(v => v.trim()).filter(Boolean)) : null;
const apply = flag('apply');
const publish = flag('publish');

const decode = input => input
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·');
const cleanText = input => decode(String(input || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'ALSVID-V2-migration/1.0' }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise(resolve => setTimeout(resolve, 700 * attempt));
    return fetchText(url, attempt + 1);
  }
}

// 从正式站 HTML 里抽正文。正式站把内容放在 <article class="...detailArticle"> 里，
// 导航在同一个 <main> 内，所以必须只取 article，不能用 <main>。
function extract(html) {
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '');
  const description = decode(html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/)?.[1] || '');
  const article = html.match(/<article[^>]*class="[^"]*detailArticle[^"]*"[^>]*>([\s\S]*?)<\/article>/)?.[1] || '';
  if (!article) return { title, description, empty: true };

  // detailIntro 内部还有一层 <div>，用非贪婪 </div> 会提前截断，所以直接从 article 里
  // 取「正文 section 之前」的部分做头部解析。
  const bodyStart = article.search(/<section[^>]*class="[^"]*detailBody[^"]*"/);
  const head = bodyStart > 0 ? article.slice(0, bodyStart) : article;
  const intro = head;
  const eyebrow = cleanText(intro.match(/<p[^>]*class="[^"]*eyebrow[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] || '');
  const h1 = cleanText(intro.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '');
  const lead = cleanText(intro.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1] || '');
  const heroTag = head.match(/<img\b[^>]*>/)?.[0] || '';
  const heroImage = heroTag
    ? { src: decode(heroTag.match(/\bsrc="([^"]+)"/)?.[1] || ''), alt: decode(heroTag.match(/\balt="([^"]*)"/)?.[1] || '') }
    : null;
  const body = article.match(/<section[^>]*class="[^"]*detailBody[^"]*"[^>]*>([\s\S]*?)<\/section>/)?.[1] || '';

  // 正文按 h2 切段；h2 之前的散段落归到第一段（无标题）。
  const sections = [];
  const pattern = /<(h2|p|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let current = { heading: '', paragraphs: [] };
  let match;
  while ((match = pattern.exec(body))) {
    // match[0] 是整段匹配，三个捕获组从 index 1 开始，解构必须空出第一位
    const [, tag, attrs, inner] = match;
    if (tag.toLowerCase() === 'h2') {
      if (current.heading || current.paragraphs.length) sections.push(current);
      current = { heading: cleanText(inner), paragraphs: [] };
      continue;
    }
    if (tag.toLowerCase() === 'a') {
      // 返回首页 / 进入车主服务 这类导航链接不进正文，单独收集成 CTA 候选
      if (/detailBack/.test(attrs)) continue;
      const text = cleanText(inner);
      const href = decode(attrs.match(/href="([^"]*)"/)?.[1] || '');
      if (text && href && /btn/.test(attrs)) current.cta = { label: text, href };
      continue;
    }
    const text = cleanText(inner);
    if (text) current.paragraphs.push(text);
  }
  if (current.heading || current.paragraphs.length) sections.push(current);

  return {
    title, description, eyebrow, h1, lead,
    hero: heroImage && heroImage.src ? heroImage : null,
    sections: sections.filter(section => section.heading || section.paragraphs.length),
    empty: false,
  };
}

// CMS 页面的 title template 会补 " · ALSVID"，所以迁移时先去掉原文里的品牌后缀，
// 否则渲染成「电池设计 | ALSVID · ALSVID」。CMS 里存干净标题，展示由模板统一负责。
const BRAND_SUFFIX = /\s*[|·—–-]\s*ALSVID\s*$/i;
const stripBrand = value => String(value || '').replace(BRAND_SUFFIX, '').trim();

function buildPage(locale, slug, doc) {
  const sections = doc.sections.map(section => ({
    heading: section.heading || '',
    body: section.paragraphs.join('\n'),
    imageId: '',
    imageAlt: '',
  }));
  const blocks = [{
    id: `b-explore-${slug}`.slice(0, 80),
    componentKey: 'article',
    visible: true,
    props: {
      heading: doc.h1 || doc.title,
      intro: doc.lead || doc.eyebrow,
      // 主图要先映射成素材库 id 才会显示；映射不上就留空，不塞外部 URL 绕过素材体系
      imageId: doc.heroAssetId || '',
      imageAlt: doc.hero?.alt || '',
      sections,
    },
    bindings: {},
  }];
  const cta = doc.sections.find(section => section.cta)?.cta;
  if (cta) blocks.push({ id: `b-explore-${slug}-cta`.slice(0, 80), componentKey: 'cta', visible: true, props: { title: '', text: '', buttonLabel: cta.label, buttonHref: cta.href }, bindings: {} });
  return {
    locale,
    path: `/explore/${slug}`,
    pageType: 'custom',
    name: doc.h1 || doc.title || slug,
    seo: { title: stripBrand(doc.title) || doc.title, description: doc.description },
    blocks,
    // 迁移审计信息，写入时不传给接口
    meta: { sourceUrl: `${PRODUCTION}/${locale}/explore/${slug}`, slug, isModelPage: MODEL_SLUGS.has(slug), heroImageSource: doc.hero?.src || '', heroImageAlt: doc.hero?.alt || '' },
  };
}

// 一个进程只登录一次，后续所有请求复用同一个 cookie jar
let adminClient = null;
async function admin() {
  if (adminClient) return adminClient;
  const user = process.env.ALSVID_ADMIN_USER, pass = process.env.ALSVID_ADMIN_PASS;
  if (!user || !pass) throw new Error('--apply 需要 ALSVID_ADMIN_USER / ALSVID_ADMIN_PASS');
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = response => {
    for (const cookie of response.headers.getSetCookie?.() || []) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const call = async (method, url, body) => {
    const response = await fetch(BASE + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { cookie: cookieHeader() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    absorb(response);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${url} → ${response.status} ${payload?.error || ''}`.trim());
    return payload;
  };
  await call('POST', '/api/auth/login', { username: user, password: pass });
  adminClient = { call };
  return adminClient;
}

// 把正式站的图片路径映射到素材库 id：按文件名在 /api/assets 里找。
// 找不到就返回 ''，页面照常创建但主图为空，并计入 unresolvedImages 让人工补。
const imageCache = new Map();
async function resolveHeroAsset(source) {
  if (!source) return '';
  if (imageCache.has(source)) return imageCache.get(source);
  const basename = source.split('/').pop().replace(/\.[^.]+$/, '');
  let id = '';
  try {
    const { call } = await admin();
    const payload = await call('GET', `/api/assets?search=${encodeURIComponent(basename)}&page=1&pageSize=50`);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const hit = items.find(item => {
      const haystack = [item.originalName, item.name, item.fileName, item.storageKey, item.url].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(basename.toLowerCase());
    });
    id = hit?.id || '';
  } catch (error) {
    process.stdout.write(`  素材查找失败 ${basename}：${error.message}\n`);
  }
  imageCache.set(source, id);
  return id;
}

async function applyPage(page) {
  const { call } = await admin();
  const exists = await call('GET', `/api/cms/pages?locale=${page.locale}&path=${encodeURIComponent(page.path)}&type=custom`)
    .then(payload => (Array.isArray(payload?.items) ? payload.items : []).find(item => item.path === page.path && item.locale === page.locale) || null)
    .catch(() => null);

  let pageId = exists?.id;
  if (!pageId) {
    const created = await call('POST', '/api/cms/pages', {
      pageType: page.pageType, locale: page.locale, path: page.path, name: page.name, seo: page.seo,
      draft: { blocks: page.blocks },
    });
    pageId = created?.id;
  } else {
    await call('PUT', `/api/cms/pages/${pageId}/draft`, { blocks: page.blocks, seo: page.seo });
  }
  if (publish && pageId) await call('POST', `/api/cms/pages/${pageId}/publish`, {});
  return { pageId, created: !exists?.id };
}

const slugs = only ? SLUGS.filter(slug => only.has(slug)) : SLUGS;
const pages = [], failures = [], unresolvedImages = [];
for (const locale of LOCALES) {
  for (const slug of slugs) {
    const url = `${PRODUCTION}/${locale}/explore/${slug}`;
    try {
      const doc = extract(await fetchText(url));
      if (doc.empty) { failures.push({ url, reason: '未找到 detailArticle 正文容器' }); continue; }
      if (apply) doc.heroAssetId = await resolveHeroAsset(doc.hero?.src);
      const page = buildPage(locale, slug, doc);
      pages.push(page);
      if (page.meta.heroImageSource && !page.blocks[0].props.imageId) unresolvedImages.push({ url, heroImageSource: page.meta.heroImageSource, heroImageAlt: page.meta.heroImageAlt });
      const chars = page.blocks[0].props.sections.reduce((sum, section) => sum + section.body.length, 0);
      process.stdout.write(`${locale.padEnd(3)} /explore/${slug.padEnd(24)} ${String(page.blocks[0].props.sections.length).padStart(2)} 段 ${String(chars).padStart(5)} 字  ${page.name.slice(0, 26)}\n`);
    } catch (error) {
      failures.push({ url, reason: error.message });
    }
  }
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), production: PRODUCTION, slugs, locales: LOCALES, pages, failures, unresolvedImages }, null, 2)}\n`);
process.stdout.write(`\n已生成 ${pages.length} 条页面定义 → ${OUT}\n`);
if (failures.length) process.stdout.write(`抓取失败 ${failures.length} 条：\n${failures.map(item => `  - ${item.url} ${item.reason}`).join('\n')}\n`);
if (unresolvedImages.length) process.stdout.write(`待映射图片 ${unresolvedImages.length} 张（正式站原图，素材库尚无对应 id）\n`);

if (apply) {
  process.stdout.write('\n开始写入 8089…\n');
  const results = [], writeFailures = [];
  for (const page of pages) {
    try {
      const result = await applyPage(page);
      results.push({ ...result, path: page.path, locale: page.locale });
      process.stdout.write(`  ${result.created ? '新建' : '更新'} ${page.locale} ${page.path}${publish ? '（已发布）' : '（草稿）'}\n`);
    } catch (error) {
      writeFailures.push({ url: page.meta.sourceUrl, reason: error.message });
      process.stdout.write(`  失败 ${page.locale} ${page.path}：${error.message}\n`);
    }
  }
  process.stdout.write(`写入完成：成功 ${results.length}，失败 ${writeFailures.length}\n`);
  if (writeFailures.length) process.exitCode = 1;
}
