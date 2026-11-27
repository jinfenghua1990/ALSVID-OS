BEGIN;
CREATE TABLE alsvid_v2.dealer_membership_roles (
 membership_id uuid PRIMARY KEY REFERENCES alsvid_v2.dealer_company_memberships(id),
 business_role text NOT NULL CHECK(business_role IN ('legacy','pending','company_admin','procurement','finance','store_manager','store_staff','service')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO alsvid_v2.dealer_membership_roles(membership_id,business_role,updated_by)
 SELECT id,'legacy','migration 192' FROM alsvid_v2.dealer_company_memberships WHERE ended_at IS NULL;
COMMIT;
