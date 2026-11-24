-- B2B 项目：分销商协同控制台（附件方案落地）。
-- 企业档案/阶梯价/采购单/多仓履约/RMA 五个实体；UUID v7 由服务端写入，缺省用 generate_uuid_v7()。
-- 相对附件 DDL 的两处必要扩展：订单明细表（支撑按 SKU 下单与等级价计算）、订单已收金额（支撑 UNPAID/PARTIAL/PAID）。
BEGIN;

CREATE TABLE alsvid_v2.distributor_companies (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  company_name varchar(255) NOT NULL CHECK (length(trim(company_name)) > 0),
  vat_number varchar(64) NOT NULL UNIQUE CHECK (length(trim(vat_number)) > 0),
  country_code varchar(8) NOT NULL CHECK (country_code ~ '^[A-Z]{2,8}$'),
  business_type varchar(32) NOT NULL CHECK (business_type IN ('offline_store','online_shop','regional_chain')),
  tier_level varchar(8) NOT NULL DEFAULT 'V1' CHECK (tier_level IN ('V1','V2','V3')),
  credit_limit numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  credit_used numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_used >= 0),
  payment_term_days int NOT NULL DEFAULT 0 CHECK (payment_term_days IN (0,30,60)),
  default_warehouse_code varchar(32) NOT NULL DEFAULT 'CN-CZ-01' CHECK (length(trim(default_warehouse_code)) > 0),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','FROZEN','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (credit_used <= credit_limit)
);

CREATE TABLE alsvid_v2.distributor_tier_pricing (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  sku_code varchar(64) NOT NULL UNIQUE CHECK (length(trim(sku_code)) > 0),
  product_name varchar(255) NOT NULL CHECK (length(trim(product_name)) > 0),
  rrp_eur numeric(10,2) NOT NULL CHECK (rrp_eur >= 0),
  tier_v1_eur numeric(10,2) NOT NULL CHECK (tier_v1_eur >= 0),
  tier_v2_eur numeric(10,2) NOT NULL CHECK (tier_v2_eur >= 0),
  tier_v3_eur numeric(10,2) NOT NULL CHECK (tier_v3_eur >= 0),
  moq int NOT NULL DEFAULT 1 CHECK (moq >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alsvid_v2.distributor_orders (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_no varchar(64) NOT NULL UNIQUE,
  company_id uuid NOT NULL REFERENCES alsvid_v2.distributor_companies(id),
  total_amount_eur numeric(12,2) NOT NULL CHECK (total_amount_eur >= 0),
  paid_amount_eur numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount_eur >= 0),
  payment_method varchar(32) NOT NULL CHECK (payment_method IN ('credit_term','bank_wire','prepaid')),
  payment_status varchar(16) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID','PARTIAL','PAID')),
  status varchar(32) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','PENDING_FULFILLMENT','SHIPPED','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (paid_amount_eur <= total_amount_eur)
);
CREATE INDEX distributor_orders_company_created ON alsvid_v2.distributor_orders(company_id, created_at DESC);

CREATE TABLE alsvid_v2.distributor_order_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL REFERENCES alsvid_v2.distributor_orders(id),
  sku_code varchar(64) NOT NULL,
  product_name varchar(255) NOT NULL,
  quantity int NOT NULL CHECK (quantity >= 1),
  unit_price_eur numeric(10,2) NOT NULL CHECK (unit_price_eur >= 0),
  line_total_eur numeric(12,2) NOT NULL CHECK (line_total_eur >= 0),
  UNIQUE (order_id, sku_code)
);

CREATE FUNCTION alsvid_v2.guard_distributor_order_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'distributor order items are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER guard_distributor_order_items
BEFORE UPDATE OR DELETE ON alsvid_v2.distributor_order_items
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_distributor_order_items();

CREATE TABLE alsvid_v2.distributor_fulfillments (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.distributor_orders(id),
  warehouse_code varchar(32) NOT NULL CHECK (length(trim(warehouse_code)) > 0),
  carrier_name varchar(64) NOT NULL CHECK (length(trim(carrier_name)) > 0),
  tracking_number varchar(128) NOT NULL CHECK (length(trim(tracking_number)) > 0),
  shipping_status varchar(32) NOT NULL DEFAULT 'DISPATCHED' CHECK (shipping_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED')),
  shipped_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE alsvid_v2.distributor_rma (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  rma_no varchar(64) NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES alsvid_v2.distributor_orders(id),
  company_id uuid NOT NULL REFERENCES alsvid_v2.distributor_companies(id),
  serial_number varchar(128) NOT NULL CHECK (length(trim(serial_number)) > 0),
  issue_type varchar(32) NOT NULL CHECK (issue_type IN ('quality_warranty','transit_damage','wrong_delivery')),
  target_warehouse_code varchar(32) NOT NULL CHECK (length(trim(target_warehouse_code)) > 0),
  status varchar(32) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','IN_TRANSIT','INSPECTING','REPLACED','REFUNDED')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX distributor_rma_order ON alsvid_v2.distributor_rma(order_id);
CREATE INDEX distributor_rma_company_created ON alsvid_v2.distributor_rma(company_id, created_at DESC);

COMMIT;