CREATE TABLE alsvid_v2.storefront_order_parcels(
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES alsvid_v2.storefront_orders(id),
 component text NOT NULL CHECK(component IN ('whole','body','battery')),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items)>0),
 carrier text, tracking_no text, dispatched_at timestamptz, dispatched_by text,
 received_at timestamptz, received_by uuid REFERENCES alsvid_v2.app_users(entity_uuid), guest_received boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((dispatched_at IS NULL AND carrier IS NULL AND tracking_no IS NULL AND dispatched_by IS NULL) OR (dispatched_at IS NOT NULL AND carrier IS NOT NULL AND length(trim(carrier)) BETWEEN 1 AND 120 AND tracking_no IS NOT NULL AND length(trim(tracking_no)) BETWEEN 1 AND 120 AND dispatched_by IS NOT NULL)),
 CHECK (received_at IS NULL OR (dispatched_at IS NOT NULL AND ((received_by IS NOT NULL) <> guest_received))),
 CHECK (received_at IS NOT NULL OR (received_by IS NULL AND NOT guest_received))
);
CREATE INDEX storefront_order_parcels_order_idx ON alsvid_v2.storefront_order_parcels(order_id);
CREATE FUNCTION alsvid_v2.guard_storefront_order_parcel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.dispatched_at IS NOT NULL THEN RAISE EXCEPTION 'dispatched parcel cannot be deleted' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['carrier','tracking_no','dispatched_at','dispatched_by','received_at','received_by','guest_received']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['carrier','tracking_no','dispatched_at','dispatched_by','received_at','received_by','guest_received']) OR
 (OLD.dispatched_at IS NOT NULL AND (NEW.carrier,NEW.tracking_no,NEW.dispatched_at,NEW.dispatched_by) IS DISTINCT FROM (OLD.carrier,OLD.tracking_no,OLD.dispatched_at,OLD.dispatched_by)) OR
 (OLD.received_at IS NOT NULL AND (NEW.received_at,NEW.received_by,NEW.guest_received) IS DISTINCT FROM (OLD.received_at,OLD.received_by,OLD.guest_received)) THEN
 RAISE EXCEPTION 'parcel history is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_storefront_order_parcel BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_parcels FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_order_parcel();
