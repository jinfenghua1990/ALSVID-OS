BEGIN;

ALTER TABLE alsvid_v2.skus
  ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE alsvid_v2.skus
  ADD CONSTRAINT skus_attributes_object CHECK (jsonb_typeof(attributes)='object');

COMMIT;
