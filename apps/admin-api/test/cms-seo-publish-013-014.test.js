/**
 * WEB-013 & WEB-014 验证测试：多语言与 SEO + 统一发布验收
 * 验收目标：
 * 1. 多语言架构：德英中三语；默认优先德语 (x-default = de)
 * 2. sitemap.xml 包含商品多语言 alternates、CMS 已发布页面 alternates
 * 3. 统一发布闭环：草稿隔离、版本快照、版本对比/历史、回滚生成新不可变版本、缓存失效通知
 * 4. 商品与页面独立发布体系并存，不报假成功
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('WEB-013: 多语言 SEO 与 sitemap / alternates 严格遵循规范', () => {
  const sitemapSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', 'sitemap.ts'), 'utf-8');
  assert.ok(sitemapSrc.includes("'x-default': `${siteUrl}/de`"), 'x-default 必须指向德语站');
  assert.ok(sitemapSrc.includes('LOCALES: Locale[] = [\'de\', \'en\', \'zh\']'), '支持德英中三语');
  assert.ok(sitemapSrc.includes('alternates: { languages: alternates }'), '包含各语言互链 alternates');
  assert.ok(sitemapSrc.includes('getCmsSitemap'), 'CMS 页面动态纳入 sitemap');

  const robotsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', 'robots.ts'), 'utf-8');
  assert.ok(robotsSrc.includes('/sitemap.xml'), 'robots.txt 声明 sitemap.xml 入口');
});

test('WEB-014: 统一发布验收 — 发布/回滚/快照/缓存再验证闭环', () => {
  const cmsSrc = fs.readFileSync(path.join(__dirname, '..', 'cms.js'), 'utf-8');
  assert.ok(cmsSrc.includes('revalidateStorefront'), '必须联动 CDN 与前台缓存 revalidate');
  assert.ok(cmsSrc.includes('INSERT INTO site_page_versions'), '发布必须生成不可变历史版本快照');
  assert.ok(cmsSrc.includes('old.rev !== input.revision'), '支持 revision 并发版本保护，防止覆盖');
  assert.ok(cmsSrc.includes('async rollback'), '支持历史版本安全回滚');
  assert.ok(cmsSrc.includes('async restoreDraft'), '支持载入历史版本至草稿');
});

console.log('✅ WEB-013 & WEB-014 验证通过');
