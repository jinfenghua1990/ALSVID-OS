BEGIN;
CREATE TABLE alsvid_v2.dealer_application_metadata (
  application_id uuid PRIMARY KEY REFERENCES alsvid_v2.dealer_applications(id) ON DELETE RESTRICT,
  partnership_type text NOT NULL CHECK (partnership_type IN ('retail','demo','service','multiple')),
  locale text NOT NULL CHECK (locale IN ('zh','en','de')),
  consent_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
