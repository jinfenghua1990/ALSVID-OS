# ALSVID V2.0 生产交付 / 统一库存中心 / B2B 分销 —— 现状盘点与差异报告

> 依据：2026-11-17 需求确认稿《ALSVID V2.0｜生产交付、统一库存中心、B2B 分销全量实施方案》
> 盘点时间：2026-11-17
> 盘点对象：本地 `/Users/gino/Projects/ALSVID-V2-main`，数据库 `alsvid_v2`（原 163 张表、151 个迁移；**2026-11-18 已实施 P0a，现为 169 张表、157 个迁移**）
>
> - 2026-11-17 初版：仅盘点与差异判定，不含代码改动。
> - 2026-11-18 补记：完成 P0a 数据底座，新增迁移 149–155，详见 §8。

---

## 0. 一句话结论

规格里的 **26 个逻辑实体**中：**11 个已存在可直接复用**、**9 个存在但语义不符必须改造**、**6 个完全缺失必须新建**。

规模不是问题，**冲突只有 3 处**，且全部集中在同一条主线上：

> 现在的 `production_deliveries` 一张表同时承担了「工厂交货」「发运」「签收入库」三件事；
> 规格要求把 PO 的边界收缩到「工厂交货为止」，发运与签收归属库存中心 / B2B。
> 这一刀不切，后面 9 个「改造」项全部无从下手。

---

## 1. 现有系统事实

| 项 | 现状 |
|---|---|
| 技术栈 | Node.js + Fastify（`server/index.js`）+ React 18 / Vite（`client/src`）；纯 JavaScript，仅 `original-home/` 少量 `.tsx` |
| 数据库 | Neon PostgreSQL，schema `alsvid_v2`，163 张业务表 |
| 迁移机制 | `server/migrations/` 原 151 个、现 157 个，启动时校验 sha256；**不可改写历史迁移**。应用命令 `npm run db:migrate`，需直连 URL（pooler 会被拒绝） |
| 运行方式 | LaunchAgent `com.alsvid.v2`，端口 8089，`secret-bootstrap.js` 从 GCP Secret Manager 取运行时配置 |
| 版本控制 | **不是 git 仓库**，所有改动需手工备份目录 |
| 当前业务数据量 | `production_orders=1`、`production_order_items=1`、`factories=1`、`products=14`、`skus=14`、`warehouses=2`、`vins=0`、`dealer_orders=0`、`inventory_ledger=0` |

**关键含义**：除 1 张 PO 之外，生产、库存、B2B 三条线**业务数据全空**。这意味着结构改造的**迁移成本接近于零**，可以放心做规范化改造，不必迁就历史数据形态。这是本次实施最大的有利条件。

---

## 2. 26 个逻辑实体逐项对照

图例：✅ 直接复用 ｜ 🔧 存在但需改造 ｜ 🆕 完全缺失

### 2.1 采购（PO）域

| 规格实体 | 现有表 | 行数 | 判定 | 差异要点 |
|---|---|---|---|---|
| `purchase_orders` | `production_orders` | 1 | 🔧 | 字段基本齐（`order_no`/`factory`/`currency`/`order_date`/`expected_delivery_date`/`unit_price`/`exchange_rate`）。**但 `status` CHECK 只有 `计划中/生产中/已完成/已取消`**，规格要的是 `待交货/部分交货/交货完成/已取消` —— 必须改 CHECK 并做数据映射 |
| `purchase_order_items` | `production_order_items` | 1 | 🔧 | 有 `order_uuid`/`sku_uuid`/`sku_code`/`planned_quantity`/`unit_price`。**缺 SKU 名称/规格/价格快照**（规格 2.3 明确要求"保留订单建立时快照"） |
| `purchase_payments` | `production_order_payments` | 0 | ✅ | 字段完备（`payer_type`/`payer_account`/`payee`/`amount`/`currency`/`voucher_type`/`attachment_id`/`status`），且已有触发器强制**不可篡改**，正合规格"不得前端删除，需冲正" |
| `purchase_invoices` | `production_order_invoices` | 0 | ✅ | 同上，含 `invoice_number`/`issued_on`/`amount`/`currency`/`attachment_id`，同样不可篡改 |
| `bank_import_batches` | — | — | 🆕 | 全无。`finance_payments` 有 `external_reference`/`idempotency_key` 可作落地目标 |
| `bank_statement_rows` | — | — | 🆕 | 全无 |
| `bank_payment_allocations` | — | — | 🆕 | 全无。规格要求"单行已分摊总额 ≤ 可用金额"，需 CHECK + 触发器 |
| `factory_handover_batches` | `production_deliveries` | 0 | 🔧**核心冲突** | 见 §3.1 |
| `factory_handover_items` | `delivery_items` + `production_delivery_vins` | 0 | 🔧**核心冲突** | 同上 |

