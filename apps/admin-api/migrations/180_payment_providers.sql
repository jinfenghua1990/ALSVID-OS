-- 180: 线上支付统一适配层 —— 服务商配置、支付意图、回调幂等
--
-- 设计边界（对齐需求文档第五章支付优先级与集成验收约束）：
-- 1. 统一支付接口适配层：6 种支付方式共用同一套 createIntent / handleWebhook / refund / status 接口，
--    每个服务商只是一个适配器实现，业务代码（订单、库存、发货）不感知具体服务商。
-- 2. 本迁移只建「骨架表」：适配器未实现服务商返回明确的 NOT_IMPLEMENTED / NOT_CONFIGURED，
--    绝不伪造成功结果； Payment Intent 只有服务商回调确认后才会推进订单状态。
-- 3. API 密钥只存服务端配置表，接口层永不回显（只回 credential_hint 末 4 位）。
-- 4. webhook 事件按 provider + event_id 幂等去重，重复回调不重复入账、不重复发货。
-- 5. 不改动现有订单/财务表：支付成功后沿用 storefront-orders.recordPayment 的既有口径写收款与 Purchase 事件。
-- 6. 测试库隔离：本迁移与 179 一样，须在 Neon 测试分支验证后才进入正式库。

BEGIN;

-- 支付方式配置：一个 provider 一行，未配置/未启用是明确状态而非静默降级
CREATE TABLE IF NOT EXISTS alsvid_v2.payment_providers (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  provider text NOT NULL CHECK (provider IN ('stripe','paypal','apple_pay','google_pay','klarna','sepa')),
  display_name text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('P0','P1','P2')),
  enabled boolean NOT NULL DEFAULT false,
  adapter_status text NOT NULL DEFAULT 'NOT_IMPLEMENTED' CHECK (adapter_status IN ('NOT_IMPLEMENTED','NOT_CONFIGURED','READY','DISABLED')),
  -- 密钥与商户号等配置只写不读，接口层永不回显
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  credential_hint text,
  last_test_at timestamptz,
  last_test_result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

COMMENT ON COLUMN alsvid_v2.payment_providers.adapter_status IS
  'NOT_IMPLEMENTED=适配层尚未接入该服务商；NOT_CONFIGURED=适配器就绪但缺凭据；READY=已配置可测试；DISABLED=主动停用';

-- 支付意图：创建支付时写一行，回调确认后更新状态；金额以 minor 单位（分）存储
CREATE TABLE IF NOT EXISTS alsvid_v2.payment_intents (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('stripe','paypal','apple_pay','google_pay','klarna','sepa')),
  provider_intent_id text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','pending','succeeded','failed','cancelled','refunded')),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (idempotency_key),
  UNIQUE (provider, provider_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_order ON alsvid_v2.payment_intents(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON alsvid_v2.payment_intents(status) WHERE status IN ('created','pending');

-- 回调事件幂等表：provider + event_id 唯一，重复回调直接返回已处理，不重复入账
CREATE TABLE IF NOT EXISTS alsvid_v2.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  provider text NOT NULL CHECK (provider IN ('stripe','paypal','apple_pay','google_pay','klarna','sepa')),
  event_id text NOT NULL,
  event_type text NOT NULL,
  intent_id uuid REFERENCES alsvid_v2.payment_intents(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_received ON alsvid_v2.payment_webhook_events(received_at DESC);

COMMIT;
