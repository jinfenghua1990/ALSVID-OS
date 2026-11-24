BEGIN;

CREATE TABLE alsvid_v2.dealer_order_invoices (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.dealer_orders(id),
  invoice_number text NOT NULL UNIQUE CHECK(length(trim(invoice_number)) BETWEEN 1 AND 120),
  issued_on date NOT NULL,
  due_on date,
  currency text NOT NULL CHECK(currency IN ('CNY','EUR')),
  total_amount numeric(18,2) NOT NULL CHECK(total_amount > 0),
  note text NOT NULL DEFAULT '' CHECK(length(note) <= 2000),
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(due_on IS NULL OR due_on >= issued_on),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.dealer_order_invoice_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  invoice_id uuid NOT NULL REFERENCES alsvid_v2.dealer_order_invoices(id),
  order_item_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.dealer_order_items(id),
  sku_code text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK(unit_price >= 0),
  line_total numeric(18,2) NOT NULL CHECK(line_total >= 0),
  CHECK(line_total = quantity * unit_price),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE FUNCTION alsvid_v2.reject_dealer_invoice_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'dealer invoice history is append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_dealer_order_invoices BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_invoices
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_invoice_history_mutation();
CREATE TRIGGER guard_dealer_order_invoice_items BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_invoice_items
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_invoice_history_mutation();

COMMIT;
