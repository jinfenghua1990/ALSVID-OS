BEGIN;

ALTER TABLE alsvid_v2.production_delivery_vins
  ADD COLUMN released_by text,
  ADD COLUMN released_at timestamptz;

UPDATE alsvid_v2.production_delivery_vins a
SET released_by=c.actor,released_at=c.created_at
FROM alsvid_v2.production_delivery_cancellations c
WHERE c.delivery_uuid=a.delivery_uuid AND a.released_at IS NULL;

ALTER TABLE alsvid_v2.production_delivery_vins
  DROP CONSTRAINT production_delivery_vins_vin_uuid_key;

CREATE UNIQUE INDEX production_delivery_vins_active_vin_unique
  ON alsvid_v2.production_delivery_vins(vin_uuid)
  WHERE released_at IS NULL;

COMMIT;
