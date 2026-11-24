BEGIN;
ALTER TABLE alsvid_v2.dealer_orders DROP CONSTRAINT dealer_orders_status_check;
ALTER TABLE alsvid_v2.dealer_orders ADD CONSTRAINT dealer_orders_status_check CHECK (status IN ('submitted','quoted','accepted','allocated','declined','rejected','cancelled'));
ALTER TABLE alsvid_v2.dealer_orders ADD COLUMN cancel_note text NOT NULL DEFAULT '', ADD COLUMN cancelled_by text NOT NULL DEFAULT '', ADD COLUMN cancelled_at timestamptz;
ALTER TABLE alsvid_v2.dealer_orders ADD CONSTRAINT dealer_orders_cancel_details_check CHECK ((status='cancelled' AND length(trim(cancel_note))>0 AND length(trim(cancelled_by))>0 AND cancelled_at IS NOT NULL) OR (status<>'cancelled' AND cancel_note='' AND cancelled_by='' AND cancelled_at IS NULL));
COMMIT;
