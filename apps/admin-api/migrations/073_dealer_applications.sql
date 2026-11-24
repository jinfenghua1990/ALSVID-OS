BEGIN;

CREATE TABLE alsvid_v2.dealer_applications (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  company_name text NOT NULL CHECK(length(trim(company_name)) BETWEEN 1 AND 160),
  country text NOT NULL CHECK(length(trim(country)) BETWEEN 1 AND 100),
  tax_id text NOT NULL DEFAULT '' CHECK(length(tax_id) <= 120),
  address text NOT NULL DEFAULT '' CHECK(length(address) <= 1000),
  contact_name text NOT NULL CHECK(length(trim(contact_name)) BETWEEN 1 AND 120),
  contact_phone text NOT NULL CHECK(length(trim(contact_phone)) BETWEEN 3 AND 80),
  contact_email text NOT NULL CHECK(length(trim(contact_email)) BETWEEN 3 AND 254),
  website text NOT NULL DEFAULT '' CHECK(length(website) <= 300),
  note text NOT NULL DEFAULT '' CHECK(length(note) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decision_note text NOT NULL DEFAULT '' CHECK(length(decision_note) <= 2000),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
  CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND decision_note='')
     OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK(status<>'rejected' OR length(trim(decision_note))>0)
);
CREATE INDEX dealer_applications_status_created_idx ON alsvid_v2.dealer_applications(status,created_at DESC,id);

CREATE FUNCTION alsvid_v2.guard_dealer_application_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'dealer application history is retained' USING ERRCODE='23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.company_name IS DISTINCT FROM OLD.company_name
     OR NEW.country IS DISTINCT FROM OLD.country
     OR NEW.tax_id IS DISTINCT FROM OLD.tax_id
     OR NEW.address IS DISTINCT FROM OLD.address
     OR NEW.contact_name IS DISTINCT FROM OLD.contact_name
     OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
     OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
     OR NEW.website IS DISTINCT FROM OLD.website
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR OLD.status<>'pending'
     OR NEW.status NOT IN ('approved','rejected')
     OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'only a pending dealer application can be reviewed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dealer_applications_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_applications
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_dealer_application_history();

COMMIT;
