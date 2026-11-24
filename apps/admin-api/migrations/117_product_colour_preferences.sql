BEGIN;
CREATE TABLE alsvid_v2.product_colour_preferences (
  product_code text NOT NULL CHECK (product_code = 'A1-ULTRA'),
  session_key uuid NOT NULL,
  model_code text NOT NULL CHECK (model_code IN ('standard', 'pro')),
  colour_code text NOT NULL CHECK (colour_code IN ('sample', 'black', 'blue', 'silver')),
  locale text NOT NULL CHECK (locale IN ('zh', 'en', 'de')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_code, session_key)
);
COMMIT;
