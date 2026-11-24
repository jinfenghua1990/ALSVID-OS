BEGIN;

-- production-orders workspace (V2) stores order pricing directly on the order.
-- These columns are referenced by postgres-service.js but were never migrated.
ALTER TABLE alsvid_v2.production_orders
  ADD COLUMN IF NOT EXISTS order_date date,
  ADD COLUMN IF NOT EXISTS unit_price numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'CNY',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate_source text NOT NULL DEFAULT 'CNY 固定汇率',
  ADD COLUMN IF NOT EXISTS expected_delivery_date date;

-- Backfill the single legacy order from its existing cost fields so the
--工作台 can render real data without inventing values.
UPDATE alsvid_v2.production_orders
SET order_date = COALESCE(order_date, created_at::date),
    unit_price = CASE WHEN unit_price = 0 AND planned_quantity > 0
                      THEN COALESCE(supplier_cost, 0)
                      ELSE unit_price END,
    currency = COALESCE(NULLIF(cost_currency, ''), 'CNY'),
    exchange_rate = CASE WHEN exchange_rate = 1 AND COALESCE(NULLIF(cost_currency, ''), 'CNY') <> 'CNY'
                         THEN 1 ELSE exchange_rate END
WHERE order_date IS NULL;

COMMIT;
