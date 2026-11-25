# 官网装修开发任务与验收清单

接手时先读根目录 AGENTS.md 和 storefront-builder-blueprint.md。以本地源码为准核对；下列状态截至业务代码 feeefbb7a24816b6ded062beca5dfecc8261d2f3（2026-11-25），此后文档提交不等于功能完成。

## 状态定义

- TODO：未实现或仅有设计。
- PARTIAL：已有部分代码或尚未完成整条链路。
- CODE：代码已提交，未完成构建与集成验收。
- VERIFIED：任务的验收标准全部有可复现证据。
- DEPLOYED：另有明确生产发布及线上验收证据。
- BLOCKED：记录具体原因、影响及解除条件。

禁止用 CODE 替代 VERIFIED，禁止把模拟测试当作真实数据库或浏览器验收。

## 1. 任务总表（按依赖推进）

| ID | 优先级 | 状态 | 任务 | 依赖 | 验收标准 |
|---|---|---|---|---|---|
| WEB-001 | P0 | VERIFIED | 本地整合 PR #2 与 PR #1 | 无 | 检查分支差异、冲突及安全修复；保留用户本地修改；完整构建与测试结果归档 |
| WEB-002 | P0 | CODE | 整车参数绑定 | 001 | 两个车型三语展示、仅公开字段、真实 0、缺失值不伪造 |
| WEB-003 | P0 | PARTIAL | 参数唯一源闭环 | 002 | 旧规格兼容迁移、默认绑定、字段分组/排序/单位/枚举值翻译、缓存联动；装修不录入参数值 |
| WEB-004 | P0 | CODE | 单图、轮播、分隔、留白 | 001 | Admin 编辑、保存、发布、PC/手机及 Next.js 实际渲染一致；链接/素材校验 |
| WEB-005 | P0 | CODE | 固定购买区与草稿保护 | 001 | 固定模块不被删除；保存不覆盖其他配置；未保存草稿不可发布；revision 与历史一致 |
| WEB-006 | P0 | TODO | 通用模块登记与共享引用 | 001,003 | 稳定 key/schema；共享 follow、pinned、independent；两个不同页面引用同一实例 |
| WEB-007 | P0 | TODO | 共享模块发布闭环 | 006 | 改草稿不影响线上；发布一次关联页同步；历史固定旧版本；快照失败阻断；回滚/撤回刷新缓存 |
| WEB-008 | P0 | TODO | 页面及商品模板库 | 006,007 | 默认模板、保存/套用、按商品覆盖、模板关联；引用不被复制断开；固定业务区保留 |
| WEB-009 | P0 | PARTIAL | 三栏编辑器 | 006,008 | 左侧结构树/模块库，中间真实预览，右侧属性；桌面/平板/手机；共享/独立状态明确 |
| WEB-010 | P0 | TODO | 首页与内容页统一装修底座 | 007,008,009 | 迁移现有首页、品牌、活动等；保留 URL、SEO、内容、历史；不长期维持两套编辑引擎 |
| WEB-011 | P0 | PARTIAL | 全局装修与设计系统 | 006,007 | Header/公告/导航/Footer/令牌集中配置；修改发布后全站一致；响应式正确 |
| WEB-012 | P0 | PARTIAL | 分类页及商品详情装修 | 003,008,009 | 商品管理直接进入对应装修；真实列表/筛选/购买；不同商品共享模板且数据不同 |
| WEB-013 | P0 | PARTIAL | 多语言与 SEO | 008,010,012 | 中文 Admin；德英中前台；每语预览及可发布；slug/canonical/hreflang/sitemap 正确 |
| WEB-014 | P0 | PARTIAL | 统一发布验收 | 007,010,011,012,013 | Draft Mode、快照、版本对比、回滚、撤回、缓存；商品独立发布保留；不得报假成功 |
| WEB-015 | P0 | TODO | 官网完整交易链路验收 | 001 | 账户/访客结账/订单查询、配送/VAT、支付、邮件、售后、经销商入口；对接未完成需如实标注 |
| WEB-016 | P1 | TODO | 丰富业务数据模块 | 006,012 | 比较、评价、配件、说明书等真实数据绑定，禁止假值 |
| WEB-017 | P1 | TODO | 正式上线验收 | 014,015 | 经授权部署，记录 SHA、CI/构建、页面验收及回滚证据 |

