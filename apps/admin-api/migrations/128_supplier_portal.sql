BEGIN;
ALTER TABLE alsvid_v2.procurement_supplier_confirmations ADD COLUMN client_request_id uuid;
ALTER TABLE alsvid_v2.procurement_supplier_confirmations ADD COLUMN expected_version integer;
ALTER TABLE alsvid_v2.procurement_supplier_confirmations ADD COLUMN request_payload jsonb;
CREATE UNIQUE INDEX procurement_supplier_confirmation_request ON alsvid_v2.procurement_supplier_confirmations(purchase_order_id,client_request_id) WHERE client_request_id IS NOT NULL;
CREATE TABLE alsvid_v2.supplier_portal_memberships (
  user_id text PRIMARY KEY REFERENCES alsvid_v2.app_users(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by text,
  revoked_at timestamptz,
  CHECK ((status='ACTIVE' AND revoked_at IS NULL) OR (status='REVOKED' AND revoked_at IS NOT NULL))
);
CREATE INDEX supplier_portal_memberships_partner ON alsvid_v2.supplier_portal_memberships(partner_id) WHERE status='ACTIVE';
ALTER TABLE alsvid_v2.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE alsvid_v2.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin','viewer','owner','dealer','supplier'));
COMMIT;
