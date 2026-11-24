# 线上支付适配层接入指南（骨架版）

> 状态：适配层骨架已落地（迁移 180 / `server/payments.js` / 管理端 UI），**6 家服务商适配器均未实现**。
> 本文件说明「坑占在哪、后续怎么填」，避免后续忘了少了什么或误以为已支持线上支付。

## 一、当前已占的坑

| 层 | 文件 | 作用 |
|---|---|---|
| 数据库 | `server/migrations/180_payment_providers.sql` | 3 张表：`payment_providers`（配置）、`payment_intents`（支付意图）、`payment_webhook_events`（回调幂等） |
| 白名单 | `server/postgres-service.js` | 180 已登记 optionalMigrations，未应用时不阻断 8089 |
| 适配层 | `server/payments.js` | 统一接口 + 配置管理 + 回调验签调度 + 幂等 + 订单联动；适配器注册表 `ADAPTERS` 当前为空 |
| 接口 | `server/index.js` | 管理端 4 路由 + 公开回调 1 路由（回调白名单在 `access-policy.js`） |
| 前端 | `client/src/pages/PaymentProviders.jsx` | 商城运营 › 交易管理 › 线上支付；6 种方式按 P0/P1/P2 展示三态 |
| API | `client/src/api.js` | `paymentProviders` / `savePaymentProvider` / `testPaymentProvider` |
| 台账 | `client/src/pages/ModuleLedger.jsx` | 商城概览 › 模块台账，登记全部模块状态 |

## 二、6 种支付方式与优先级

| provider | 名称 | 优先级 | 必填配置 | 当前状态 |
|---|---|---|---|---|
| `stripe` | 信用卡 / 借记卡（Visa · Mastercard） | P0 | secretKey, webhookSecret | NOT_IMPLEMENTED |
| `paypal` | PayPal | P0 | clientId, clientSecret | NOT_IMPLEMENTED |
| `apple_pay` | Apple Pay | P1 | merchantId, paymentProcessingCertificate | NOT_IMPLEMENTED |
| `google_pay` | Google Pay | P1 | merchantId, gateway | NOT_IMPLEMENTED |
| `klarna` | Klarna（先买后付） | P2 | username, password, region | NOT_IMPLEMENTED |
| `sepa` | SEPA 直接借记 | P2 | creditorId, iban | NOT_IMPLEMENTED |

## 三、适配器要实现什么

在 `server/payments.js` 里用 `registerAdapter(provider, impl)` 注册，impl 必须实现：

```js
{
  // 向服务商创建支付，返回标准字段
  async createIntent({ orderId, amountMinor, currency, metadata, config, idempotencyKey }) {
    return { providerIntentId, clientSecret, status }; // status: 'pending' | 'succeeded'
  },
  // 回调验签 + 解析为标准字段（验签失败请 throw）
  async confirmWebhook({ payload, headers, config }) {
    return { eventId, eventType, providerIntentId, status, amountMinor, currency };
    // status: 'succeeded' 时才会推进订单；eventId 必填（幂等键）
  },
  // 退款
  async refund({ providerIntentId, amountMinor, currency, reason, config }) {
    return { refundId, status };
  },
  // 可选：连通性测试，供管理端「测试连通性」按钮用
  async verifyConfig(config) { return { ok: true, reason: 'OK' }; }
}
```

接入顺序：先 Stripe + PayPal（P0），验证全流程后再做 P1、P2。

## 四、安全与口径（不可绕过）

1. **密钥只存服务端** `payment_providers.config`，接口只回末 4 位提示（`credentialHint`），绝不回显完整密钥。
2. **支付成功以服务商回调为准**：前端跳成功页不算；必须 `confirmWebhook` 验签通过、`status === 'succeeded'`、且回调金额/币种与服务端创建的 `payment_intents` 一致。
3. **回调幂等**：按 `provider + event_id` 唯一去重，重复通知不重复入账、不重复发货。
4. **订单联动沿用既有口径**：回调确认后调用注入的 `orderStore.recordPayment()`，订单状态推进与 Purchase 事件写入仍走 `storefront-orders.js`（status 变 paid 时触发），不另起一套。
5. **销售额以 ALSVID 订单与财务数据为准**，不取服务商报表；不向服务商/分析工具上报邮箱、用户 ID、订单号等 PII。
6. **手动收款不受影响**：bank_transfer / cash / other 的后台登记流程保持原样，线上支付只是新增通道。

## 五、验证清单（迁移 180 应用后）

- [ ] 在 Neon 测试分支应用迁移 180，确认 3 张表建成
- [ ] 写一个假适配器注册进去，走通 createIntent → handleWebhook → 订单变 paid → ecom_events 出现 Purchase
- [ ] 重复发送同一 event_id，确认不重复入账（幂等）
- [ ] 篡改回调金额，确认被拒且 webhook_events 记录 failed
- [ ] 管理端未配置时显示 NOT_CONFIGURED / NOT_IMPLEMENTED，不显示「已就绪」
- [ ] 正式环境部署前完成 Stripe + PayPal 真实沙箱测试

## 六、迁移应用原则

迁移 180 与 178/179 一样，须在 **Neon 测试分支** 验证后再进正式库；本机未应用（health 显示 `pendingOptionalMigrations` 含 180 属正常，不阻断 8089）。
