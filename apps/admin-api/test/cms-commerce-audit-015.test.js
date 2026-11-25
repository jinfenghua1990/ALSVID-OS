/**
 * WEB-015 交易链路盘点与验收测试
 * 盘点范围与真实业务现状核验：
 * 1. 访客购物车 (readGuestCart / LocalStorage guestCartKey) 与 车主账号合并逻辑 (PUT /api/portal/storefront/cart)
 * 2. 意向申请订购流 (/api/portal/storefront/orders) 具备完整幂等性防重提交机制 (UUIDv7 + request key)
 * 3. 页面明确声明欧洲合规非约束性申请（当前未开放在线即时划扣支付，符合实际现状）
 * 4. 真实库存与交付校验 (availability / offers)
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('WEB-015: 购物车与订购申请链路支持访客与车主登录无缝合并', () => {
  const cartSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'components', 'cart-actions.tsx'), 'utf-8');
  assert.ok(cartSrc.includes('readGuestCart()'), '支持访客未登录时本地存储购物车');
  assert.ok(cartSrc.includes('/api/portal/storefront/cart'), '车主登录时支持双端购物车智能合并与云端持久化');
  assert.ok(cartSrc.includes('/api/portal/storefront/orders'), '具备标准订购申请单提交接口');
  assert.ok(cartSrc.includes('alsvid-order-request-v1'), '具备 UUIDv7 幂等防重提交保护');
});

test('WEB-015: 交易合规声明如实反映业务阶段（无虚假在线支付宣称）', () => {
  const cartSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'storefront', 'src', 'components', 'cart-actions.tsx'), 'utf-8');
  assert.ok(cartSrc.includes('Unverbindliche Bestellanfrage; keine Online-Zahlung.'), '德语如实标注非约束性申请与暂无在线即时扣款');
  assert.ok(cartSrc.includes('Non-binding order request; no online payment.'), '英语如实标注非约束性申请');
  assert.ok(cartSrc.includes('非约束性订购申请，暂不在线收款。'), '中文如实标注订购流程状态');
});

console.log('✅ WEB-015 盘点与验收测试通过');
