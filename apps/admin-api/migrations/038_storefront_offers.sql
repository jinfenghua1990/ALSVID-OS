BEGIN;
CREATE TABLE alsvid_v2.storefront_offers (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
 currency text NOT NULL CHECK(currency IN ('CNY','EUR')), unit_price numeric(14,2) NOT NULL CHECK(unit_price>=0 AND unit_price<=100000000),
 published boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sku_uuid,currency), CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
COMMIT;