### 2.2 资产与库存域

| 规格实体 | 现有表 | 行数 | 判定 | 差异要点 |
|---|---|---|---|---|
| `vehicle_assets` | `vins` | 0 | 🔧 | **`vin` 已有 UNIQUE 约束**，符合规格"主档全局唯一"。但表里只有 `model/sku_code/factory/batch/status`，**缺 `asset_status`（可用/预占/已出库/冻结）和当前位置** |
| `vehicle_battery_links` | `vin_installed` | 0 | 🔧 | 只有 `serial_no`，**没有 `linked_at`/`unlinked_at`**。换电会覆盖历史，违反规格"保存原 SN 与生效日期，不覆盖历史" |
| `warehouses` | `warehouses` | 2 | 🔧 | `kind` CHECK = `国内仓/维修店仓/海外仓`，**缺虚拟仓**；`warehouse_purpose` CHECK = `普通仓/B2C 仓`，**缺虚拟中转**。且 `address`/`contact_name`/`contact_phone`/`country_region` 全 NOT NULL，建虚拟仓需占位值 |
| `inventory_ledger` | `inventory_ledger` | 0 | 🔧**核心冲突** | **纯 SKU 级**（`sku_uuid` + `warehouse_id` + `quantity_delta`），**无 `vin_uuid`**。规格要求按 VIN 追踪资产。见 §3.2 |
| `inventory_reservations` | `inventory_reservations` | 0 | 🔧 | SKU 级预占，`source_type` 分 production/dealer/storefront 三路。**无 VIN 级预占**，无法满足"同一 VIN 同时只允许一个有效预占" |
| `warehouse_receipts` | `production_delivery_receipts` | 0 | 🔧 | 已有 `grn_no`（GRN-YYYYMMDD-XXX）+ `status`，结构可用。但挂在 `delivery_id` 下，归属需随 §3.1 一起调整 |

### 2.3 B2B 与物流域

| 规格实体 | 现有表 | 行数 | 判定 | 差异要点 |
|---|---|---|---|---|
| `b2b_orders` | `dealer_orders` | 0 | 🔧**差距最大** | **只有 14 列**：`id/status/note/admin_note/dealer_response_note/currency/quoted_by/quoted_at/created_at/updated_at/cancel_*/`。**没有 `order_no`、客户/联系人、收货地址、目的国家、销售性质（正常/样车/测试）、贸易条款、清关属性**。本质是"经销商询价单"，不是销售订单 |
| `b2b_order_items` | `dealer_order_items` | 0 | 🔧 | 有 `sku_uuid`/`sku_code`/`quantity`/`quoted_unit_price`/`product_name`。**缺 `source_po_item_id`**（规格要求关联来源 PO 明细） |
| `b2b_allocations` | `dealer_order_allocations` | 0 | 🔧 | 只有 `item_id/warehouse_uuid/reservation_id/created_at`，**无 VIN 字段、无 status**，无法表达"已出库/已释放" |
| `shipments` | `dealer_order_shipments` | 0 | 🔧 | **只有 6 列**（`order_id/carrier/tracking_no/shipped_by/shipped_at`）。无来源仓、无状态、无清关 |
| `packages` | `delivery_parcels` | 0 | ✅ | 20 列，含 `component_type`（车体/电池/配件/其他）、独立 `carrier`/`tracking_no`/`eta`/`status`/危险品字段。**车电分运的基础已具备** |
| `package_items` | `delivery_items` | 0 | ✅ | `component_type` CHECK 已含 `车体/电池/配件/其他`，`source_type` 已含 `production_order/purchase_order/stock_transfer` |
| `tracking_events` | — | — | 🆕**核心缺口** | 全无。现有 `delivery_parcel_trackings` 只存**运单号**（货代/承运商/其他），**不存事件**。规格要的"时间线 + 事件日志 + 事件时间与接收时间"没有任何承载 |
| `returns_and_exceptions` | `dealer_order_return_*`（7 张）+ `storefront_return_*`（8 张） | 0 | ✅ | 退货申请/收货/退款/重新上架链路齐全，只是分渠道两套 |

