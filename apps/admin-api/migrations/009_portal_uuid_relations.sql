-- Add UUID v7 identities and UUID relationships to accounts and portals.
BEGIN;

LOCK TABLE alsvid_v2.app_users, alsvid_v2.app_sessions,
  alsvid_v2.portal_account_reviews, alsvid_v2.portal_vehicle_requests,
  alsvid_v2.portal_vehicle_access, alsvid_v2.portal_service_requests,
  alsvid_v2.catalog_publications, alsvid_v2.products, alsvid_v2.vins,
  alsvid_v2.repairs
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'app_users','portal_vehicle_requests','portal_service_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD COLUMN entity_uuid uuid',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7()',tab);
    EXECUTE format('UPDATE alsvid_v2.%I SET entity_uuid=alsvid_v2.generate_uuid_v7() WHERE entity_uuid IS NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET NOT NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I UNIQUE(entity_uuid)',tab,tab||'_entity_uuid_uq');
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I CHECK(substring(entity_uuid::text,15,1)=''7'' AND substring(entity_uuid::text,20,1) IN (''8'',''9'',''a'',''b''))',tab,tab||'_entity_uuid_v7');
  END LOOP;
END;
$$;

UPDATE alsvid_v2.app_users SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.portal_vehicle_requests SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.portal_service_requests SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

CREATE TRIGGER sync_app_users_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.app_users
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_portal_vehicle_requests_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.portal_vehicle_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_portal_service_requests_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.portal_service_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');

ALTER TABLE alsvid_v2.app_users
  ADD CONSTRAINT app_users_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.portal_vehicle_requests
  ADD CONSTRAINT portal_vehicle_requests_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.portal_service_requests
  ADD CONSTRAINT portal_service_requests_id_entity_uuid_uq UNIQUE(id,entity_uuid);

ALTER TABLE alsvid_v2.app_sessions ADD COLUMN user_uuid uuid;
UPDATE alsvid_v2.app_sessions s SET user_uuid=u.entity_uuid
  FROM alsvid_v2.app_users u WHERE u.id=s.user_id;
ALTER TABLE alsvid_v2.app_sessions
  ALTER COLUMN user_uuid SET NOT NULL,
  ADD CONSTRAINT app_sessions_user_identity_fk FOREIGN KEY(user_id,user_uuid)
    REFERENCES alsvid_v2.app_users(id,entity_uuid);
CREATE TRIGGER sync_app_sessions_user_uuid
BEFORE INSERT OR UPDATE OF user_id,user_uuid ON alsvid_v2.app_sessions
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('user_id','user_uuid','app_users','id');

ALTER TABLE alsvid_v2.portal_account_reviews ADD COLUMN user_uuid uuid;
UPDATE alsvid_v2.portal_account_reviews r SET user_uuid=u.entity_uuid
  FROM alsvid_v2.app_users u WHERE u.id=r.user_id;
ALTER TABLE alsvid_v2.portal_account_reviews
  ALTER COLUMN user_uuid SET NOT NULL,
  ADD CONSTRAINT portal_account_reviews_user_identity_fk FOREIGN KEY(user_id,user_uuid)
    REFERENCES alsvid_v2.app_users(id,entity_uuid);
CREATE TRIGGER sync_portal_account_reviews_user_uuid
BEFORE INSERT OR UPDATE OF user_id,user_uuid ON alsvid_v2.portal_account_reviews
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('user_id','user_uuid','app_users','id');

ALTER TABLE alsvid_v2.portal_vehicle_requests
  ADD COLUMN user_uuid uuid;
UPDATE alsvid_v2.portal_vehicle_requests r SET user_uuid=u.entity_uuid
  FROM alsvid_v2.app_users u WHERE u.id=r.user_id;
ALTER TABLE alsvid_v2.portal_vehicle_requests
  ALTER COLUMN user_uuid SET NOT NULL,
  ADD CONSTRAINT portal_vehicle_requests_user_identity_fk FOREIGN KEY(user_id,user_uuid)
    REFERENCES alsvid_v2.app_users(id,entity_uuid);
CREATE TRIGGER sync_portal_vehicle_requests_user_uuid
BEFORE INSERT OR UPDATE OF user_id,user_uuid ON alsvid_v2.portal_vehicle_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('user_id','user_uuid','app_users','id');

ALTER TABLE alsvid_v2.portal_vehicle_access
  ADD COLUMN request_uuid uuid,
  ADD COLUMN user_uuid uuid,
  ADD COLUMN vin_uuid uuid;
