BEGIN;
CREATE TABLE alsvid_v2.production_delivery_receipt_vins (
 receipt_uuid uuid NOT NULL REFERENCES alsvid_v2.production_delivery_receipts(entity_uuid),
 vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid),
 PRIMARY KEY(receipt_uuid,vin_uuid), UNIQUE(vin_uuid)
);
COMMIT;
