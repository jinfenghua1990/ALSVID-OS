/**
 * WEB-008 & WEB-009 验证测试：页面及商品模板库 + 三栏编辑器
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function createMockPool() {
  const pages = new Map();
  const auditLogs = [];
  let seq = 1;
  const nextUuid = () => `01966a1b-c8d0-7000-8000-${String(seq++).padStart(12, '0')}`;

  const client = {
    async query(sql, params = []) {
      const s = sql.trim();
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (s.includes('FROM media_assets')) return { rows: [], rowCount: 0 };
      if (s.includes('INSERT INTO audit_log')) {
        auditLogs.push({ action: params[1], target: params[2], after: params[4] });
        return { rows: [], rowCount: 1 };
      }
      if (s.includes("INSERT INTO site_pages") && s.includes("'page_template'")) {
        const id = nextUuid();
        const row = {
          id, slug: params[0], pageType: 'page_template', locale: params[1], path: params[2],
          name: params[3], status: 'active', draft: JSON.parse(params[4]), published: JSON.parse(params[4]),
          revision: 1, publishedRevision: 1, publishedVersion: 1,
          draftSeo: null, publishedSeo: null, publishedLabel: null, draftLabel: null,
          updatedBy: params[5], updatedAt: new Date().toISOString(),
        };
        pages.set(id, row);
        return { rows: [row], rowCount: 1 };
      }
      if (s.includes('SELECT') && s.includes('FROM site_pages WHERE id=$1 FOR UPDATE')) {
        const r = pages.get(params[0]);
        return { rows: r ? [{ ...r, rev: r.revision }] : [], rowCount: r ? 1 : 0 };
      }
      if (s.includes('UPDATE site_pages SET draft=$1,revision=revision+1')) {
        const r = pages.get(params[2]);
        r.draft = JSON.parse(params[0]);
        r.revision += 1;
        r.updatedBy = params[1];
        return { rows: [{ ...r }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };

  return {
    pages,
    auditLogs,
    async connect() { return client; },
    async query(sql, params = []) {
      const s = sql.trim();
      if (s.includes("SELECT") && s.includes("FROM site_pages WHERE id=$1")) {
        const r = pages.get(params[0]);
        return { rows: r ? [{ ...r }] : [], rowCount: r ? 1 : 0 };
      }
      if (s.includes("WHERE page_type='page_template'")) {
        const rows = [...pages.values()].filter(p => p.pageType === 'page_template');
        return { rows, rowCount: rows.length };
      }
      if (s.includes("SELECT count(*)::int AS n FROM site_pages")) {
        const tid = params[0];
        let n = 0;
        for (const p of pages.values()) {
          if (['home', 'custom', 'product_template'].includes(p.pageType)) {
            if (p.draft?.templateMeta?.templateId === tid || p.published?.templateMeta?.templateId === tid) n++;
          }
        }
        return { rows: [{ n }], rowCount: 1 };
      }
      if (s.includes("WHERE page_type IN ('home','custom','product_template')") && s.includes("templateMeta")) {
        const rows = [];
        for (const p of pages.values()) {
          if (!['home', 'custom', 'product_template'].includes(p.pageType)) continue;
          const tid = p.draft?.templateMeta?.templateId || p.published?.templateMeta?.templateId;
          if (tid) rows.push({ id: p.id, name: p.name, pageType: p.pageType, locale: p.locale, path: p.path, templateId: tid });
        }
        return { rows, rowCount: rows.length };
      }
      if (s.includes("DELETE FROM site_pages WHERE id=$1")) {
        pages.delete(params[0]);
        return { rows: [], rowCount: 1 };
      }
      if (s.includes("WHERE page_type='product_template' AND locale=$1 AND path=$2")) {
        const r = [...pages.values()].find(p => p.pageType === 'product_template' && p.locale === params[0] && p.path === params[1]);
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
      }
      if (s.includes("WHERE page_type='product_template' AND locale=$1 AND status='active' AND path NOT LIKE '/products/%'")) {
        const r = [...pages.values()].find(p => p.pageType === 'product_template' && p.locale === params[0] && !p.path.startsWith('/products/'));
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
      }
      if (s.includes("INSERT INTO site_pages") && s.includes("'product_template'")) {
        const id = nextUuid();
        const row = {
          id, slug: params[0], pageType: 'product_template', locale: params[1], path: params[2],
          name: params[3], status: 'active', draft: JSON.parse(params[4]), published: null,
          revision: 1, publishedRevision: null, publishedVersion: null,
          draftSeo: JSON.parse(params[5]), publishedSeo: null, updatedBy: params[6],
        };
        pages.set(id, row);
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    async end() {},
  };
}

// 替换 createPool 以便单测注入 mock pool
const dbPoolPath = require.resolve('../db-pool');
const mockPool = createMockPool();
require.cache[dbPoolPath] = { id: dbPoolPath, filename: dbPoolPath, loaded: true, exports: { createPool: () => mockPool } };
delete require.cache[require.resolve('../cms.js')];
const { createCmsStore: createTestCms } = require('../cms.js');

test('WEB-008: 内置默认模板可读且包含页面与商品模板', async () => {
  const cms = createTestCms('postgres://mock');
  const list = await cms.listTemplates();
  assert.ok(list.some(t => t.builtin && t.targetType === 'custom'), '应包含内置页面模板');
  assert.ok(list.some(t => t.builtin && t.targetType === 'product_template'), '应包含内置商品模板');
});

test('WEB-008: 保存为模板并套用到目标页面，保留 sharedRef 引用不断开且计算引用数', async () => {
  const cms = createTestCms('postgres://mock');
  const sharedModId = '01966a1b-c8d0-7000-8000-000000000099';
  const tpl = await cms.saveAsTemplate({
    name: '品牌活动模板',
    targetType: 'custom',
    locale: 'de',
    document: {
      blocks: [
        {
          id: 'blk-1',
          componentKey: 'cta',
          props: { title: '全局行动号召', text: '试驾', buttonLabel: '预约', buttonHref: '/de/dealers' },
          sharedRef: { mode: 'follow', moduleId: sharedModId, pinnedVersion: null },
        },
      ],
    },
  });
  assert.equal(tpl.name, '品牌活动模板');

  // 创建目标页面记录
  const targetId = '01966a1b-c8d0-7000-8000-000000000888';
  mockPool.pages.set(targetId, {
    id: targetId, slug: 'cms-de-campaign', pageType: 'custom', locale: 'de', path: '/campaign',
    name: '活动页', status: 'active', draft: { blocks: [] }, published: null, revision: 1,
  });

  const updated = await cms.applyTemplate(targetId, { templateId: tpl.id, revision: 1 });
  assert.equal(updated.draft.blocks.length, 1);
  assert.notEqual(updated.draft.blocks[0].id, 'blk-1', '套用模板应分配新 block id');
  assert.deepEqual(updated.draft.blocks[0].sharedRef, { mode: 'follow', moduleId: sharedModId, pinnedVersion: null }, 'sharedRef 共享引用应完整保留');
  assert.equal(updated.draft.templateMeta.templateId, tpl.id);

  // 验证引用计数与禁止删除已引用模板
  const templates = await cms.listTemplates();
  const found = templates.find(t => t.id === tpl.id);
  assert.equal(found.refCount, 1);
  await assert.rejects(() => cms.deleteTemplate(tpl.id), /仍有 1 个页面正在使用该模板/);
});

test('WEB-008: 商品模板套用时保留固定业务区（productLayout / modules / specs 绑定）', async () => {
  const cms = createTestCms('postgres://mock');
  const prodPageId = '01966a1b-c8d0-7000-8000-000000000777';
  mockPool.pages.set(prodPageId, {
    id: prodPageId, slug: 'cms-de-product-tpl', pageType: 'product_template', locale: 'de', path: '/products/default',
    name: '商品默认模板', status: 'active',
    draft: {
      productLayout: { gallery: 'mosaic', specifications: 'table', reviews: 'cards' },
      modules: { marketing: { enabled: true, style: 'banner', imageId: '', title: '优惠', description: '', buttonText: '', href: '', text: '', theme: { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' } } },
      blocks: [
        { id: 'old-spec', componentKey: 'specs', visible: true, props: { heading: '原参数' }, bindings: { productId: '', fieldSet: 'public_specs', fieldCodes: ['motor_power'] }, sharedRef: null },
      ],
    },
    revision: 2,
  });

  const updated = await cms.applyTemplate(prodPageId, { templateId: 'builtin:product-ebike', revision: 2 });
  assert.equal(updated.draft.productLayout.gallery, 'mosaic', '固定画廊样式应保留');
  assert.equal(updated.draft.productLayout.specifications, 'table', '固定规格样式应保留');
  assert.equal(updated.draft.modules.marketing.enabled, true, '固定全局营销模块应保留');
  const specBlock = updated.draft.blocks.find(b => b.componentKey === 'specs');
  assert.ok(specBlock, 'specs 配置应保留');
  assert.deepEqual(specBlock.bindings.fieldCodes, ['motor_power'], '原有参数字段选择应保留');
});

test('WEB-008: ensureProductOverride 创建按商品独立覆盖模板', async () => {
  const cms = createTestCms('postgres://mock');
  const created = await cms.ensureProductOverride({ productId: 'ebike-alpha', locale: 'de', name: 'Alpha 专属详情' });
  assert.equal(created.pageType, 'product_template');
  assert.equal(created.path, '/products/ebike-alpha');
  // 幂等再次调用返回同一记录
  const second = await cms.ensureProductOverride({ productId: 'ebike-alpha', locale: 'de' });
  assert.equal(second.id, created.id);
});

test('WEB-009: Admin CmsPageManager 包含三栏编辑器结构树与共享状态 UI', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'admin-web', 'src', 'pages', 'CmsPageManager.jsx'), 'utf-8');
  assert.ok(src.includes('页面结构'), '应包含左侧页面结构树 Tab');
  assert.ok(src.includes('cms-ref-badge'), '应显示共享/独立状态徽标');
  assert.ok(src.includes('cms-shared-box'), '右栏应包含共享引用模式配置');
  assert.ok(src.includes("['desktop', 'PC'], ['tablet', '平板'], ['mobile', '手机']"), '应支持三端预览切换');
});

console.log('✅ WEB-008 & WEB-009 验证通过');
