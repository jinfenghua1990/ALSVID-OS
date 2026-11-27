BEGIN;
CREATE TABLE alsvid_v2.dealer_asset_publications(
 asset_id uuid PRIMARY KEY REFERENCES alsvid_v2.media_assets(id) ON DELETE CASCADE,
 checksum text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 published_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.dealer_notices(
 id uuid PRIMARY KEY, company_id uuid REFERENCES alsvid_v2.dealer_companies(id),
 kind text NOT NULL CHECK(kind IN ('policy','price','product','promotion')),
 translations jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dealer_notices_active ON alsvid_v2.dealer_notices(company_id,created_at DESC) WHERE enabled;
COMMIT;
