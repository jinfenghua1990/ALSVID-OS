BEGIN;
CREATE TABLE alsvid_v2.production_delivery_vins (
 delivery_uuid uuid NOT NULL REFERENCES alsvid_v2.production_deliveries(entity_uuid),
 vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid),
 assigned_by text NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(delivery_uuid,vin_uuid), UNIQUE(vin_uuid)
);
CREATE INDEX production_delivery_vins_vin ON alsvid_v2.production_delivery_vins(vin_uuid);
COMMIT;
