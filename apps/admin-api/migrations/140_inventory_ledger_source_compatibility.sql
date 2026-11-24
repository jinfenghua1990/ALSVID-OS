BEGIN;

ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN (
    'stock_movement','repair_stock_event','opening_balance','production_order_material',
    'stocktake_correction','dealer_order_item','storefront_order_item',
    'storefront_return_receipt_item','storefront_return_restock','sales_order',
    'manual_adjustment'
  ));

COMMIT;
