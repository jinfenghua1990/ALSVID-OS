BEGIN;
CREATE TABLE alsvid_v2.test_ride_enquiries (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 80),
  email text NOT NULL CHECK (length(email) BETWEEN 5 AND 254),
  country_code text NOT NULL CHECK (country_code IN ('DE', 'AT')),
  city text NOT NULL CHECK (length(city) BETWEEN 2 AND 80),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 40),
  colour text NOT NULL CHECK (length(colour) BETWEEN 1 AND 60),
  locale text NOT NULL CHECK (locale IN ('zh', 'de', 'en')),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWING', 'CONTACTED', 'CLOSED')),
  notification_state text NOT NULL DEFAULT 'UNCONFIGURED' CHECK (notification_state IN ('UNCONFIGURED', 'PENDING', 'SENT', 'FAILED')),
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  consent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_ride_enquiries_recent_idx ON alsvid_v2.test_ride_enquiries(created_at DESC);
CREATE INDEX test_ride_enquiries_email_idx ON alsvid_v2.test_ride_enquiries(lower(email),created_at DESC);
CREATE TABLE alsvid_v2.test_ride_review_events (
  id uuid PRIMARY KEY,
  enquiry_id uuid NOT NULL REFERENCES alsvid_v2.test_ride_enquiries(id),
  previous_status text NOT NULL CHECK (previous_status IN ('NEW', 'REVIEWING', 'CONTACTED', 'CLOSED')),
  status text NOT NULL CHECK (status IN ('NEW', 'REVIEWING', 'CONTACTED', 'CLOSED')),
  note text NOT NULL CHECK (length(note) <= 2000),
  version integer NOT NULL CHECK (version > 1),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enquiry_id, version)
);
CREATE TABLE alsvid_v2.test_ride_rate_limits (
  bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL CHECK (request_count > 0)
);
CREATE INDEX test_ride_rate_limits_window_idx ON alsvid_v2.test_ride_rate_limits(window_started_at);
COMMIT;