### 2.4 财务与公共

| 规格实体 | 现有表 | 行数 | 判定 | 差异要点 |
|---|---|---|---|---|
| `cost_entries` | `finance_document_lines` + `finance_landed_cost_*`（5 张） | 0 | ✅ | 已区分 `capitalizable`、有 `fx_rate_id`、`batch_currency_amount`。预计/实际成本可落在 `finance_landed_cost_components`，**需补 `is_estimate` 语义** |
| `attachments` | `production_order_attachments` | 0 | 🔧 | 有 `category`/`ref_id`，但 `order_id` 外键锁死在生产订单上。规格要求"关联任意业务对象"，需扩展或抽象 |
| `audit_events` | `audit_log` | 390 | ✅ | 已有 actor/action/target/before/after，全部写操作走 `tx()` 自动记录 |

---

## 3. 三处必须拍板的架构冲突

### 3.1 冲突一：`production_deliveries` 一表三义

**现状**（32 列）：
```
production_deliveries
├─ 工厂交货语义：order_id, shipment_no, planned_quantity
├─ 发运语义：  warehouse_id（目标仓）, carrier, tracking_no, eta_date,
│              customs_status/reference/note（清关）, delivery_method,
│              recipient_type/recipient_id, ship_to_snapshot, dispatched_by
└─ 入库语义：  received_quantity, received_at, received_by, receipt_note,
               freight_cost, import_cost
```

**规格要求**（§0.1 业务边界表）：
- 工厂分批交货确认 → **生产交付**负责
- 客户订单、派送、清关、签收 → **B2B** 负责
- 仓库、VIN、库存流水与预占 → **库存中心**负责
- PO 的 TAB4「后续流转」**只读**展示关联结果

**冲突后果**：现在这张表同时被 PO 详情（发运管理/到货入库两个 TAB）和 DeliveryPage 使用。如果不拆，规格要求的"PO 不管发运"无法成立，且「后续流转」永远做不出只读视图。

**两个可选方案**：

| 方案 | 做法 | 代价 | 风险 |
|---|---|---|---|
| **A. 拆表**（推荐） | 新建 `factory_handover_batches` + `factory_handover_items` 承担工厂交货；`production_deliveries` 降级为"发运"并移交 B2B 履约调用 | 2 张新表 + 1 次字段搬移 | 现有 0 行数据，**迁移无风险**；需重写 6 个后端方法与 3 个前端页面 |
| B. 改造单表 | 给 `production_deliveries` 加 `batch_type`（交货/发运）区分，用一个表两种形态 | 不加表 | 32 列里一半字段对某种形态恒为 NULL，语义长期模糊，TAB4 只读视图仍难做 |

### 3.2 冲突二：库存账本是 SKU 级，规格要 VIN 级

**现状**：
```
inventory_ledger(sku_uuid, warehouse_id, quantity_delta, source_type, source_id, line_no, ...)
warehouse_stock(warehouse_id, sku_code, quantity)
```
按"某仓某 SKU 有几台"记账。

**规格要求**（§3.2、§3.3）：
- 每个 VIN 独立显示：资产身份 / 当前库存位置 / 库存分配状态 / 物流状态 / 当前关联单据
- 同一 VIN 允许无限次合法流转，流水逐次新增
- 同一时点不允许两份可用有效库存，不允许双重有效预占

**冲突后果**：SKU 级账本无法回答"这 30 台里具体哪 5 台在德国仓、哪 2 台已预占给客户 A"。

**两个可选方案**：

| 方案 | 做法 | 代价 | 风险 |
|---|---|---|---|
| **A. 双账本**（推荐） | 保留 `inventory_ledger` 做 SKU 数量账（对账用）；新增 `vehicle_asset_ledger`（`vin_uuid` + `warehouse` + `movement_type` + `event_key`）做 VIN 资产账。两账由同一事务同时写入 | 1 张新表 + 1 个事务封装 | 两账会漂移，需对账校验（已有 `inventory_ledger/w warehouse_stock 不一致` 的现成校验模式可抄） |
| B. 扩列 | 给 `inventory_ledger` 加可空 `vin_uuid`，VIN 级行填值、SKU 级行留空 | 不加表 | 一张表两种粒度，聚合查询要到处 `IS NULL` 分支，且 `warehouse_stock` 物化余额无法跟着走 |

