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
## 整车详情页内部（2026-11-25 定稿）
- G01 营销公告栏与 G04 全站页脚：沿用首页公共组件。G03 保留为主体容器的内部 ID；P00 替代 G02。
- ALSVID-P00 商品专属单行吸顶导航：产品取数＋共用功能。
- ALSVID-P01 车型选配与核心参数：P01-01 车型选配、P01-02 四项核心参数（重量、续航、车架材质、折叠尺寸）；背景共用，开关独立。隐藏选配时跳转至同一商品 URL 的 configure=1 配置模式。
- ALSVID-P02 商品主视觉与营销：车型独立装修＋产品取数；兼容旧公共营销回退。
- ALSVID-P03 已取消独立展示，性能配置仍存 modules.performance，避免丢失已保存数据。
- ALSVID-P04 沉浸式图文：按车型、语言存商品草稿；子模块按顺序显示 P04-01 等，最多 200 段。透明底、图片/视频/文字叠加、滚动渐入、缩放、平移、聚焦、固定。
- ALSVID-P05 完整技术参数：自动读取整车主档公开字段、展示分组；P00 参数锚点。
- ALSVID-P06 包装清单：读取匹配的公开包装字段，不制造缺失资料。
- ALSVID-P07 产品下载：已公开发布且关联当前车型的 PDF。
- ALSVID-P08 常见问题：车型独立配置。
- ALSVID-P09 售后保障：当前商品质保资料。
- ALSVID-P10 配送服务：当前商品配送资料。
- 原有评价、退换货、其他说明保留为 P11—P13，未删除旧数据。
- 本轮明确修订 P04—P10 的含义；旧版 Admin iframe 预览尚未统一。真实生产字段、素材发布权限、移动端、构建及发布流程待验收。
