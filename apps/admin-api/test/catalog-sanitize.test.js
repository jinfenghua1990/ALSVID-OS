'use strict';
// 无数据库依赖：官网装修 HTML 白名单必须剥掉可构造钓鱼表单的 form/input/label，
// 同时保留正常的版式、媒体与交互展示标签。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sanitizeHtml = require('sanitize-html');
const { PAGE_SANITIZE_OPTIONS } = require('../catalog');

// 与 catalog.js 的 cleanPageHtml 同逻辑：去 body 包裹 + 按白名单清洗。
const clean = html => sanitizeHtml(
  html.trim().replace(/^<body[^>]*>/i, '').replace(/<\/body>\s*$/i, '').trim(),
  PAGE_SANITIZE_OPTIONS
);

test('published page HTML strips form controls but keeps layout and media tags', () => {
  const html = `<body>
    <section class="hero"><h1>标题</h1><p>正文</p></section>
    <picture><source srcset="a.webp"><img src="a.png" alt="图"></picture>
    <video src="v.mp4"></video><details><summary>更多</summary><p>内容</p></details>
    <button type="button">点击</button>
    <form action="https://evil.example" method="POST"><input name="pwd" type="password"><label for="pwd">密码</label></form>
    <script>alert(1)</script>
  </body>`;
  const out = clean(html);
  assert.doesNotMatch(out, /<form[\s>]/i, 'form 必须被剥掉');
  assert.doesNotMatch(out, /<input[\s>]/i, 'input 必须被剥掉');
  assert.doesNotMatch(out, /<label[\s>]/i, 'label 必须被剥掉');
  assert.doesNotMatch(out, /evil\.example/, 'form action 不能残留');
  assert.doesNotMatch(out, /<script/i, 'script 必须被剥掉');
  assert.doesNotMatch(out, /<body/i, 'body 包裹必须被去掉');
  // 只断言 concat 明确加入的版式/媒体/交互标签保留。
  // 注意：sanitize-html 默认白名单不含 img/source/video 的媒体属性，原实现即如此，不在此测试范围。
  for (const tag of ['section', 'picture', 'source', 'video', 'details', 'summary', 'button', 'h1', 'p']) {
    assert.match(out, new RegExp(`<${tag}[\\s>]`, 'i'), `${tag} 应保留`);
  }
});

test('data attributes and aria/role on layout tags survive sanitization', () => {
  const out = clean('<section class="s" id="x" role="region" aria-label="区" data-alsvid-motion="fade"><p>ok</p></section>');
  assert.match(out, /class="s"/);
  assert.match(out, /data-alsvid-motion="fade"/);
  assert.match(out, /aria-label="区"/);
  assert.match(out, /role="region"/);
});

test('form/input/label are not in the allowed tag list at all', () => {
  for (const tag of ['form', 'input', 'label']) {
    assert.equal(PAGE_SANITIZE_OPTIONS.allowedTags.includes(tag), false, `${tag} 不得在白名单`);
  }
  assert.equal(PAGE_SANITIZE_OPTIONS.allowedAttributes.form, undefined);
  assert.equal(PAGE_SANITIZE_OPTIONS.allowedAttributes.input, undefined);
});