### 3.3 冲突三：旧的"生产进度 / 质检 / 物料"要不要下线

规格 §13 明确「不在本次范围」：**工厂排产、质检、生产进度、产线管理**。§12.1 验收项直接写「无排产/产线/质检/工厂内部生产进度功能」。

现有对应的表和代码：

| 对象 | 现状 | 处置建议 |
|---|---|---|
| `production_orders.progress_percent` / `actual_quantity` / `production_started_at` / `production_completed_at` | 列存在，**前端零入口**（`api.js:271` 有方法但无页面调用） | 保留列不删（避免破坏约束），前端不提供入口 |
| `production_orders.qc_status` / `qc_note` / `factory_confirmed_at` | 同上，CHECK 约束存在 | 同上 |
| `production_vin_quality` | 0 行 | 保留表，不接 UI |
| `production_order_materials` + `ProductionMaterialsPage` | 表 0 行，页面已挂载在导航 | **建议下线导航入口**，规格不收客供料场景 |
| `production_order_events` | 0 行，写入逻辑在 progress/quality 更新时触发 | 随进度下线而停写，表保留 |

---

## 4. API 契约差异

规格 §7 列出 25 个建议路由。对照现有 `server/index.js`：

| 规格路由 | 现有对应 | 差距 |
|---|---|---|
| `GET/POST /api/production/purchase-orders` | `GET/POST /api/production-orders` | 路径前缀不同，**可保留现有路径**（规格说"实际按现有 Fastify 风格适配"）；缺筛选/分页参数 |
| `GET/PATCH /api/production/purchase-orders/:id` | 无单条 GET；PATCH 只有 `/status`、`/progress`、`/quality` | **缺整单 PATCH（更新未锁定字段）** |
| `POST .../payments` `.../invoices` | ✅ 已有 | — |
| `POST .../handovers` | `POST /api/production-orders/:id/deliveries` | 语义冲突，随 §3.1 改 |
| `GET .../linked-flow` | 无 | **缺**，TAB4 依赖 |
| `POST .../create-b2b-draft` | 无 | **缺** |
| `POST/GET /api/finance/bank-imports*` | 无（只有 `GET /api/finance/production-costs`） | **全缺 4 个** |
| `GET /api/inventory/assets/:vin` | 无（`GET /api/vins` 只有列表） | **缺** |
| `POST /api/inventory/receipts` | 签收走 `POST /api/production-deliveries/:id/receive` | 归属需调整 |
| `POST /api/inventory/reservations` `/release` | 预占只内部调用（`reserveProductionMaterial`），**无公开接口** | **缺** |
| `POST /api/b2b/orders` 等 4 个 | `dealer` 族路由存在但语义是询价 | 需重写 |

---

## 5. 前端差异

规格 §8 目标导航 vs 现状：

| 规格要求 | 现状 | 差距 |
|---|---|---|
| 生产交付：生产订单、合作工厂 | ✅ 一致 | — |
| 仓储：实时库存、仓库、**VIN 资产查询**、库存流水 | 实时库存 / 出库单 / 出入库记录 / 仓库设置 | **缺「VIN 资产查询」** |
| B2B：客户订单、履约与物流关联视图 | 只有一个「B2B 分销运营」（挂在 dealer 视图） | **需拆成客户订单 + 履约视图** |
| PO 详情五 TAB：订单信息 / 付款与发票 / **工厂交货** / **后续流转** / 附件 | 现有五 TAB：订单信息 / 付款与发票 / **发运管理** / **到货入库** / 附件 | **TAB3、TAB4 需整体替换** |
| 新建 PO 页面内完成，不用弹窗 | ✅ 已是页面内 | — |
| 物流时间线弹窗 | 无 | **缺** |
| 删除生产进度/质检 UI | 本就没接 | — |

---

## 6. 建议实施顺序

按规格 §11 第三步的业务优先级，结合本次盘点结果重排（把"数据底座"提前，否则 TABS 做出来接不上真实链路）：

