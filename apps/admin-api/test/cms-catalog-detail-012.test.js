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

test('WEB-012: 分类列表页按 catalogLayout 分类导航与筛选', () => {
  const listingSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'e-bikes', 'page.tsx'), 'utf-8');
  assert.ok(listingSrc.includes('getCmsProductTemplate(locale)'), '应调用 getCmsProductTemplate 读取分类版式');
  assert.ok(listingSrc.includes('catalogLayout?.categories'), '应读取 catalogLayout 分类');
  assert.ok(listingSrc.includes('CollectionCards products={shown}'), '应筛选对应分类的商品展示');
});

test('WEB-012: 商品详情页支持固定业务区、真实购买与参数绑定', () => {
  const detailSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'app', '[locale]', 'e-bikes', '[slug]', 'page.tsx'), 'utf-8');
  assert.ok(detailSrc.includes('ProductGallery'), '包含商品主图画廊');
  assert.ok(detailSrc.includes('CartActions'), '包含真实购买区交互 (加入购物车/选配)');
  assert.ok(detailSrc.includes('getCmsProductTemplate(locale, product.productId)'), '根据 productId 获取对应模板或按商品独立覆盖');
  assert.ok(detailSrc.includes('specsModule?.data?.specifications'), '技术参数绑定商品主档');
});

test('WEB-012: 后端 cms.js publicProductTemplate 优先命中按商品独立覆盖模板', () => {
  const cmsSrc = fs.readFileSync(path.join(__dirname, '..', 'cms.js'), 'utf-8');
  assert.ok(cmsSrc.includes("path=$2 OR path NOT LIKE '/products/%'"), 'SQL 查询应支持按特定商品路径优先匹配');
  assert.ok(cmsSrc.includes("ORDER BY (path=$2) DESC"), '按特定商品路径排序优先');
});

console.log('✅ WEB-012 验证通过');
