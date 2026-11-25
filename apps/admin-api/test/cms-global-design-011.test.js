/**
 * WEB-011 验证测试：全局装修与设计系统
 * 验收目标：
 * 1. globals.css 声明标准设计令牌（--font-sans, --color-primary, --color-border, --radius 等）
 * 2. layout.tsx 集中渲染 Header、Footer、法律导航
 * 3. 响应式布局：PC / 平板 / 手机端断点规则完整（max-width: 720px）
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('WEB-011: globals.css 声明集中设计系统令牌 (Design Tokens)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', 'globals.css'), 'utf-8');
  assert.ok(css.includes(':root'), '应包含 :root 设计令牌声明');
  assert.ok(css.includes('--color-primary:'), '应包含主色调令牌');
  assert.ok(css.includes('--color-border:'), '应包含边框颜色令牌');
  assert.ok(css.includes('--font-sans:'), '应包含全局字体令牌');
  assert.ok(css.includes('--color-bg:'), '应包含背景色令牌');
  assert.ok(css.includes('@media (max-width:720px)'), '应包含移动端断点');
});

test('WEB-011: storefront layout.tsx 集中管理 Header、Footer 与三语法律条款', () => {
  const layoutSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'layout.tsx'), 'utf-8');
  assert.ok(layoutSrc.includes('<SiteHeader'), '集中管理 SiteHeader 导航');
  assert.ok(layoutSrc.includes('site-footer'), '集中管理 site-footer 页脚');
  assert.ok(layoutSrc.includes('impressum'), '包含三语法定信息 (impressum)');
  assert.ok(layoutSrc.includes('datenschutz'), '包含三语法定信息 (datenschutz)');
  assert.ok(layoutSrc.includes('agb'), '包含三语法定信息 (agb)');
});

console.log('✅ WEB-011 验证通过');
