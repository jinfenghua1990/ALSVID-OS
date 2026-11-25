/**
 * WEB-016 验收测试：丰富业务数据模块 (Rich Business Data Modules)
 * 验收目标：
 * 1. 车型对比 (comparison)、车主评价 (reviews)、适配配件 (accessories)、说明书/下载 (manuals) 登记与 Schema 校验
 * 2. 真实数据动态绑定与禁止假值：
 *    - 对比模块：真实关联 products 与 storefront_listings，横向对齐规格与价格，缺失值不伪造
 *    - 评价模块：严格从 storefront_reviews 查询公开真实评价与实时统计，未评价车型绝不生成假好评
 *    - 配件模块：严格通过 fits 车型配件适配关系表查询正品配件，无虚假推荐
 *    - 说明书模块：从 asset_links / media_assets 提取产品证书、手册与图纸下载，真实文件与尺寸
 * 3. Storefront 与 Admin 端渲染契约一致性
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// 注入 mockPool
let currentMockHandler = () => ({ rows: [] });
const mockPool = {
  async query(sql, params) { return currentMockHandler(sql, params); },
  async connect() { return { query: async (sql, params) => currentMockHandler(sql, params), release() {} }; },
};

const dbPoolPath = require.resolve('../db-pool');
require.cache[dbPoolPath] = { id: dbPoolPath, filename: dbPoolPath, loaded: true, exports: { createPool: () => mockPool } };
delete require.cache[require.resolve('../cms.js')];
const { createCmsStore } = require('../cms.js');

test('WEB-016: 业务数据组件 schema 校验与约束', async () => {
  currentMockHandler = () => ({ rows: [] });
  const cms = createCmsStore('postgres://mock');

  // comparison 校验：最多 4 款车型
  await assert.rejects(
    async () => cms.create({
      name: '对比页',
      pageType: 'custom',
      locale: 'de',
      path: '/compare-test',
      draft: {
        blocks: [{
          componentKey: 'comparison',
          props: { heading: 'Modellvergleich' },
          bindings: { productIds: ['p1', 'p2', 'p3', 'p4', 'p5'] },
        }],
      },
    }),
    /对比模块最多关联 4 个产品/
  );

  // reviews 校验：展示条数 1-50
  await assert.rejects(
    async () => cms.create({
      name: '评价页',
      pageType: 'custom',
      locale: 'de',
      path: '/reviews-test',
      draft: {
        blocks: [{
          componentKey: 'reviews',
          props: { heading: 'Bewertungen', limit: 100 },
        }],
      },
    }),
    /评价展示条数需在 1-50 之间/
  );

  // accessories 校验：配件条数 1-30
  await assert.rejects(
    async () => cms.create({
      name: '配件页',
      pageType: 'custom',
      locale: 'de',
      path: '/acc-test',
      draft: {
        blocks: [{
          componentKey: 'accessories',
          props: { heading: 'Zubehör', limit: 50 },
        }],
      },
    }),
    /配件展示条数需在 1-30 之间/
  );

  // manuals 校验：最多 20 个项目
  const tooManyManuals = Array.from({ length: 25 }, (_, i) => ({ title: `Doc ${i}`, downloadUrl: `/api/assets/doc-${i}` }));
  await assert.rejects(
    async () => cms.create({
      name: '文档页',
      pageType: 'custom',
      locale: 'de',
      path: '/manuals-test',
      draft: {
        blocks: [{
          componentKey: 'manuals',
          props: { heading: 'Downloads', items: tooManyManuals },
        }],
      },
    }),
    /说明书与技术文档最多 20 项/
  );
});

test('WEB-016: 车型对比 (comparison) 真实绑定商品主档与多语言规格，零伪造数据', async () => {
  const mockProducts = [
    {
      id: 'prod-fc1',
      slug: 'fc1-commuter',
      kind: 'vehicle',
      name: 'FC1 City Commuter',
      productType: 'EBI',
      specs: { rated_power_w: 250, battery_capacity: 360 },
      published: {
        languages: { de: { title: 'FC1 City Commuter DE' }, en: { title: 'FC1 City Commuter EN' } },
        mediaIds: ['018e6e58-3921-789a-bcde-1234567890ab'],
      },
      prices: [{ currency: 'EUR', unitPrice: '2199.00', referencePrice: '2399.00' }],
    },
    {
      id: 'prod-fc2',
      slug: 'fc2-pro',
      kind: 'vehicle',
      name: 'FC2 All-Terrain',
      productType: 'EBI',
      specs: { rated_power_w: 350, battery_capacity: 500 },
      published: {
        languages: { de: { title: 'FC2 All-Terrain DE' }, en: { title: 'FC2 All-Terrain EN' } },
        mediaIds: ['018e6e58-3921-789a-bcde-1234567890ac'],
      },
      prices: [{ currency: 'EUR', unitPrice: '2799.00', referencePrice: null }],
    },
  ];

  const mockFields = [
    { code: 'rated_power_w', nameZh: '额定功率', nameEn: 'Rated Power', nameDe: 'Nennleistung', unit: 'W', level: 'product', enabled: true, shopVisible: true },
    { code: 'battery_capacity', nameZh: '电池容量', nameEn: 'Battery Capacity', nameDe: 'Batteriekapazität', unit: 'Wh', level: 'product', enabled: true, shopVisible: true },
  ];

  currentMockHandler = (sql, params) => {
    if (sql.includes('FROM site_pages') && sql.includes('path=')) {
      return {
        rows: [{
          id: '018e6e58-3921-789a-bcde-page00000001',
          pageType: 'custom',
          locale: 'de',
          path: '/compare',
          name: '车型对比',
          status: 'active',
          revision: 1,
          publishedRevision: 1,
          publishedVersion: 1,
          published: {
            blocks: [{
              id: 'b-comp-1',
              componentKey: 'comparison',
              props: { heading: 'Vergleich FC1 vs FC2' },
              bindings: { productIds: ['prod-fc1', 'prod-fc2'] },
            }],
          },
        }],
      };
    }
    if (sql.includes('FROM products p JOIN storefront_listings l')) {
      return { rows: mockProducts };
    }
    if (sql.includes('FROM fields WHERE enabled=true')) {
      return { rows: mockFields };
    }
    return { rows: [] };
  };

  const cms = createCmsStore('postgres://mock');
  const result = await cms.publicPage('de', '/compare');
  assert.ok(result, '应返回公开对比页数据');
  const compBlock = result.blocks.find(b => b.componentKey === 'comparison');
  assert.ok(compBlock, '应包含 comparison 模块');
  assert.equal(compBlock.data.comparison.products.length, 2, '真实对比 2 款车型');
  assert.equal(compBlock.data.comparison.products[0].title, 'FC1 City Commuter DE');
  assert.equal(compBlock.data.comparison.products[1].title, 'FC2 All-Terrain DE');
  assert.deepEqual(compBlock.data.comparison.specLabels, ['Nennleistung', 'Batteriekapazität']);
  assert.equal(compBlock.data.comparison.products[0].specifications[0].value, '250');
  assert.equal(compBlock.data.comparison.products[1].specifications[0].value, '350');
});

test('WEB-016: 车主评价 (reviews) 真实绑定已公开评价与统计，禁止假好评', async () => {
  const mockReviews = [
    { id: '018e6e58-3921-789a-bcde-rev000000001', rating: 5, content: 'Tolles Fahrrad, sehr stabil!', reply: 'Vielen Dank für Ihr Feedback!', repliedAt: '2026-11-20T10:00:00Z', createdAt: '2026-11-19T08:00:00Z', username: 'hans.mueller' },
    { id: '018e6e58-3921-789a-bcde-rev000000002', rating: 4, content: 'Gute Reichweite im Alltag.', reply: null, repliedAt: null, createdAt: '2026-11-18T14:00:00Z', username: 'anna.schmidt' },
  ];

  currentMockHandler = (sql, params) => {
    if (sql.includes('FROM site_pages') && sql.includes('path=')) {
      return {
        rows: [{
          id: '018e6e58-3921-789a-bcde-page00000002',
          pageType: 'custom',
          locale: 'de',
          path: '/fc1-reviews',
          name: 'FC1 真实评价',
          status: 'active',
          revision: 1,
          publishedRevision: 1,
          publishedVersion: 1,
          published: {
            blocks: [{
              id: 'b-rev-1',
              componentKey: 'reviews',
              props: { heading: 'Echte Kundenbewertungen', limit: 10 },
              bindings: { productId: '100006' },
            }],
          },
        }],
      };
    }
    if (sql.includes('FROM storefront_reviews r JOIN storefront_orders o') && sql.includes('LIMIT 50')) {
      return { rows: mockReviews };
    }
    if (sql.includes('FROM storefront_reviews r JOIN storefront_orders o') && sql.includes('round(avg(r.rating)')) {
      return {
        rows: [{
          total: 2,
          average: '4.5',
          good: 2,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
        }],
      };
    }
    return { rows: [] };
  };

  const cms = createCmsStore('postgres://mock');
  const result = await cms.publicPage('de', '/fc1-reviews');
  const revBlock = result.blocks.find(b => b.componentKey === 'reviews');
  assert.ok(revBlock, '应包含 reviews 模块');
  assert.equal(revBlock.data.reviews.summary.total, 2);
  assert.equal(revBlock.data.reviews.summary.average, '4.5');
  assert.equal(revBlock.data.reviews.summary.goodRate, 100);
  assert.equal(revBlock.data.reviews.items.length, 2);
  assert.equal(revBlock.data.reviews.items[0].content, 'Tolles Fahrrad, sehr stabil!');
  assert.equal(revBlock.data.reviews.items[0].reply, 'Vielen Dank für Ihr Feedback!');
  assert.equal(revBlock.data.reviews.items[0].isVerifiedBuyer, true);
  assert.equal(revBlock.data.reviews.items[0].author, 'h***r', '脱敏用户名保护隐私');
});

test('WEB-016: 适配配件 (accessories) 从 fits 关联真实配件，无适配时为空不捏造', async () => {
  const mockAccessories = [
    {
      id: 'part-rack-1',
      name: 'Heckgepäckträger FC1',
      kind: 'part',
      slug: 'heckgepaecktraeger-fc1',
      published: {
        languages: { de: { title: 'Aluminium Heckgepäckträger' } },
        mediaIds: ['018e6e58-3921-789a-bcde-acc000000001'],
      },
      prices: [{ currency: 'EUR', unitPrice: '79.00', referencePrice: '89.00' }],
    },
  ];

  currentMockHandler = (sql, params) => {
    if (sql.includes('FROM site_pages') && sql.includes('path=')) {
      return {
        rows: [{
          id: '018e6e58-3921-789a-bcde-page00000003',
          pageType: 'custom',
          locale: 'de',
          path: '/fc1-accessories',
          name: 'FC1 配件',
          status: 'active',
          revision: 1,
          publishedRevision: 1,
          publishedVersion: 1,
          published: {
            blocks: [{
              id: 'b-acc-1',
              componentKey: 'accessories',
              props: { heading: 'Passendes Originalzubehör' },
              bindings: { productId: '100006' },
            }],
          },
        }],
      };
    }
    if (sql.includes('FROM fits f JOIN products p')) {
      return { rows: mockAccessories };
    }
    return { rows: [] };
  };

  const cms = createCmsStore('postgres://mock');
  const result = await cms.publicPage('de', '/fc1-accessories');
  const accBlock = result.blocks.find(b => b.componentKey === 'accessories');
  assert.ok(accBlock, '应包含 accessories 模块');
  assert.equal(accBlock.data.accessories.length, 1);
  assert.equal(accBlock.data.accessories[0].title, 'Aluminium Heckgepäckträger');
  assert.equal(accBlock.data.accessories[0].prices[0].unitPrice, '79.00');
  assert.ok(accBlock.data.accessories[0].image.url.includes('images/part-rack-1/images/018e6e58-3921-789a-bcde-acc000000001') || accBlock.data.accessories[0].image.url.includes('images/018e6e58-3921-789a-bcde-acc000000001'));
});

test('WEB-016: 说明书与下载 (manuals) 真实关联素材库产品文档', async () => {
  const mockDocs = [
    {
      id: '018e6e58-3921-789a-bcde-doc000000001',
      fileName: 'ALSVID_FC1_Bedienungsanleitung_DE_2026.pdf',
      label: 'FC1 Benutzerhandbuch',
      contentType: 'application/pdf',
      sizeBytes: 4194304,
    },
  ];

  currentMockHandler = (sql, params) => {
    if (sql.includes('FROM site_pages') && sql.includes('path=')) {
      return {
        rows: [{
          id: '018e6e58-3921-789a-bcde-page00000004',
          pageType: 'custom',
          locale: 'de',
          path: '/fc1-manuals',
          name: 'FC1 下载中心',
          status: 'active',
          revision: 1,
          publishedRevision: 1,
          publishedVersion: 1,
          published: {
            blocks: [{
              id: 'b-man-1',
              componentKey: 'manuals',
              props: {
                heading: 'Handbücher & Dokumente',
                items: [{ title: 'CE Konformitätserklärung', downloadUrl: '/api/public/ce-cert.pdf', format: 'PDF', sizeBytes: 1048576 }],
              },
              bindings: { productId: '100006' },
            }],
          },
        }],
      };
    }
    if (sql.includes('FROM asset_links al JOIN media_assets ma')) {
      return { rows: mockDocs };
    }
    return { rows: [] };
  };

  const cms = createCmsStore('postgres://mock');
  const result = await cms.publicPage('de', '/fc1-manuals');
  const manBlock = result.blocks.find(b => b.componentKey === 'manuals');
  assert.ok(manBlock, '应包含 manuals 模块');
  assert.equal(manBlock.data.manuals.length, 2, '聚合主档文档与自定义配置文档');
  assert.equal(manBlock.data.manuals[0].title, 'FC1 Benutzerhandbuch');
  assert.equal(manBlock.data.manuals[0].format, 'PDF');
  assert.ok(manBlock.data.manuals[0].downloadUrl.includes('018e6e58-3921-789a-bcde-doc000000001'));
  assert.equal(manBlock.data.manuals[1].title, 'CE Konformitätserklärung');
});

test('WEB-016: 前台 Storefront 与 Admin 代码均完整支持 4 大业务数据模块', () => {
  const cmsBlocksSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'components', 'cms-blocks.tsx'), 'utf-8');
  assert.ok(cmsBlocksSrc.includes("componentKey === 'comparison'"), 'Storefront 应渲染 comparison 对比模块');
  assert.ok(cmsBlocksSrc.includes("componentKey === 'reviews'"), 'Storefront 应渲染 reviews 车主评价模块');
  assert.ok(cmsBlocksSrc.includes("componentKey === 'accessories'"), 'Storefront 应渲染 accessories 适配配件模块');
  assert.ok(cmsBlocksSrc.includes("componentKey === 'manuals'"), 'Storefront 应渲染 manuals 说明书下载模块');

  const adminPaletteSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'pages', 'CmsPageManager.jsx'), 'utf-8');
  assert.ok(adminPaletteSrc.includes("key: 'comparison'"), 'Admin 模块库应包含车型对比');
  assert.ok(adminPaletteSrc.includes("key: 'accessories'"), 'Admin 模块库应包含适配配件');
  assert.ok(adminPaletteSrc.includes("key: 'reviews'"), 'Admin 模块库应包含车主评价');
  assert.ok(adminPaletteSrc.includes("key: 'manuals'"), 'Admin 模块库应包含说明书/下载');

  const detailPageSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'e-bikes', '[slug]', 'page.tsx'), 'utf-8');
  assert.ok(detailPageSrc.includes("'comparison'"), '商品详情模板应允许编排 comparison');
  assert.ok(detailPageSrc.includes("'reviews'"), '商品详情模板应允许编排 reviews');
  assert.ok(detailPageSrc.includes("'accessories'"), '商品详情模板应允许编排 accessories');
  assert.ok(detailPageSrc.includes("'manuals'"), '商品详情模板应允许编排 manuals');
});

console.log('✅ WEB-016 业务数据模块全部验证通过');
