BEGIN;

CREATE TABLE alsvid_v2.product_creation_drafts (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  user_uuid uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('vehicle','part')),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_uuid,kind),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

COMMIT;
