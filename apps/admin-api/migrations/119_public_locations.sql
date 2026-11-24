BEGIN;
CREATE TABLE alsvid_v2.public_locations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  country_code text NOT NULL CHECK (country_code IN ('DE','AT')),
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 120),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 500),
  sales boolean NOT NULL DEFAULT false,
  service boolean NOT NULL DEFAULT false,
  approved_for_publication boolean NOT NULL DEFAULT false,
  authorization_active boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
