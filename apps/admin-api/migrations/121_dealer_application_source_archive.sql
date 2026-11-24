BEGIN;
CREATE TABLE alsvid_v2.dealer_application_source_archive (
  source_id uuid PRIMARY KEY,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
