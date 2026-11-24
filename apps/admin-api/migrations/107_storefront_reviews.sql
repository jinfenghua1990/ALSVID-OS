-- 商城评价：买家在订单签收后对整单评价，卖家可回复与隐藏
-- 一单一评（order_id 唯一），评价不改动订单与资金状态
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_reviews (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.storefront_orders(id) ON DELETE CASCADE,
  owner_user_uuid uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text NOT NULL DEFAULT '' CHECK (length(content) <= 2000),
  reply text CHECK (reply IS NULL OR length(reply) <= 2000),
  replied_by text,
  replied_at timestamp with time zone,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS storefront_reviews_created_at_idx
  ON alsvid_v2.storefront_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS storefront_reviews_rating_idx
  ON alsvid_v2.storefront_reviews(rating);
CREATE INDEX IF NOT EXISTS storefront_reviews_pending_reply_idx
  ON alsvid_v2.storefront_reviews(created_at DESC)
  WHERE reply IS NULL;

COMMENT ON TABLE alsvid_v2.storefront_reviews IS '官网商城买家评价：一单一评，卖家可回复与隐藏，隐藏后官网不再展示';
COMMENT ON COLUMN alsvid_v2.storefront_reviews.hidden IS '卖家隐藏：仅后台可见，官网不再展示该评价';

COMMIT;
