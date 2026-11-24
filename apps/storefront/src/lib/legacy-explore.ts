// 旧站 /explore/* 的逐页面兜底表。
//
// 为什么不放在 next.config 用全局开关统一控制：
// 那是一次性、全有或全无的——要么 19 个页面全都不再重定向（未迁的立刻变 404），
// 要么全都在重定向（迁好的 CMS 页面永远看不到）。真实迁移是逐页完成的，
// 所以判断也必须是逐页的：
//
//   CMS 已发布该路径  → 直接渲染 CMS 页面（保留原 URL 与正文）
//   CMS 尚未发布     → 308 到主题最近的聚合页（保权重，不出现 404）
//
// 这张表只在「CMS 还没有这一页」时生效，迁一页就少用一条，迁完可以整张删掉。
export const EXPLORE_FALLBACK: Record<string, string> = {
  // 品牌类 → /brand 比 /e-bikes 更贴合原页面主题，脱手时相关性损失更小
  'about-design': '/brand',
  'about-engineering': '/brand',
  'about-manufacturing': '/brand',
  'about-news': '/brand',
  'about-story': '/brand',
  // 平台概念
  ct: '/e-bikes',
  fc: '/e-bikes',
  ft: '/e-bikes',
  gt: '/e-bikes',
  // 技术说明
  'technology-assist': '/e-bikes',
  'technology-battery': '/e-bikes',
  'technology-folding': '/e-bikes',
  'technology-material': '/e-bikes',
  'technology-safety': '/e-bikes',
  // 配件说明
  'accessory-basket': '/e-bikes',
  'accessory-light': '/e-bikes',
  'accessory-mudguard': '/e-bikes',
  'accessory-parts': '/e-bikes',
  'accessory-rack': '/e-bikes',
};

export function exploreFallback(slug: string) {
  return EXPLORE_FALLBACK[slug] || '';
}