| 阶段 | 内容 | 产出验收 | 依赖 |
|---|---|---|---|
| **P0a 数据底座** ✅ 已完成 | ① `warehouses` 加虚拟仓类型；② `vins` 补 `asset_status`/当前位置；③ `vehicle_battery_links`（历史不覆盖）；④ `vehicle_asset_ledger`；⑤ `tracking_events`；⑥ `warehouse_code` 唯一约束 | 迁移 149–155 已应用；约束实测全部拒绝非法数据；详见 §8 | — |
| **P0b 状态机** ⏳ 待定 | `production_orders.status` 从生产状态（计划中/生产中/已完成）改为采购交货状态（待交货/部分交货/交货完成） | 需同时改数据库 CHECK + 后端状态流转 + 前端展示 + 现有 1 单数据映射 | **需先定 §3.3 与改造方式** |
| **P1 工厂交货拆分** ✅ 已完成（按方案 A） | 迁移 156/157 + 7 个后端方法/路由 + 前端两 TAB；`production_deliveries` 保持原样 | 累计交货不超采购量、幂等键、状态锁实测通过，详见 §9 | 按用户"强制处理"指令执行 |
| **P2 PO 五 TAB** | TAB3 工厂交货（含 VIN/电池 SN/证据/去向类型）；TAB4 后续流转（只读 + 一键转 B2B） | 规格 §12.1 全部勾选 | P0 + P1 |
| **P3 付款与发票 + 银行导入** | 付款列表已有；补银行 Excel 导入批次/源行/匹配/分摊 | 重复导入不重复计付 | P0 |
| **P4 库存中心** | VIN 资产查询页；实体/虚拟仓；预占/释放 | 虚拟仓入出库账平；无双重预占 | P0 |
| **P5 B2B 履约** | `dealer_orders` 扩成正式 B2B 订单；履约/包裹/清关/签收；退货二售 | 规格 §12.4 全部勾选 | P0 + P4 |
| **P6 物流事件** | 事件表接入 + 时间线弹窗；手工录入 / 批量粘贴；预留 DHL 适配器 | 事件按发生时间排序；乱序不改终态 | P0 |

---

## 7. 风险与约束

1. **项目不是 git 仓库** —— 每次改动前必须建 `_backup-YYYYMMDD-HHMMSS/` 目录备份，且 `client/dist` 需单独备份。
2. **历史迁移有 sha256 校验** —— 只能新增迁移文件，不能改旧文件。原编号已到 `148`（`145_outbound_location_and_return` 等 4 个在上一轮报告后才发现），本次新增编号为 `149`–`155`，下一个从 `156` 起。
3. **迁移编号历史上有重复** —— `138_*`、`139_*`、`140_*` 各有两个文件（如 `138_production_order_pricing.sql` 与 `138_warehouse_logistics_v1.sql`），共 151 个文件、151 条已应用记录，无 pending、无孤儿。新增时避免再撞号。
4. **`production_orders.id` 是 text，`entity_uuid` 才是 uuid 主键** —— 付款/发票/发运外键挂 `order_id text`，明细挂 `order_uuid uuid`。新表必须明确选哪一边，混用会重蹈覆辙。
5. **两条并存的采购模型** —— `production_orders`（工厂采购，有数据）与 `procurement_purchase_orders`（询价→供应商确认，0 行）。本方案全部落在 `production_orders`，`procurement_*` 保持不动。
6. **付费/发票不可篡改触发器已生效** —— UI 绝不可提供"编辑/删除"，只能新增冲正记录。
7. **现有 5 个测试基线失败**（本次盘点前已存在，与本次改造无关）：`CMS product links`、`draft-identity`、`legacy destination`、`test-ride management`、`migrated product pages`。

---

## 8. P0a 实施记录（2026-11-18）

### 8.1 备份先于修改

