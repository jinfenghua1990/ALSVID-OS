# 官网装修模块 ID（稳定定位合同）
消费者端不展示编号；Next.js DOM 仅使用 data-module-id。后台显示与复制编号。
编号固定，不因排序、语言、商品新增而修改，不复用已废弃编号。
## 全局四区
| ID | 区域 | 代码位置 |
| --- | --- | --- |
| ALSVID-G01 | 可选营销公告栏 | apps/storefront/src/app/[locale]/layout.tsx |
| ALSVID-G02 | 全局顶部导航 | apps/storefront/src/components/site-header.tsx |
| ALSVID-G03 | 页面主体 | apps/storefront/src/app/[locale]/layout.tsx |
| ALSVID-G04 | 全局底部页脚 | apps/storefront/src/app/[locale]/layout.tsx |
整车商品详情页复用 G01 与 G04，使用 P00 替代首页 G02（不新增第三条导航）。全局配置由 apps/admin-web/src/pages/SiteShellPanel.jsx 编辑，使用 site_pages 的 shared_module 记录，按语言、区域独立保存发布。
## 整车详情页内部
位于 apps/storefront/src/app/[locale]/e-bikes/[slug]/page.tsx，后台公共模块目录位于 ProductDesignPanels.jsx。
- ALSVID-P00 商品专属单行导航栏（替代 G02）
- ALSVID-P01 商品主信息、主图、SKU、价格、购买、参数
- ALSVID-P02 营销
- ALSVID-P03 核心性能展示（固定四项参数，默认整车重量、续航里程、车架材质、折叠尺寸）
- ALSVID-P04 预留位二
- ALSVID-P05 商品独立图文详情
- ALSVID-P06 用户评价
- ALSVID-P07 退换货
- ALSVID-P08 其他说明
整车详情外层附带 data-product-id、data-product-slug；指定某商品时使用 SEO slug 或商品 ID + 模块 ID + 语言；例如“仅修改 A1 Ultra 的 ALSVID-P05 德语内容”。公共组件 ID 是类型定位，不是数据库实例唯一键。旧版 Admin iframe 的渲染与 Next.js 前台尚未完全统一。

### P00 导航定稿（2026-11-25）
- 左：汉堡菜单（返回首页）、当前车型；中：概览、技术参数、视频、下载；右：配置车型/购物车合并入口、个人账户。不显示品牌 Logo/名称。
- G01 开启时与 P00 一起吸顶，关闭后 P00 顶部无留空。PC、手机同组件、同顺序，窄屏中间区域横向滚动。无内容的导航项禁用。
- 合并购买入口展开选择现有配置区或购物车；不修改订单、库存、支付流程。真实多语言移动端和装修草稿预览尚需验收。

### P03 核心性能定稿
- 紧接 P02，复用 `reserved3` 定位，新增 `modules.performance` 独立配置，不覆盖旧预留位数据。
- 图片/视频、主文案、左中右文字位置、参数展示开关；四个参数字段可替换，不手填数值。默认按公开整车字段的代码或中文名称唯一匹配，缺失或歧义不展示；可在后台改为明确字段编码。PC/手机同一渲染逻辑。
- 生产字段映射、真实商品数据和完整构建尚待验证。
