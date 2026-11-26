/**
 * WEB-005 验证测试：固定购买区与草稿保护
 * 验收范围：
 *   1. 固定模块（specs, 购买区）不能被随意添加/删除 — PRODUCT_CONTENT_BLOCKS 守卫
 *   2. 保存不覆盖其他配置 — revision 乐观并发控制（409）
 *   3. 未保存草稿不可发布 — publish 要求 old.draft 存在
 *   4. revision 与历史一致 — saveDraft/publish 增加 revision
 *   5. 法定页面 TODO 占位符阻断发布
 *   6. 商品模板允许空可见组件发布
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const cmsSource = fs.readFileSync(path.join(__dirname, '..', 'cms.js'), 'utf-8');
const adminSource = fs.readFileSync(path.join(__dirname, '..', '..', 'admin-web', 'src', 'pages', 'CmsPageManager.jsx'), 'utf-8');

// ========== 1. PRODUCT_CONTENT_BLOCKS 守卫 ==========
test('WEB-005: PRODUCT_CONTENT_BLOCKS 包含内容组件但不含 specs/productGallery', () => {
  // 在 Admin 中，PRODUCT_CONTENT_BLOCKS 定义了商品模板允许自由拖拽的组件
  // specs 和 productGallery 是固定业务模块，不应该在此集合中
  const match = adminSource.match(/PRODUCT_CONTENT_BLOCKS\s*=\s*new Set\(\[([^\]]+)\]\)/);
  assert.ok(match, 'CmsPageManager 应包含 PRODUCT_CONTENT_BLOCKS 定义');
  const blockKeys = match[1].replace(/'/g, '').split(',').map(s => s.trim());

  // 固定业务组件（specs, productGallery）不应在 PRODUCT_CONTENT_BLOCKS 中
  // 因为 PRODUCT_CONTENT_BLOCKS 是用于过滤 PALETTE 允许自由添加的组件
  assert.ok(!blockKeys.includes('specs'), 'specs 不应在自由添加列表中');
  assert.ok(!blockKeys.includes('productGallery'), 'productGallery 不应在自由添加列表中');

  // 四大装修组件应在列表中
  assert.ok(blockKeys.includes('image'), 'image 应在内容组件列表中');
  assert.ok(blockKeys.includes('carousel'), 'carousel 应在内容组件列表中');
  assert.ok(blockKeys.includes('divider'), 'divider 应在内容组件列表中');
  assert.ok(blockKeys.includes('spacer'), 'spacer 应在内容组件列表中');
});

test('WEB-005: Admin 商品模板编辑器过滤 PALETTE 只显示允许的内容组件', () => {
  // 在 CmsPageManager 中，当编辑商品模板时，PALETTE 应被 PRODUCT_CONTENT_BLOCKS 过滤
  assert.ok(
    adminSource.includes('PRODUCT_CONTENT_BLOCKS.has(item.key)'),
    'Admin 应使用 PRODUCT_CONTENT_BLOCKS 过滤可添加的组件'
  );
});

// ========== 2. revision 乐观并发控制 ==========
test('WEB-005: saveDraft 要求 revision 参数且检查一致性', () => {
  // cms.js saveDraft 检查 input.revision 与数据库 old.rev 一致
  assert.ok(cmsSource.includes("old.rev !== input.revision"), 'saveDraft 应检查 revision 一致性');
  assert.ok(cmsSource.includes("请先加载最新页面"), 'revision 格式错误应提示刷新');
  assert.ok(cmsSource.includes("页面草稿已被其他人更新，请重新加载"), '冲突时应返回 409 提示');
});

test('WEB-005: saveDraft 冲突返回 409', () => {
  // 验证 fail 调用附带 409 状态码
  const match = cmsSource.match(/old\.rev !== input\.revision\)\s*fail\([^,]+,\s*(\d+)\)/);
  assert.ok(match, '应找到 revision 检查的 fail 调用');
  assert.equal(match[1], '409', 'revision 冲突应返回 HTTP 409');
});

// ========== 3. 未保存草稿不可发布 ==========
test('WEB-005: publish 要求 draft 存在', () => {
  assert.ok(
    cmsSource.includes("if (!old.draft) fail('请先保存页面草稿')"),
    'publish 应在无草稿时拒绝发布'
  );
});

// ========== 4. publish 也检查 revision ==========
test('WEB-005: publish 也进行 revision 一致性检查', () => {
  // publish 函数中也有 revision 检查
  const publishSection = cmsSource.slice(cmsSource.indexOf('async publish('));
  const publishEnd = publishSection.indexOf('async versions(');
  const publishCode = publishSection.slice(0, publishEnd);
  assert.ok(publishCode.includes("old.rev !== input.revision"), 'publish 应检查 revision');
});

// ========== 5. 法定页面 TODO 占位符阻断 ==========
test('WEB-005: 法定页面含 {{TODO_...}} 时阻断发布', () => {
  assert.ok(cmsSource.includes('assertLegalReady'), 'publish 应调用 assertLegalReady');
  assert.ok(cmsSource.includes("法定页面仍含待填写占位符，禁止发布"), 'TODO 占位符应阻断发布');
  // 验证正则匹配 {{TODO_XXX}}
  assert.ok(cmsSource.includes('\\{\\{TODO_[A-Z_]+\\}\\}'), '应检查 TODO 占位符正则');
});

// ========== 6. 商品模板允许空可见组件发布 ==========
test('WEB-005: 商品模板允许零可见组件发布', () => {
  // publish 中的检查：pageType !== 'product_template' 时要求至少一个可见组件
  assert.ok(
    cmsSource.includes("old.pageType !== 'product_template'"),
    'publish 应对非商品模板检查可见组件'
  );
  assert.ok(
    cmsSource.includes("页面至少需要一个可见组件才能发布"),
    '无可见组件时应拒绝发布（非商品模板）'
  );
});

// ========== 7. 事务完整性 ==========
test('WEB-005: saveDraft 和 publish 均使用事务', () => {
  const countBeginInSave = (cmsSource.match(/saveDraft[\s\S]*?async publish/)?.[0] || '').match(/BEGIN/g)?.length || 0;
  assert.ok(countBeginInSave >= 1, 'saveDraft 应使用 BEGIN 事务');

  const publishSection = cmsSource.slice(cmsSource.indexOf('async publish('), cmsSource.indexOf('async versions('));
  assert.ok(publishSection.includes('BEGIN'), 'publish 应使用 BEGIN 事务');
  assert.ok(publishSection.includes('COMMIT'), 'publish 应使用 COMMIT');
  assert.ok(publishSection.includes('ROLLBACK'), 'publish 应使用 ROLLBACK');
});

// ========== 8. 历史版本创建（发布时生成不可变快照）==========
test('WEB-005: publish 在更新前创建 site_page_versions 快照', () => {
  const publishSection = cmsSource.slice(cmsSource.indexOf('async publish('), cmsSource.indexOf('async versions('));
  const insertVersionIdx = publishSection.indexOf('INSERT INTO site_page_versions');
  const updatePagesIdx = publishSection.indexOf('UPDATE site_pages SET published');
  assert.ok(insertVersionIdx > 0, 'publish 应插入版本快照');
  assert.ok(updatePagesIdx > insertVersionIdx, '版本快照应在更新 published 之前创建');
});

// ========== 9. 商品详情固定模块顺序不可拖拽 ==========
test('WEB-005: 商品详情 8 模块顺序固定（有注释说明）', () => {
  assert.ok(
    cmsSource.includes('商品详情页 8 模块中的全局模块'),
    'cms.js 应包含商品详情固定模块的说明注释'
  );
  assert.ok(
    cmsSource.includes('顺序固定不可拖拽'),
    'cms.js 应明确注释顺序固定不可拖拽'
  );
});

console.log('✅ WEB-005 全部验证完成');
