BEGIN;
CREATE TABLE alsvid_v2.shipping_rate_template_versions (
 id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 warehouse_id text NOT NULL REFERENCES alsvid_v2.warehouses(id) ON DELETE RESTRICT,
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by text NOT NULL DEFAULT '',
 PRIMARY KEY(id,revision)
);
CREATE INDEX shipping_rate_template_warehouse_idx ON alsvid_v2.shipping_rate_template_versions(warehouse_id);
COMMIT;
