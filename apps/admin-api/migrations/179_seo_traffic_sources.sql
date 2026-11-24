-- 179: SEO 与流量中心 —— 数据源连接、同步状态、轻量事件汇总
--
-- 设计边界（对齐需求文档第八章）：
-- 1. 不建第二套分析数据库。外部工具（Plausible/GSC/SerpBear/GoAccess/Cloudflare）负责分析，
--    这里只存「连接配置、同步状态、异常记录」和确有需要的转化事件汇总。
-- 2. API 密钥存服务端配置表，绝不下发给浏览器（接口层会把 secret 置空）。
-- 3. 事件表只收四个转化事件（ViewProduct / AddToCart / BeginCheckout / Purchase），
--    不做通用用户行为分析引擎，不存任何个人身份信息（无 IP、无邮箱、无用户 ID、无订单号）。
-- 4. Purchase 事件只允许由服务端写入（支付回调确认后），浏览器上报会被拒绝。

BEGIN;

-- 数据源连接配置：一个数据源一行。enabled=false 表示主动停用。
CREATE TABLE IF NOT EXISTS alsvid_v2.seo_traffic_sources (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  source text NOT NULL CHECK (source IN ('plausible','gsc','serpbear','goaccess','cloudflare','lighthouse','crux')),
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  -- 连接参数（base_url、site_id、token 等）。secret 只写不读，接口层永不回显。
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  -- 只读凭据的最后 4 位 + 更新时间，用于确认「配的是哪个账号」而不暴露内容
  credential_hint text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source)
);

CREATE TABLE IF NOT EXISTS alsvid_v2.seo_traffic_sync_log (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','error','skipped')),
  -- 同步的数据窗口（如 2026-11-23 ~ 2026-11-24），用于「回补近期数据」的可观测性
  window_start date,
  window_end date,
  rows_synced integer CHECK (rows_synced IS NULL OR rows_synced >= 0),
  message text CHECK (message IS NULL OR length(message) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_traffic_sync_log_source_time_idx
  ON alsvid_v2.seo_traffic_sync_log (source, created_at DESC);

-- 电商转化事件（轻量汇总，非行为分析引擎）。
-- 匿名访客标识由服务端生成随机 id（与账号体系无关），支持同一次访问内的漏斗串联。
CREATE TABLE IF NOT EXISTS alsvid_v2.ecom_events (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  event text NOT NULL CHECK (event IN ('ViewProduct','AddToCart','BeginCheckout','Purchase')),
  -- 商品 / SKU 关联键：只存内部 id，不存用户可读的标题（避免随业务改名而失真）
  product_id text,
  sku text,
  visitor_token text NOT NULL,
  -- 金额仅 Purchase 需要，且只存数字与币种，不存任何订单号
  amount numeric(14,2),
  currency text CHECK (currency IS NULL OR length(currency) = 3),
  country text CHECK (country IS NULL OR length(country) <= 2),
  utm_source text CHECK (utm_source IS NULL OR length(utm_source) <= 100),
  utm_medium text CHECK (utm_source IS NULL OR length(utm_medium) <= 100),
  utm_campaign text CHECK (utm_source IS NULL OR length(utm_campaign) <= 100),
  source text NOT NULL DEFAULT 'browser' CHECK (source IN ('browser','server')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((event = 'Purchase' AND source = 'server') OR event <> 'Purchase')
);
CREATE INDEX IF NOT EXISTS ecom_events_event_time_idx ON alsvid_v2.ecom_events (event, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ecom_events_product_time_idx ON alsvid_v2.ecom_events (product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ecom_events_visitor_idx ON alsvid_v2.ecom_events (visitor_token, occurred_at DESC);

COMMIT;
