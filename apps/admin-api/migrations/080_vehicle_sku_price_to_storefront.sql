-- Preserve every historical price before removing sales data from vehicle SKUs.
CREATE TABLE IF NOT EXISTS alsvid_v2.legacy_vehicle_sku_prices (
  sku_uuid uuid PRIMARY KEY REFERENCES alsvid_v2.skus(entity_uuid),
  price numeric NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO alsvid_v2.legacy_vehicle_sku_prices(sku_uuid, price)
SELECT s.entity_uuid, s.price
FROM alsvid_v2.skus s JOIN alsvid_v2.products p ON p.entity_uuid=s.product_uuid
WHERE p.kind='vehicle' AND s.price IS NOT NULL
ON CONFLICT (sku_uuid) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM alsvid_v2.skus s JOIN alsvid_v2.products p ON p.entity_uuid=s.product_uuid
    LEFT JOIN alsvid_v2.legacy_vehicle_sku_prices a ON a.sku_uuid=s.entity_uuid
    WHERE p.kind='vehicle' AND s.price IS NOT NULL AND a.price IS DISTINCT FROM s.price
  ) THEN RAISE EXCEPTION 'Legacy vehicle SKU price differs from its archive'; END IF;
END $$;

-- Earlier vehicle creation used EUR. Conflicting published offers are untouched;
-- unusual historical prices remain available in the archive for review.
INSERT INTO alsvid_v2.storefront_offers(sku_uuid,currency,unit_price,published)
SELECT s.entity_uuid,'EUR',s.price,false
FROM alsvid_v2.skus s JOIN alsvid_v2.products p ON p.entity_uuid=s.product_uuid
WHERE p.kind='vehicle' AND s.price IS NOT NULL AND s.price BETWEEN 0 AND 100000000
  AND s.price=round(s.price,2)
ON CONFLICT(sku_uuid,currency) DO NOTHING;

UPDATE alsvid_v2.skus s SET price=NULL
FROM alsvid_v2.products p, alsvid_v2.legacy_vehicle_sku_prices a
WHERE p.entity_uuid=s.product_uuid AND p.kind='vehicle' AND a.sku_uuid=s.entity_uuid
  AND a.price=s.price;
