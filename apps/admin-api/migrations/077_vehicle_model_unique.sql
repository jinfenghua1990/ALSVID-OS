-- Fail safely if historical data contains duplicate vehicle model codes.
-- Resolve duplicates and their business associations before applying this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM alsvid_v2.products
    WHERE kind = 'vehicle' AND btrim(model) <> ''
    GROUP BY upper(btrim(model)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate vehicle model codes exist; audit associations before migration';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS products_vehicle_model_unique
  ON alsvid_v2.products (upper(btrim(model)))
  WHERE kind = 'vehicle' AND btrim(model) <> '';
