BEGIN;

CREATE TABLE alsvid_v2.storefront_layout_drafts (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  slug text NOT NULL UNIQUE CHECK (slug = 'home'),
  project jsonb NOT NULL CHECK (jsonb_typeof(project) = 'object'),
  version integer NOT NULL CHECK (version > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

COMMIT;
