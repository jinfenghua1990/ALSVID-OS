# 数据库 Schema 与迁移索引

ALSVID 各实现独立维护数据库迁移，未做跨实现合并（避免破坏现有调用关系）。以下是本次归集的迁移文件清单：

| 实现 | 迁移目录 | 数量 | 说明 |
|------|----------|------|------|
| V2 运行版本（admin-api, 8089） | `apps/admin-api/migrations/` | 182 个 SQL | 当前实际运行的业务 API 迁移 |
| V2 基线 Schema | `apps/admin-api/schema.sql` | 1 个文件 | 415 行完整表结构 |
| ALSVID-V1.0 | `apps/alsvid-v1/packages/database/migrations/` | 71 个 SQL | 独立 monorepo 的迁移 |
| ALSVID-Next | `apps/alsvid-next/packages/database/migrations/` | 19 个 SQL | 独立 monorepo 的迁移 |

`apps/admin-api/migrations/data/` 中的 `explore-pages.json` 与 `legal-pages.json` 为页面 seed 数据（非客户个人信息），供 `seed-legal-pages.mjs` 等脚本使用，已一并保留。

生产数据库连接与凭据通过 Secret Manager 在运行时注入（如 `alsvid-database-url`），仓库内仅保留脱敏配置模板。
