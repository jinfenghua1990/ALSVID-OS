CREATE TABLE IF NOT EXISTS alsvid_v2.product_versions (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  product_uuid uuid NOT NULL REFERENCES alsvid_v2.products(entity_uuid),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_uuid, label)
);

CREATE OR REPLACE FUNCTION alsvid_v2.guard_product_version_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Product version snapshots are immutable' USING ERRCODE='23514';
END $$;

CREATE TRIGGER product_version_immutable
BEFORE UPDATE OR DELETE ON alsvid_v2.product_versions
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_product_version_immutable();
