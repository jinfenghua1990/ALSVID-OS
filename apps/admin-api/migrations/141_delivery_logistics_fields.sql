-- 发运批次补充物流字段：承运商、物流运单号、预计到仓日期
alter table production_deliveries add column if not exists carrier text not null default '';
alter table production_deliveries add column if not exists tracking_no text not null default '';
alter table production_deliveries add column if not exists eta_date date;
