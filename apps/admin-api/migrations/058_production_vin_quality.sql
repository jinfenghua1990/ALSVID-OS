BEGIN;

CREATE TABLE alsvid_v2.production_vin_quality (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_uuid uuid NOT NULL REFERENCES alsvid_v2.production_orders(entity_uuid),
  vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid),
  result text NOT NULL CHECK (result IN ('合格','不合格')),
  note text NOT NULL,
  inspected_by text NOT NULL,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_uuid,vin_uuid)
);

COMMIT;
