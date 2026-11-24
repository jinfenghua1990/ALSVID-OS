BEGIN;

CREATE TABLE alsvid_v2.site_pages (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  slug text NOT NULL UNIQUE CHECK (slug='home'),
  draft jsonb,
  published jsonb,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  published_revision integer,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (published IS NULL OR published_revision IS NOT NULL),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

INSERT INTO alsvid_v2.site_pages(slug) VALUES('home');

COMMIT;
