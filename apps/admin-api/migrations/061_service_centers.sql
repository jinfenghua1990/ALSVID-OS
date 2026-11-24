BEGIN;

CREATE TABLE alsvid_v2.service_centers (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  code text NOT NULL UNIQUE CHECK (length(trim(code)) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  country text NOT NULL DEFAULT '',
  region text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '待审核' CHECK (status IN ('待审核','启用','停用')),
  note text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

ALTER TABLE alsvid_v2.repairs
  ADD COLUMN service_center_uuid uuid REFERENCES alsvid_v2.service_centers(id);

CREATE INDEX repairs_service_center ON alsvid_v2.repairs(service_center_uuid) WHERE service_center_uuid IS NOT NULL;

COMMIT;
