BEGIN;
CREATE TABLE alsvid_v2.dealer_companies (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
 country text NOT NULL DEFAULT '', tax_id text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
 contact_name text NOT NULL DEFAULT '', contact_phone text NOT NULL DEFAULT '', contact_email text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.dealer_company_memberships (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), dealer_user_uuid uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
 company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id), reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 assigned_by text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 CHECK(ended_at IS NULL OR ended_at>=started_at),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX dealer_company_one_current ON alsvid_v2.dealer_company_memberships(dealer_user_uuid) WHERE ended_at IS NULL;
CREATE FUNCTION alsvid_v2.guard_dealer_company_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'membership history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL OR (to_jsonb(NEW)-'ended_at') IS DISTINCT FROM (to_jsonb(OLD)-'ended_at') THEN
  RAISE EXCEPTION 'membership history is immutable except for closing' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_dealer_company_membership BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_company_memberships FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_dealer_company_membership();
COMMIT;
