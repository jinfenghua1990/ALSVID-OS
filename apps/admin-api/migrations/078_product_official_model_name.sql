ALTER TABLE alsvid_v2.products
  ADD COLUMN IF NOT EXISTS official_model_name text NOT NULL DEFAULT '';

-- Recover values entered by the intermediate editor without interpreting a
-- sales title as a manufacturing name. Other product parameters stay intact.
UPDATE alsvid_v2.products
SET official_model_name = specs->>'_officialModelName',
    specs = specs - '_officialModelName'
WHERE specs ? '_officialModelName'
  AND jsonb_typeof(specs->'_officialModelName') = 'string'
  AND official_model_name = '';
