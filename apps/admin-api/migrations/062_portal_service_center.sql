BEGIN;

ALTER TABLE alsvid_v2.portal_service_requests
  ADD COLUMN service_center_uuid uuid REFERENCES alsvid_v2.service_centers(id);

CREATE INDEX portal_service_requests_service_center
  ON alsvid_v2.portal_service_requests(service_center_uuid)
  WHERE service_center_uuid IS NOT NULL;

COMMIT;