| 项 | 位置 |
|---|---|
| 代码备份 | `_backup-20261118-083030/`（migrations、server/*.js、client/src、docs，4.2 MB） |
| 数据库备份 | `_backup-20261118-083030/alsvid_v2-before-p0.sql`（`pg_dump-18 --schema=alsvid_v2`，1.1 MB） |

⚠️ 本机默认 `pg_dump` 是 16.14，服务端是 18.7，直接报错；必须用 `pg_dump-18`。
迁移需直连 URL：secret 里只有 pooler 地址，运行时把 hostname 的 `-pooler` 去掉再交给 `migrate.js`。

### 8.2 新增迁移清单

| 编号 | 文件 | 内容 | 结果 |
|---|---|---|---|
| 149 | `149_warehouse_virtual_type.sql` | `warehouses.kind` 加 `虚拟仓`、`warehouse_purpose` 加 `虚拟中转仓`；建立 `WH_VIRTUAL` 仓库 | ✅ |
| 150 | `150_vin_asset_fields.sql` | `vins` 加 `asset_status`（默认可用）/ `current_warehouse_uuid` / `asset_note` + 索引 | ✅ |
| 151 | `151_vehicle_battery_links.sql` | 新表；`unlinked_at` 保留换电历史；两个部分唯一索引保证"同 VIN 一个有效电池、同电池只装一台车"；回填 `vin_installed` | ✅ |
| 152 | `152_vehicle_asset_ledger.sql` | 新表；`event_key` 唯一保证幂等；9 种 `movement_type`；时间线与来源索引 | ✅ |
| 153 | `153_tracking_events.sql` | 新表；`event_time` 与 `received_at` 分离；承运商事件 ID 去重；时间线索引 | ✅ |
| 154 | `154_warehouse_code_unique.sql` | 补 `warehouses.warehouse_code` 唯一约束（149 仅脚本防重，无数据库级约束） | ✅ |
| 155 | `155_vehicle_asset_ledger_check_fix.sql` | 修复 152 的 CHECK 缺陷（见下） | ✅ |

### 8.3 实测发现并修复的缺陷

152 迁移最初把流转方向约束写成：
```sql
CHECK (from_warehouse_uuid IS DISTINCT FROM to_warehouse_uuid)
```
**两个仓库都为空时该表达式返回 false**，导致 `VIRTUAL_IN`（无来源仓）这类合法记录被拒。
155 改为正确语义：
```sql
CHECK (from_warehouse_uuid IS NULL
    OR to_warehouse_uuid IS NULL
    OR from_warehouse_uuid <> to_warehouse_uuid)
```
因为 152 已应用且 sha256 锁定，只能新增迁移修正，不能直接改旧文件。

### 8.4 验证结果

| 验证项 | 结果 |
|---|---|
| 迁移应用 | 149–155 全部 Applied，无报错；`schema_migrations` 151 → 157 |
| 虚拟仓 | `WH_VIRTUAL` / 名称「虚拟中转仓」/ kind `虚拟仓` / purpose `虚拟中转仓` / 启用 |
| `warehouses.kind` CHECK | 已含 `国内仓/维修店仓/海外仓/虚拟仓` |
| `vins` 新列 | `asset_status`（NOT NULL，默认 `可用`）、`current_warehouse_uuid`（可空，FK 到仓库）、`asset_note` |
| 新表索引数 | `vehicle_battery_links` 5、`vehicle_asset_ledger` 5、`tracking_events` 4 |
| VIN 合法插入 | ✅ 通过 |
| `asset_status` 非法值 | ✅ 拒绝，SQLSTATE 23514 |
| 同 VIN 双有效电池 | ✅ 拒绝，SQLSTATE 23505 |
| 资产流水合法插入 | ✅ 通过（确认 155 修复生效） |
| 重复 `event_key` | ✅ 拒绝，SQLSTATE 23505 |
| 重复 `warehouse_code` | ✅ 拒绝，SQLSTATE 23505 |
| 测试残留 | 全部在事务内回滚，0 残留 |

### 8.5 本轮未做的事

- **没有写任何后端读写方法或前端页面**。P0a 只是数据底座，新表目前没有调用方，界面上看不到变化。
- **P0b 状态机改造未动**，原因见 §9。
- 现有 1 单 PO（`PO-20261115-001`，status `计划中`）及其明细、工厂、两个实体仓数据均未改动。

---

## 9. P1 工厂交货拆分实施记录（2026-11-18）

### 9.1 决策：按方案 A 拆表强制执行

用户拍板"直接强制处理"，采用方案 A：新建 `factory_handover_batches` + `factory_handover_items` 承担工厂交货；`production_deliveries` 保持原样（降级为发运，归 B2B/库存中心），不删不改历史数据。

备份：`_backup-20261118-090831-p1/`（migrations、server/*.js、client/src、docs、client/dist-before-p1）。

### 9.2 新增迁移

| 编号 | 文件 | 内容 | 结果 |
|---|---|---|---|
| 156 | `156_factory_handover_batches.sql` | 交货批次表：双键(id text + entity_uuid uuid)、`UNIQUE(order_id,batch_no)` 幂等、去向类型 CHECK（实体仓/虚拟仓/客户直发）、状态（待确认/已确认/已取消） | ✅ |
| 157 | `157_factory_handover_items.sql` | 明细表：VIN/电池 SN/车型 SKU/单车去向/证据附件 jsonb；`UNIQUE(batch_uuid,vin)`；批次级联删除 | ✅ |

迁移应用后实测：批次表 18 列 5 索引、明细表 11 列 4 索引；幂等重复 batch_no→23505、数量<=0→23514、非法去向→23514、重复 VIN→23505、明细外键无效→23503，全部正确拒绝；事务回滚后 0 残留。

### 9.3 后端（postgres-service.js + index.js）

新增 7 个方法：`listFactoryHandovers` / `createFactoryHandover` / `saveFactoryHandoverItems` / `listFactoryHandoverItems` / `confirmFactoryHandover` / `cancelFactoryHandover` / `linkedProductionFlow`；配套 7 条路由（handovers 增删改查 + confirm/cancel + linked-flow）。

全部沿用 `tx()` 事务 + 审计留痕 + advisory lock 幂等。累计交货数量在事务内行锁校验不超采购量。实测完整生命周期全绿：建批次（待确认）→幂等重放（不新增行）→超量拒绝→存明细→查明细→确认（已确认）→查列表→后续流转只读视图→已确认批次锁明细；清理后 0 残留。

实测踩坑（均已修复）：
1. 明细 INSERT 列数 8 个却写了 9 个占位符 → 修正为 `$1..$8`。
2. `listFactoryHandovers` 误用 lateral 子查询取 cancel_reason（列不存在）→ 改为主表直取 `h.cancel_reason`。
3. 子查询驼峰别名 `"itemCount"` 被引擎折叠为小写，外层未加引号引用失败 → 子查询改小写别名 `itemcount/vincount`。

### 9.4 前端（新增 FactoryHandoverPanel.jsx + 挂载）

新建 `FactoryHandoverPanel.jsx`，两种模式：
- `mode=handover`：交货批次登记表单 + 列表 + VIN/电池明细行内编辑 + 确认/取消；
- `mode=flow`：后续流转只读视图（工厂交货 / 发运 / 清关 / 签收三段表格）。

`ProductionOrderWorkspace.jsx` 的 TAB 从 5 个扩为 7 个：订单信息 / **工厂交货** / 生产进度 / 发货记录 / 到货入库 / **后续流转** / 附件（加粗为新增）。保留原生产进度、发货、入库 TAB 不动，避免破坏在用功能。

`api.js` 新增 7 个方法；`styles.css` 追加 `.fh-*` 样式块。

实测修正：仓库列表 API 返回字段是 `code`（非 warehouseCode），虚拟仓判断条件已对齐。

### 9.5 验证与现状

| 验证项 | 结果 |
|---|---|
| 后端语法 `node --check` | index.js / postgres-service.js 均通过 |
| 前端构建 `vite build --outDir dist.new` | ✅ 221 模块，0 错误（仅既有 chunk 警告） |
| 前端单测 | 29 pass / 1 fail；唯一失败 `draft-identity.test.js` 是既存问题，非本次引入 |
| 服务重启 + 健康 | HTTP 200，新路由命中鉴权（401 非 404，证明已注册） |
| 数据残留 | 测试数据全部清理，两新表 0 行 |

### 9.6 本轮未做 / 待定

- **P0b 状态机改造未动**：`production_orders.status` 仍是生产状态（待工厂确认/生产中/待发货），未改为采购交货状态（待交货/部分交货/交货完成）。需单独处理 CHECK + 数据映射 + 现有 1 单的状态。
- **旧 TAB 未下线**：规格要求五 TAB，当前是七 TAB（保留了生产进度/发货/入库）。是否下线由用户决定。
- **TAB3 完整字段**：规格 §12.1 的证据附件上传、去向类型逐车细化已支持字段，但证据上传走现有附件页，未在交货明细内嵌上传控件。
- 未接银行导入、VIN 资产查询页、B2B 履约（P3–P6 未开始）。
