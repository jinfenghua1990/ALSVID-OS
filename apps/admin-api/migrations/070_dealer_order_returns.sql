BEGIN;

CREATE TABLE alsvid_v2.dealer_order_return_requests (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL REFERENCES alsvid_v2.dealer_orders(id),
  dealer_user_uuid uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','received')),
  review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=2000),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX dealer_order_returns_one_open_per_order
  ON alsvid_v2.dealer_order_return_requests(order_id) WHERE status IN ('pending','approved');
CREATE INDEX dealer_order_returns_dealer_created
  ON alsvid_v2.dealer_order_return_requests(dealer_user_uuid,created_at DESC);

CREATE TABLE alsvid_v2.dealer_order_return_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  request_id uuid NOT NULL REFERENCES alsvid_v2.dealer_order_return_requests(id),
  order_item_id uuid NOT NULL REFERENCES alsvid_v2.dealer_order_items(id),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000),
  UNIQUE(request_id,order_item_id),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.dealer_order_return_receipts (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  request_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.dealer_order_return_requests(id),
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  received_by text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.dealer_order_return_receipt_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  receipt_id uuid NOT NULL REFERENCES alsvid_v2.dealer_order_return_receipts(id),
  return_item_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.dealer_order_return_items(id),
  received_quantity integer NOT NULL CHECK(received_quantity>=0),
  disposition text NOT NULL CHECK(disposition IN ('restocked','not_restocked','not_received')),
  warehouse_uuid uuid REFERENCES alsvid_v2.warehouses(entity_uuid),
  stock_movement_uuid uuid UNIQUE REFERENCES alsvid_v2.stock_movements(entity_uuid),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  CHECK((disposition='restocked' AND received_quantity>0 AND warehouse_uuid IS NOT NULL AND stock_movement_uuid IS NOT NULL)
     OR (disposition='not_restocked' AND received_quantity>0 AND warehouse_uuid IS NULL AND stock_movement_uuid IS NULL)
     OR (disposition='not_received' AND received_quantity=0 AND warehouse_uuid IS NULL AND stock_movement_uuid IS NULL)),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.dealer_order_return_refunds (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  return_id uuid NOT NULL REFERENCES alsvid_v2.dealer_order_return_requests(id),
  amount numeric(18,2) NOT NULL CHECK(amount>0),
  reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  recorded_by text NOT NULL,
  refunded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reference),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE FUNCTION alsvid_v2.reject_dealer_return_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'dealer return history is append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_dealer_order_return_items BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_return_items
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_return_history_mutation();
CREATE TRIGGER guard_dealer_order_return_receipts BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_return_receipts
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_return_history_mutation();
CREATE TRIGGER guard_dealer_order_return_receipt_items BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_return_receipt_items
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_return_history_mutation();
CREATE TRIGGER guard_dealer_order_return_refunds BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_return_refunds
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_return_history_mutation();

COMMIT;
