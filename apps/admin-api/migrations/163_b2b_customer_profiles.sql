BEGIN;
ALTER TABLE alsvid_v2.customers
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS is_b2b boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'B2B 经销商',
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS contact text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country_cn text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '';
ALTER TABLE alsvid_v2.production_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES alsvid_v2.customers(id);
CREATE INDEX IF NOT EXISTS production_orders_customer
  ON alsvid_v2.production_orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_unique
  ON alsvid_v2.customers(code) WHERE code IS NOT NULL;
COMMIT;
