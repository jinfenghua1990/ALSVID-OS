-- P1 工厂交货拆分：把"工厂分批交货"从 production_deliveries(32列一表三义)中独立出来。
-- 规格 §0.1 业务边界：工厂分批交货确认归生产交付；发运/清关/签收归 B2B 与库存中心。
-- 本表只承担"工厂把成品交给谁、交多少、哪天交"；后续流转通过 order_id 只读关联。
-- 双键模式沿用 production_deliveries：id text 对外，entity_uuid uuid 供明细/库存关联。
BEGIN;

CREATE TABLE alsvid_v2.factory_handover_batches (
  id                 text PRIMARY KEY,
  entity_uuid        uuid NOT NULL UNIQUE DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id           text NOT NULL REFERENCES alsvid_v2.production_orders(id),
  order_uuid         uuid NOT NULL REFERENCES alsvid_v2.production_orders(entity_uuid),
  batch_no           text NOT NULL CHECK (length(trim(batch_no)) BETWEEN 1 AND 80),
  handover_date      date NOT NULL,
  planned_quantity   integer NOT NULL CHECK (planned_quantity > 0),
  destination_type   text NOT NULL DEFAULT '实体仓'
                       CHECK (destination_type IN ('实体仓', '虚拟仓', '客户直发')),
  destination_ref    text NOT NULL DEFAULT '',
  status             text NOT NULL DEFAULT '待确认'
                       CHECK (status IN ('待确认', '已确认', '已取消')),
  note               text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_by         text NOT NULL DEFAULT '',
  confirmed_at       timestamptz,
  confirmed_by       text,
  cancel_reason      text,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_handover_batches_idem UNIQUE (order_id, batch_no)
);

COMMENT ON TABLE alsvid_v2.factory_handover_batches IS
  '工厂分批交货批次：生产交付域，PO 边界止于此；发运/签收在 production_deliveries，只读关联';
COMMENT ON COLUMN alsvid_v2.factory_handover_batches.destination_type IS
  '交货去向：实体仓=入指定实体仓；虚拟仓=WH_VIRTUAL 逻辑过账待分配；客户直发=直接发终端客户';
COMMENT ON COLUMN alsvid_v2.factory_handover_batches.destination_ref IS
  '去向引用：实体仓/虚拟仓填 warehouses.id，客户直发填客户标识';

CREATE INDEX factory_handover_batches_order
  ON alsvid_v2.factory_handover_batches(order_id, handover_date, id);

CREATE INDEX factory_handover_batches_uuid
  ON alsvid_v2.factory_handover_batches(order_uuid);

COMMIT;
