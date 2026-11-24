# ALSVID-OS

ALSVID 统一源码中心（Monorepo）。本仓库归集本机当前实际运行的 ALSVID 全部项目源码，作为唯一源码仓库。各应用仍可独立启动、独立部署；本仓库只做源码统一管理，不改变运行时拓扑。

## 仓库结构

```
apps/
  admin-api/      Fastify 业务 API（端口 8089），当前实际运行版本
  admin-web/      React 18 + Vite 管理后台（管理端 UI）
  storefront/     Next.js 16 商城前台（端口 8091），当前实际运行版本
  alsvid-v1/      ALSVID-V1.0 独立 monorepo（活跃实现，含 domains/packages）
  alsvid-next/    ALSVID-Next 独立 monorepo（另一活跃实现）
database/         数据库 Schema 与迁移文件索引
infra/            Docker / Nginx / GCP 部署配置模板（从 alsvid-v1 git 历史归档）
scripts/          运维与迁移脚本
docs/             项目文档
start.bat         Windows 本地启动脚本（来自 V2-main）
```

## 运行中的服务与源码对应关系

| 端口 | 服务 | 源码目录 | 技术栈 |
|------|------|----------|--------|
| 8089 | 业务 API | `apps/admin-api/` | Fastify 4 / Node.js / PostgreSQL |
| 8091 | 商城前台 | `apps/storefront/` | Next.js 16 / React 19 |
| — | 管理后台 | `apps/admin-web/` | React 18 / Vite 5 |

`apps/alsvid-v1/` 与 `apps/alsvid-next/` 是另外两套仍在演进的 ALSVID 实现，保留其完整 monorepo 结构（`apps/`、`domains/`、`packages/`、`pnpm-workspace.yaml`），便于后续统一，但本次归集不做合并或重构。

## 数据库迁移

三套实现各自维护迁移文件，统一索引见 `database/README.md`。

## 安全约定

- 真实密钥通过 Google Secret Manager 注入，运行时读取，**永不入库**。
- 各应用仅保留 `.env.example` 等不含真实值的模板。
- 如需新增环境变量，先更新对应 `.env.example`，再在部署环境配置真实值。

## 说明

本仓库为源码归档用途，不包含 `node_modules`、构建产物、日志、生产数据或备份文件。
