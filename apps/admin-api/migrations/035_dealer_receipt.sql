BEGIN;
ALTER TABLE alsvid_v2.dealer_orders DROP CONSTRAINT dealer_orders_status_check;
ALTER TABLE alsvid_v2.dealer_orders ADD CONSTRAINT dealer_orders_status_check CHECK (status IN ('submitted','quoted','accepted','allocated','shipped','delivered','declined','rejected','cancelled'));
ALTER TABLE alsvid_v2.dealer_order_shipments ADD CONSTRAINT dealer_shipments_id_order_unique UNIQUE(id,order_id);
CREATE TABLE alsvid_v2.dealer_order_receipts (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 order_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.dealer_orders(id),
 shipment_id uuid NOT NULL UNIQUE,
 confirmed_by uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
 note text NOT NULL DEFAULT '', received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(shipment_id,order_id) REFERENCES alsvid_v2.dealer_order_shipments(id,order_id),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE FUNCTION alsvid_v2.validate_dealer_order_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM alsvid_v2.dealer_orders WHERE id=NEW.order_id AND dealer_user_uuid=NEW.confirmed_by) THEN
  RAISE EXCEPTION 'dealer receipt owner mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_dealer_order_receipt BEFORE INSERT ON alsvid_v2.dealer_order_receipts FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_dealer_order_receipt();
CREATE FUNCTION alsvid_v2.guard_dealer_order_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'dealer receipt records are immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_dealer_order_receipt BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_receipts FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_dealer_order_receipt();
COMMIT;