UPDATE alsvid_v2.portal_vehicle_access a SET request_uuid=r.entity_uuid
  FROM alsvid_v2.portal_vehicle_requests r WHERE r.id=a.request_id;
UPDATE alsvid_v2.portal_vehicle_access a SET user_uuid=u.entity_uuid
  FROM alsvid_v2.app_users u WHERE u.id=a.user_id;
UPDATE alsvid_v2.portal_vehicle_access a SET vin_uuid=v.entity_uuid
  FROM alsvid_v2.vins v WHERE v.id=a.vin_id;
ALTER TABLE alsvid_v2.portal_vehicle_access
  ALTER COLUMN request_uuid SET NOT NULL,
  ALTER COLUMN user_uuid SET NOT NULL,
  ALTER COLUMN vin_uuid SET NOT NULL,
  ADD CONSTRAINT portal_vehicle_access_request_identity_fk FOREIGN KEY(request_id,request_uuid)
    REFERENCES alsvid_v2.portal_vehicle_requests(id,entity_uuid),
  ADD CONSTRAINT portal_vehicle_access_user_identity_fk FOREIGN KEY(user_id,user_uuid)
    REFERENCES alsvid_v2.app_users(id,entity_uuid),
  ADD CONSTRAINT portal_vehicle_access_vin_identity_fk FOREIGN KEY(vin_id,vin_uuid)
    REFERENCES alsvid_v2.vins(id,entity_uuid);
CREATE TRIGGER sync_portal_vehicle_access_request_uuid
BEFORE INSERT OR UPDATE OF request_id,request_uuid ON alsvid_v2.portal_vehicle_access
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('request_id','request_uuid','portal_vehicle_requests','id');
CREATE TRIGGER sync_portal_vehicle_access_user_uuid
BEFORE INSERT OR UPDATE OF user_id,user_uuid ON alsvid_v2.portal_vehicle_access
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('user_id','user_uuid','app_users','id');
CREATE TRIGGER sync_portal_vehicle_access_vin_uuid
BEFORE INSERT OR UPDATE OF vin_id,vin_uuid ON alsvid_v2.portal_vehicle_access
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('vin_id','vin_uuid','vins','id');

ALTER TABLE alsvid_v2.portal_service_requests
  ADD COLUMN user_uuid uuid,
  ADD COLUMN vin_uuid uuid;
UPDATE alsvid_v2.portal_service_requests s SET user_uuid=u.entity_uuid
  FROM alsvid_v2.app_users u WHERE u.id=s.user_id;
UPDATE alsvid_v2.portal_service_requests s SET vin_uuid=v.entity_uuid
  FROM alsvid_v2.vins v WHERE v.id=s.vin_id;
ALTER TABLE alsvid_v2.portal_service_requests
  ALTER COLUMN user_uuid SET NOT NULL,
  ALTER COLUMN vin_uuid SET NOT NULL,
  ADD CONSTRAINT portal_service_requests_user_identity_fk FOREIGN KEY(user_id,user_uuid)
    REFERENCES alsvid_v2.app_users(id,entity_uuid),
  ADD CONSTRAINT portal_service_requests_vin_identity_fk FOREIGN KEY(vin_id,vin_uuid)
    REFERENCES alsvid_v2.vins(id,entity_uuid);
CREATE TRIGGER sync_portal_service_requests_user_uuid
BEFORE INSERT OR UPDATE OF user_id,user_uuid ON alsvid_v2.portal_service_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('user_id','user_uuid','app_users','id');
CREATE TRIGGER sync_portal_service_requests_vin_uuid
BEFORE INSERT OR UPDATE OF vin_id,vin_uuid ON alsvid_v2.portal_service_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('vin_id','vin_uuid','vins','id');

ALTER TABLE alsvid_v2.catalog_publications ADD COLUMN product_uuid uuid;
UPDATE alsvid_v2.catalog_publications c SET product_uuid=p.entity_uuid
  FROM alsvid_v2.products p WHERE p.id=c.product_id;
ALTER TABLE alsvid_v2.catalog_publications
  ALTER COLUMN product_uuid SET NOT NULL,
  ADD CONSTRAINT catalog_publications_product_identity_fk FOREIGN KEY(product_id,product_uuid)
    REFERENCES alsvid_v2.products(id,entity_uuid);
CREATE TRIGGER sync_catalog_publications_product_uuid
BEFORE INSERT OR UPDATE OF product_id,product_uuid ON alsvid_v2.catalog_publications
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('product_id','product_uuid','products','id');

COMMIT;
