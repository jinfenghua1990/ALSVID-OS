-- 销售订单（B2B 销售订单中心）
-- 目的：补齐 8090 OMS 的「订单中心」能力到 V2.0 正式库。
-- 只新增表与索引，不改动任何存量表结构，可在生产库安全重跑。
BEGIN;

-- 单号序列：SO-YYYYMM-NNN，按月不重置，保证全局唯一
CREATE SEQUENCE IF NOT EXISTS alsvid_v2.sales_order_no_seq START 1;

CREATE TABLE IF NOT EXISTS alsvid_v2.sales_orders (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_no text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'B2B' CHECK (channel IN ('B2B','B2C','SAMPLE')),
  customer_id uuid REFERENCES alsvid_v2.customers(id),
  customer_name text NOT NULL DEFAULT '',
  consignee_name text NOT NULL DEFAULT '',
  consignee_country text NOT NULL DEFAULT '',
  consignee_address text NOT NULL DEFAULT '',
  consignee_phone text NOT NULL DEFAULT '',
  consignee_email text NOT NULL DEFAULT '',
  sku_uuid uuid REFERENCES alsvid_v2.skus(entity_uuid),
  sku_code text NOT NULL,
  product_name text NOT NULL DEFAULT '',
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY','EUR','USD')),
  sale_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK (sale_amount >= 0),
  fulfillment_type text NOT NULL DEFAULT 'FACTORY_DROPSHIP'
    CHECK (fulfillment_type IN ('WAREHOUSE_PICK','FACTORY_DROPSHIP')),
  fulfillment_reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'WAIT_PRODUCTION'
    CHECK (status IN ('WAIT_PRODUCTION','IN_PRODUCTION','READY_TO_SHIP','IN_TRANSIT','DELIVERED','COMPLETED','CANCELLED')),
  due_date date,
  warehouse_uuid uuid REFERENCES alsvid_v2.warehouses(entity_uuid),
  production_order_uuid uuid REFERENCES alsvid_v2.production_orders(entity_uuid),
  delivery_uuid uuid REFERENCES alsvid_v2.production_deliveries(entity_uuid),
  vin text NOT NULL DEFAULT '',
  motor_no text NOT NULL DEFAULT '',
  -- 物流信息直接落在销售订单上：仓库现货出库不产生生产发运单，也需要能查到运单
  carrier text NOT NULL DEFAULT '',
  tracking_no text NOT NULL DEFAULT '',
  eta_date date,
  factory_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (factory_cost >= 0),
  freight_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (freight_cost >= 0),
  total_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  note text NOT NULL DEFAULT '',
  cancel_reason text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  production_started_at timestamptz,
  ready_to_ship_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS sales_orders_created_idx ON alsvid_v2.sales_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS sales_orders_status_created_idx ON alsvid_v2.sales_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_orders_customer_idx ON alsvid_v2.sales_orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_orders_po_idx ON alsvid_v2.sales_orders(production_order_uuid) WHERE production_order_uuid IS NOT NULL;

-- 订单时间线：每次状态推进写一条，供详情页与审计回溯
CREATE TABLE IF NOT EXISTS alsvid_v2.sales_order_events (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_uuid uuid NOT NULL REFERENCES alsvid_v2.sales_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_order_events_order_idx ON alsvid_v2.sales_order_events(order_uuid, at);

COMMIT;
