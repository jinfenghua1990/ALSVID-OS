-- Promote portal account, vehicle, and service references to UUID foreign keys.
-- Legacy identifiers remain for current portal APIs and synchronization triggers.
BEGIN;

ALTER TABLE alsvid_v2.app_sessions
  ADD CONSTRAINT app_sessions_user_uuid_direct_fk FOREIGN KEY (user_uuid) REFERENCES alsvid_v2.app_users(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.portal_account_reviews
  ADD CONSTRAINT portal_account_reviews_user_uuid_direct_fk FOREIGN KEY (user_uuid) REFERENCES alsvid_v2.app_users(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.portal_service_requests
  ADD CONSTRAINT portal_service_requests_repair_uuid_direct_fk FOREIGN KEY (repair_uuid) REFERENCES alsvid_v2.repairs(entity_uuid) NOT VALID,
  ADD CONSTRAINT portal_service_requests_user_uuid_direct_fk FOREIGN KEY (user_uuid) REFERENCES alsvid_v2.app_users(entity_uuid) NOT VALID,
  ADD CONSTRAINT portal_service_requests_vin_uuid_direct_fk FOREIGN KEY (vin_uuid) REFERENCES alsvid_v2.vins(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.portal_vehicle_access
  ADD CONSTRAINT portal_vehicle_access_request_uuid_direct_fk FOREIGN KEY (request_uuid) REFERENCES alsvid_v2.portal_vehicle_requests(entity_uuid) NOT VALID,
  ADD CONSTRAINT portal_vehicle_access_user_uuid_direct_fk FOREIGN KEY (user_uuid) REFERENCES alsvid_v2.app_users(entity_uuid) NOT VALID,
  ADD CONSTRAINT portal_vehicle_access_vin_uuid_direct_fk FOREIGN KEY (vin_uuid) REFERENCES alsvid_v2.vins(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.portal_vehicle_requests
  ADD CONSTRAINT portal_vehicle_requests_user_uuid_direct_fk FOREIGN KEY (user_uuid) REFERENCES alsvid_v2.app_users(entity_uuid) NOT VALID;

ALTER TABLE alsvid_v2.app_sessions VALIDATE CONSTRAINT app_sessions_user_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_account_reviews VALIDATE CONSTRAINT portal_account_reviews_user_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_service_requests VALIDATE CONSTRAINT portal_service_requests_repair_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_service_requests VALIDATE CONSTRAINT portal_service_requests_user_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_service_requests VALIDATE CONSTRAINT portal_service_requests_vin_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_vehicle_access VALIDATE CONSTRAINT portal_vehicle_access_request_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_vehicle_access VALIDATE CONSTRAINT portal_vehicle_access_user_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_vehicle_access VALIDATE CONSTRAINT portal_vehicle_access_vin_uuid_direct_fk;
ALTER TABLE alsvid_v2.portal_vehicle_requests VALIDATE CONSTRAINT portal_vehicle_requests_user_uuid_direct_fk;

ALTER TABLE alsvid_v2.app_sessions
  DROP CONSTRAINT app_sessions_user_id_fkey,
  DROP CONSTRAINT app_sessions_user_identity_fk;
ALTER TABLE alsvid_v2.portal_account_reviews
  DROP CONSTRAINT portal_account_reviews_user_id_fkey,
  DROP CONSTRAINT portal_account_reviews_user_identity_fk;
ALTER TABLE alsvid_v2.portal_service_requests
  DROP CONSTRAINT portal_service_requests_repair_id_fkey,
  DROP CONSTRAINT portal_service_requests_repair_identity_fk,
  DROP CONSTRAINT portal_service_requests_user_id_fkey,
  DROP CONSTRAINT portal_service_requests_user_identity_fk,
  DROP CONSTRAINT portal_service_requests_vin_id_fkey,
  DROP CONSTRAINT portal_service_requests_vin_identity_fk;
ALTER TABLE alsvid_v2.portal_vehicle_access
  DROP CONSTRAINT portal_vehicle_access_request_id_fkey,
  DROP CONSTRAINT portal_vehicle_access_request_identity_fk,
  DROP CONSTRAINT portal_vehicle_access_user_id_fkey,
  DROP CONSTRAINT portal_vehicle_access_user_identity_fk,
  DROP CONSTRAINT portal_vehicle_access_vin_id_fkey,
  DROP CONSTRAINT portal_vehicle_access_vin_identity_fk;
ALTER TABLE alsvid_v2.portal_vehicle_requests
  DROP CONSTRAINT portal_vehicle_requests_user_id_fkey,
  DROP CONSTRAINT portal_vehicle_requests_user_identity_fk;

COMMIT;
