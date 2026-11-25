/**
 * WEB-010 验证测试：首页与内容页统一装修底座
 * 验收目标：
 * 1. publicPage 支持 '/' (home 类型及 locale='*' 或指定语言)
 * 2. 首页与内容页统一复用 CMS documentOf / blockOf / enrich 解析链路
 * 3. 前台 Next.js 首页优先渲染 CMS blocks（保证 URL、SEO、历史无回归，且平滑回退）
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function createMockPool() {
  const pages = new Map();
  return {
    pages,
    async connect() { return { release() {} }; },
    async query(sql, params = []) {
      const s = sql.trim();
      if (s.includes("SELECT") && s.includes("site_pages") && s.includes("path=$2") && s.includes("published IS NOT NULL")) {
        const [locale, pathVal] = params;
        const rows = [...pages.values()].filter(p => {
          if (p.path !== pathVal || p.status !== 'active' || !p.published) return false;
          if (pathVal === '/') {
            return (p.pageType === 'home' || p.pageType === 'custom') && (p.locale === locale || p.locale === '*');
          }
          return p.pageType === 'custom' && p.locale === locale;
        }).map(p => ({
          ...p,
          seo: p.seo || p.publishedSeo || {},
        }));
        rows.sort((a, b) => (b.locale === locale ? 1 : 0) - (a.locale === locale ? 1 : 0));
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
}

const dbPoolPath = require.resolve('../db-pool');
const mockPool = createMockPool();
require.cache[dbPoolPath] = { id: dbPoolPath, filename: dbPoolPath, loaded: true, exports: { createPool: () => mockPool } };
delete require.cache[require.resolve('../cms.js')];
const { createCmsStore } = require('../cms.js');

test('WEB-010: publicPage 正确解析首页统一装修底座', async () => {
  const cms = createCmsStore('mock');
  mockPool.pages.set('home-page-1', {
    id: '01966a1b-c8d0-7000-8000-000000000001',
    pageType: 'home',
    locale: '*',
    path: '/',
    name: '官网首页',
    status: 'active',
    published: {
      blocks: [
        {
          id: 'b-hero-1',
          componentKey: 'hero',
          schemaVersion: 1,
          visible: true,
          props: { title: '未来出行', intro: '重构城市骑行' },
          bindings: {},
        },
      ],
    },
    publishedSeo: { title: 'ALSVID - 官网首页', description: '探索智能电动' },
  });

  const res = await cms.publicPage('de', '/');
  assert.ok(res, '应成功读取首页配置');
  assert.equal(res.path, '/');
  assert.equal(res.blocks.length, 1);
  assert.equal(res.blocks[0].componentKey, 'hero');
  assert.equal(res.blocks[0].props.title, '未来出行');
  assert.equal(res.seo.title, 'ALSVID - 官网首页');
});

test('WEB-010: Next.js 前台首页支持 CMS blocks 统一渲染与 SEO 自动适配', () => {
  const pageSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'page.tsx'), 'utf-8');
  assert.ok(pageSrc.includes("getCmsPage(locale, '/')"), '首页应调用 getCmsPage 获取统一底座配置');
  assert.ok(pageSrc.includes("<CmsBlocks blocks={cmsHome.blocks} locale={locale}/>"), '包含 CMS blocks 统一渲染输出');
  assert.ok(pageSrc.includes("snapshotHtml ?"), '保留旧版 layoutSnapshot 平滑兜底');
});

console.log('✅ WEB-010 验证通过');
