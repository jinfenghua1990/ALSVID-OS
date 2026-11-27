BEGIN;
ALTER TABLE alsvid_v2.storefront_orders DROP CONSTRAINT storefront_orders_status_check;
ALTER TABLE alsvid_v2.storefront_orders ADD CONSTRAINT storefront_orders_status_check CHECK(status IN ('submitted','quoted','accepted','allocated','partially_paid','paid','partially_shipped','shipped','delivered','declined','cancelled'));
CREATE TABLE alsvid_v2.storefront_order_parcels(
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES alsvid_v2.storefront_orders(id),
 component text NOT NULL CHECK(component IN ('body','battery','accessory')),
 carrier text NOT NULL CHECK(length(trim(carrier)) BETWEEN 1 AND 120),
 tracking_no text NOT NULL CHECK(length(trim(tracking_no)) BETWEEN 1 AND 120),
 battery_approved boolean NOT NULL DEFAULT false CHECK(component<>'battery' OR battery_approved),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 shipped_by text NOT NULL, shipped_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,order_id),UNIQUE(order_id,carrier,tracking_no)
);
CREATE INDEX storefront_order_parcels_order ON alsvid_v2.storefront_order_parcels(order_id,shipped_at);
CREATE TABLE alsvid_v2.storefront_order_parcel_items(
 parcel_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 PRIMARY KEY(parcel_id,item_id),
 FOREIGN KEY(parcel_id,order_id) REFERENCES alsvid_v2.storefront_order_parcels(id,order_id),
 FOREIGN KEY(item_id,order_id) REFERENCES alsvid_v2.storefront_order_items(id,order_id)
);
CREATE INDEX storefront_order_parcel_items_item ON alsvid_v2.storefront_order_parcel_items(item_id);
CREATE TABLE alsvid_v2.storefront_order_parcel_receipts(
 parcel_id uuid PRIMARY KEY,order_id uuid NOT NULL,confirmed_by uuid REFERENCES alsvid_v2.app_users(entity_uuid),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),received_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(parcel_id,order_id) REFERENCES alsvid_v2.storefront_order_parcels(id,order_id)
);
CREATE TRIGGER guard_storefront_order_parcels BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_parcels FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
CREATE TRIGGER guard_storefront_order_parcel_items BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_parcel_items FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
CREATE TRIGGER guard_storefront_order_parcel_receipts BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_parcel_receipts FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
CREATE TRIGGER validate_storefront_parcel_receipt_owner BEFORE INSERT ON alsvid_v2.storefront_order_parcel_receipts FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_storefront_receipt_owner();
COMMIT;
