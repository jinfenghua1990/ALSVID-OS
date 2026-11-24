BEGIN;
CREATE FUNCTION alsvid_v2.guard_dealer_order_shipment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'dealer shipment records are immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_dealer_order_shipment BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_shipments
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_dealer_order_shipment();
COMMIT;
