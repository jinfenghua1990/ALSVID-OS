BEGIN;
CREATE TABLE alsvid_v2.consumer_registration_challenges (
 id uuid PRIMARY KEY, email text NOT NULL, code_hash text NOT NULL CHECK(code_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), used_at timestamptz, delivered boolean NOT NULL DEFAULT false
);
CREATE INDEX consumer_registration_email_idx ON alsvid_v2.consumer_registration_challenges(email,created_at DESC);
CREATE INDEX consumer_registration_created_idx ON alsvid_v2.consumer_registration_challenges(created_at);
CREATE TABLE alsvid_v2.consumer_registrations (
 user_id text PRIMARY KEY REFERENCES alsvid_v2.app_users(id), email_verified_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
