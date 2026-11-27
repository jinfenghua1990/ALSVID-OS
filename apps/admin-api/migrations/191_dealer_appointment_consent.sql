BEGIN;
ALTER TABLE alsvid_v2.store_appointments ADD COLUMN dealer_contact_consent boolean NOT NULL DEFAULT false;
COMMIT;