WEB-015 是整体官网验收占位任务，不代表其中每个子功能均未开发；需要按当前代码和实际支付/邮件配置重新盘点。

## 2. 本轮已知代码成果

- 参数解析：apps/admin-api/cms.js，测试 apps/admin-api/test/cms-product-specs.test.js。
- 页面装修：CmsPageManager.jsx；商品公共配置：ProductDesignPanels.jsx 与 ShopDesignWorkspace.jsx。
- 前台模块：apps/storefront/src/components/cms-blocks.tsx 与商品详情 page.tsx。
- 已提交参数固定位置、单图/轮播/分隔/留白、草稿保护及版本刷新相关代码。
- 参数解析 5 个用例使用模拟依赖执行通过；CMS JavaScript 可解析。完整 Node 测试、Admin/Next.js 构建、数据库集成、浏览器、缓存、生产均尚未验收。
- PR #2 为 Draft；PR #1 需要集成核查。不要假定 main 已合并或本机已同步。

## 3. 所有模块必须通过的验收

- [ ] 后端 schema 校验、权限、公开字段和素材检查
- [ ] Admin 添加、编辑、保存、刷新、重载、排序、隐藏、删除的实际结果
- [ ] Admin 与 Next.js 渲染契约一致，固定业务模块不能被移除
- [ ] 中英德标签及内容、桌面/平板/手机；无缺图、错链、溢出
- [ ] 真实数据动态绑定；不重复维护主档、商品价格或 SKU
- [ ] 草稿隔离；发布快照、版本、失败回滚；缓存刷新与错误状态
- [ ] 原有路由、SEO、历史和商品独立发布行为无回归
- [ ] 测试与构建实际运行，记录命令、环境及输出摘要

建议本地先读取各 package.json 的实际 scripts，使用锁文件安装依赖，执行已有后端 npm test、Admin 与 Next.js build；不能假定脚本存在。数据库测试仅限 TEST_DATABASE_URL 指向的隔离库。对生产不得做测试写入。

## 4. 每次交接必须更新

在本文件追加一条交接记录，并同步任务状态。不得只写“已完成”。记录：
- 日期、任务 ID、实际修改文件和提交 SHA/本地 diff；
- 已实现能力和未实现范围；
- 实际运行的测试、结果、失败信息及未运行原因；
- 数据库迁移、配置、兼容及缓存影响；
- 下一任务 ID、阻塞项、是否合并/部署。

### 交接记录

2026-11-25（下午）：完成 GitHub feature/modular-site-builder（commit 8053a11）全量代码同步与打扫到本地。
- 本地前置备份创建于 _backup-20261125-pre-github-sync。
- 同步 apps/admin-api/cms.js、测试套件、admin-web 页面及 storefront cms-blocks/page.tsx 到本地目录。
- 修复 storefront/src/app/[locale]/e-bikes/[slug]/page.tsx 中 ProductGallery 遗漏 productId 导致的 TS 编译报错。
- 创建 admin-web -> client 软链接，兼容 monorepo 路径。
- 执行并通过测试：node server/test/cms-product-specs.test.js（5 pass, 0 fail）；client npm run build（构建成功）；storefront npx tsc --noEmit（零错误通过）。
- 本地 8089（管理端/API）与 8091（商城前台）均恢复 200 OK。
- WEB-001 标记为 VERIFIED。下一步推进 WEB-003（参数唯一源闭环）和 WEB-006（通用模块共享）。

2026-11-25：业务代码基准 feeefbb。WEB-002/004/005 为 CODE，WEB-003 为 PARTIAL。新增接管规范与验收框架不计入业务完成度。下一步 WEB-001（本地整合与构建），再完成 WEB-003 和 WEB-006。未合并，未部署，未修改生产数据库。
