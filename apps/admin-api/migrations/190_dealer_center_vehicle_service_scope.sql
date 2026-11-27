BEGIN;
ALTER TABLE alsvid_v2.portal_vehicle_requests ADD COLUMN center_membership_id uuid REFERENCES alsvid_v2.dealer_company_memberships(id);
ALTER TABLE alsvid_v2.portal_service_requests ADD COLUMN center_membership_id uuid REFERENCES alsvid_v2.dealer_company_memberships(id);
CREATE INDEX portal_vehicle_requests_center_membership ON alsvid_v2.portal_vehicle_requests(center_membership_id) WHERE center_membership_id IS NOT NULL;
CREATE INDEX portal_service_requests_center_membership ON alsvid_v2.portal_service_requests(center_membership_id) WHERE center_membership_id IS NOT NULL;
COMMIT;
