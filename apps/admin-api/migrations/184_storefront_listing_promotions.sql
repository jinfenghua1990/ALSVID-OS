-- 184: independent channel pricing. Existing unit_price remains the regular price.
BEGIN;
CREATE TABLE alsvid_v2.storefront_listing_promotions (
 listing_id uuid NOT NULL, sku_uuid uuid NOT NULL, currency text NOT NULL,
 sale_price numeric(14,2) NOT NULL CHECK(sale_price>=0 AND sale_price<=100000000),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 reference_price numeric(14,2), reference_evidence text, reference_verified_at timestamptz,
 PRIMARY KEY(listing_id,sku_uuid,currency),
 FOREIGN KEY(listing_id,sku_uuid,currency) REFERENCES alsvid_v2.storefront_listing_prices(listing_id,sku_uuid,currency) ON DELETE CASCADE,
 CHECK ((reference_price IS NULL AND reference_evidence IS NULL AND reference_verified_at IS NULL)
 OR (reference_price IS NOT NULL AND reference_price>sale_price AND reference_evidence IS NOT NULL AND length(btrim(reference_evidence)) BETWEEN 1 AND 1000 AND reference_verified_at>=starts_at))
);
-- A single effective amount for list, details, cart and server-side order calculation.
CREATE VIEW alsvid_v2.storefront_effective_listing_prices AS
 SELECT lp.listing_id,lp.sku_uuid,lp.currency,
 CASE WHEN promo.active THEN sp.sale_price ELSE lp.unit_price END AS unit_price,
 lp.unit_price AS regular_price,lp.published,lp.revision,
 CASE WHEN promo.active AND sp.reference_price>sp.sale_price AND sp.reference_price<=lp.unit_price
      AND sp.reference_verified_at IS NOT NULL THEN sp.reference_price END AS reference_price,
 CASE WHEN promo.active THEN sp.ends_at END AS promotion_ends_at
 FROM alsvid_v2.storefront_listing_prices lp
 LEFT JOIN alsvid_v2.storefront_listing_promotions sp USING(listing_id,sku_uuid,currency)
 CROSS JOIN LATERAL (SELECT coalesce(sp.starts_at<=CURRENT_TIMESTAMP AND sp.ends_at>CURRENT_TIMESTAMP AND sp.sale_price<lp.unit_price,false) AS active) promo;
COMMIT;
