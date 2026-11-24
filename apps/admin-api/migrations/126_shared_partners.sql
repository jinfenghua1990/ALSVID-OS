BEGIN;
CREATE TABLE alsvid_v2.partners (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  legal_name text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  tax_id text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.partner_roles (
  partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('DEALER','SUPPLIER','FACTORY')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, role)
);

CREATE TABLE alsvid_v2.partner_source_links (
  source_type text NOT NULL CHECK (source_type IN ('dealer_company','factory')),
  source_id text NOT NULL,
  partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id),
  UNIQUE (partner_id, source_type, source_id)
);
CREATE INDEX partner_source_links_partner_idx ON alsvid_v2.partner_source_links(partner_id);

WITH source AS MATERIALIZED (
  SELECT id::text AS source_id,alsvid_v2.generate_uuid_v7() AS partner_id,name,country,tax_id,address,contact_name,contact_email,contact_phone
  FROM alsvid_v2.dealer_companies
), imported AS (
  INSERT INTO alsvid_v2.partners(id,display_name,legal_name,country,tax_id,address,contact_name,contact_email,contact_phone)
  SELECT partner_id,name,name,country,tax_id,address,contact_name,contact_email,contact_phone FROM source
  RETURNING id
)
INSERT INTO alsvid_v2.partner_source_links(source_type,source_id,partner_id)
SELECT 'dealer_company',s.source_id,s.partner_id FROM source s JOIN imported i ON i.id=s.partner_id;

INSERT INTO alsvid_v2.partner_roles(partner_id,role)
SELECT l.partner_id,'DEALER'
FROM alsvid_v2.partner_source_links l WHERE l.source_type='dealer_company';

WITH source AS MATERIALIZED (
  SELECT id AS source_id,alsvid_v2.generate_uuid_v7() AS partner_id,name,country,contact,email,phone,address,status
  FROM alsvid_v2.factories
), imported AS (
  INSERT INTO alsvid_v2.partners(id,display_name,legal_name,country,contact_name,contact_email,contact_phone,address,status)
  SELECT partner_id,name,name,country,contact,email,phone,address,
    CASE WHEN status='启用' THEN 'ACTIVE' ELSE 'INACTIVE' END FROM source
  RETURNING id
)
INSERT INTO alsvid_v2.partner_source_links(source_type,source_id,partner_id)
SELECT 'factory',s.source_id,s.partner_id FROM source s JOIN imported i ON i.id=s.partner_id;

INSERT INTO alsvid_v2.partner_roles(partner_id,role,status)
SELECT l.partner_id,'FACTORY',p.status
FROM alsvid_v2.partner_source_links l JOIN alsvid_v2.partners p ON p.id=l.partner_id
WHERE l.source_type='factory';

CREATE FUNCTION alsvid_v2.sync_factory_partner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_partner uuid;
BEGIN
  SELECT partner_id INTO linked_partner FROM alsvid_v2.partner_source_links
  WHERE source_type='factory' AND source_id=NEW.id FOR UPDATE;
  IF linked_partner IS NULL THEN
    INSERT INTO alsvid_v2.partners(display_name,legal_name,country,contact_name,contact_email,contact_phone,address,status)
    VALUES(NEW.name,NEW.name,NEW.country,NEW.contact,NEW.email,NEW.phone,NEW.address,CASE WHEN NEW.status='启用' THEN 'ACTIVE' ELSE 'INACTIVE' END)
    RETURNING id INTO linked_partner;
    INSERT INTO alsvid_v2.partner_source_links(source_type,source_id,partner_id) VALUES('factory',NEW.id,linked_partner);
  ELSE
    UPDATE alsvid_v2.partners SET display_name=NEW.name,legal_name=NEW.name,country=NEW.country,contact_name=NEW.contact,
      contact_email=NEW.email,contact_phone=NEW.phone,address=NEW.address,
      status=CASE WHEN NEW.status='启用' THEN 'ACTIVE' ELSE 'INACTIVE' END,
      revision=revision+1,updated_at=now() WHERE id=linked_partner;
  END IF;
  INSERT INTO alsvid_v2.partner_roles(partner_id,role,status)
  VALUES(linked_partner,'FACTORY',CASE WHEN NEW.status='启用' THEN 'ACTIVE' ELSE 'INACTIVE' END)
  ON CONFLICT(partner_id,role) DO UPDATE SET status=EXCLUDED.status,updated_at=now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_factory_partner AFTER INSERT OR UPDATE ON alsvid_v2.factories
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_factory_partner();

CREATE FUNCTION alsvid_v2.sync_dealer_company_partner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_partner uuid;
BEGIN
  SELECT partner_id INTO linked_partner FROM alsvid_v2.partner_source_links
  WHERE source_type='dealer_company' AND source_id=NEW.id::text FOR UPDATE;
  IF linked_partner IS NULL THEN
    INSERT INTO alsvid_v2.partners(display_name,legal_name,country,tax_id,address,contact_name,contact_email,contact_phone)
    VALUES(NEW.name,NEW.name,NEW.country,NEW.tax_id,NEW.address,NEW.contact_name,NEW.contact_email,NEW.contact_phone)
    RETURNING id INTO linked_partner;
    INSERT INTO alsvid_v2.partner_source_links(source_type,source_id,partner_id) VALUES('dealer_company',NEW.id::text,linked_partner);
  ELSE
    UPDATE alsvid_v2.partners SET display_name=NEW.name,legal_name=NEW.name,country=NEW.country,
      tax_id=NEW.tax_id,address=NEW.address,contact_name=NEW.contact_name,
      contact_email=NEW.contact_email,contact_phone=NEW.contact_phone,
      revision=revision+1,updated_at=now() WHERE id=linked_partner;
  END IF;
  INSERT INTO alsvid_v2.partner_roles(partner_id,role) VALUES(linked_partner,'DEALER')
  ON CONFLICT(partner_id,role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_dealer_company_partner AFTER INSERT OR UPDATE ON alsvid_v2.dealer_companies
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_dealer_company_partner();
COMMIT;
