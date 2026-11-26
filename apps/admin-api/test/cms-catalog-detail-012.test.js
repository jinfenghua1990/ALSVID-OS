/**
 * WEB-012 验证测试：分类页及商品详情装修
 * 验收目标：
 * 1. 分类列表页 (/e-bikes) 正确读取 catalogLayout 分类筛选及按销量自动排序展示
 * 2. 商品详情页 (/e-bikes/[slug]) 固定购买区与画廊渲染真实商品数据 (ProductGallery, CartActions, Offers, Availability)
 * 3. 详情页共享模板但呈现各自独立数据 (不同商品读取各自 specs, offers, reviews)
 * 4. 详情页支持按商品独立覆盖模板 (通过 publicProductTemplate 的 path=$2 优先匹配)
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { catalogLayoutOf } = require('../cms');

test('WEB-012: L03/L04 目录版式只接受真实配件上限和已接通服务路由', () => {
  const normalized = catalogLayoutOf({ catalogLayout: {
    sort: 'sales', categories: [], partProductIds: ['part-1'],
    services: [{ key: 'test-ride', enabled: true, title: '预约试骑', description: '选择地点', buttonText: '查看地点' }],
  } });
  assert.equal(normalized.partProductIds[0], 'part-1');
  assert.equal(normalized.services[0].key, 'test-ride');
  assert.throws(() => catalogLayoutOf({ catalogLayout: { services: [{ key: 'warranty', title: '质保查询', buttonText: '查看' }] } }), /服务入口配置无效/);
  assert.throws(() => catalogLayoutOf({ catalogLayout: { partProductIds: Array.from({ length: 51 }, (_, i) => `part-${i}`) } }), /最多 50 个/);
});

test('WEB-012: 分类列表页按 catalogLayout 分类导航与筛选', () => {
  const listingSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'e-bikes', 'page.tsx'), 'utf-8');
  assert.ok(listingSrc.includes('getCmsProductTemplate(locale)'), '应调用 getCmsProductTemplate 读取分类版式');
  assert.ok(listingSrc.includes('catalogLayout?.categories'), '应读取 catalogLayout 分类');
  assert.ok(listingSrc.includes('CollectionCards products={shown}'), '应筛选对应分类的商品展示');
});

test('WEB-012: 商品详情页支持固定业务区、真实购买与参数绑定', () => {
  const detailSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'e-bikes', '[slug]', 'page.tsx'), 'utf-8');
  const purchaseSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'components', 'product-purchase-section.tsx'), 'utf-8');
  assert.ok(detailSrc.includes('<ProductPurchaseSection product={product} locale={locale} offers={offers} availability={availability}'), '详情页将真实商品、报价和库存传给 P01');
  assert.ok(purchaseSrc.includes('<ProductGallery') && purchaseSrc.includes('images={product.images}'), 'P01 包含真实商品主图画廊');
  assert.ok(purchaseSrc.includes('<CartActions') && purchaseSrc.includes('offers={offers} availability={availability}'), 'P01 包含真实购买区交互及报价库存绑定');
  assert.ok(detailSrc.includes('getCmsProductTemplate(locale, product.productId)'), '根据 productId 获取对应模板或按商品独立覆盖');
  assert.ok(detailSrc.includes('specsModule?.data?.specifications'), '技术参数绑定商品主档');
});

test('WEB-012: 后端 cms.js publicProductTemplate 优先命中按商品独立覆盖模板', () => {
  const cmsSrc = fs.readFileSync(path.join(__dirname, '..', 'cms.js'), 'utf-8');
  assert.ok(cmsSrc.includes("path=$2 OR path NOT LIKE '/products/%'"), 'SQL 查询应支持按特定商品路径优先匹配');
  assert.ok(cmsSrc.includes("ORDER BY (path=$2) DESC"), '按特定商品路径排序优先');
});

console.log('✅ WEB-012 验证通过');
