import type { NextConfig } from 'next';

// 站内图片现在走同源相对路径（/api/* 有代理），remotePatterns 只在后端直接返回
// 绝对 http(s) 地址时才用得上。这里做容错：ALSVID_API_ORIGIN 未配置或非法时
// 不要因为 new URL 抛错导致整个构建失败。
const apiOrigin = process.env.ALSVID_API_ORIGIN || '';
function imageRemotePatterns() {
  if (!apiOrigin) return [];
  try {
    const url = new URL(apiOrigin);
    return [{ protocol: url.protocol.slice(0, -1) as 'http' | 'https', hostname: url.hostname }];
  } catch {
    console.warn(`[alsvid:config] ALSVID_API_ORIGIN 不是合法 URL：${apiOrigin}`);
    return [];
  }
}

// 历史 URL 映射的依据：正式站 www.alsvidbike.com 的 sitemap.xml 实测 87 条 URL
// （29 个唯一路径 × de/en/zh）。逐条核对后，本站在切换流量时必须保证不出现 404。
//
// 处理原则：
// 1. 已有等价内容的，308 到本站规范 URL（308 保留方法且被搜索引擎视作永久迁移）。
// 2. 没有等价内容的，308 到语义最近的聚合页，而不是返回 404 —— 404 会直接丢掉已积累的权重。
// 3. 门店类路径正式站有独立页，但本系统 dealer-locations 接口当前为 0 条数据，
//    不造空页面，先导向 /dealers（CMS 已有内容）；数据补齐后再建独立页。
// 4. 顺序即优先级：具体的在前，通配的在后，否则会被通配规则吃掉。
// 旧站 /explore/* 的处理分三类，不能混为一谈：
//   A. 车型/配件实体页（fc1 / fc2 / l7 / l8 / cup-holder）→ 本站已有专门页面，由
//      app/[locale]/explore/[model] 直接服务，不重定向。
//   B. 可售车型（l1）→ 商品详情是更合适的落点，308 到 /e-bikes。
//   C. 概念/技术/配件说明页（19 个）→ 正式站每个都有独立 title 与正文，统一 308
//      到 /e-bikes 会被判定为「不相关重定向」，权重保不住。正确做法是把正文迁进
//      CMS（scripts/migrate-explore-pages.mjs），路径保持 /explore/<slug>。
//
// C 类**不在本文件配置重定向**：迁移是逐页完成的，判断也必须逐页做。
// 逻辑在 app/[locale]/explore/[model]/page.tsx：CMS 已有该页面就直接渲染，
// 没有才按 src/lib/legacy-explore.ts 的兜底表 308。这样不会出现「关掉一个
// 全局开关后，一部分页面变 404」的情况。
const LEGACY_MODEL_TO_CATALOG = ['l1'];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageRemotePatterns(),
  },
  async redirects() {
    return [
      // ── 旧官网 /www/* 前缀（早期映射，保持不变） ──
      { source: '/www/de/products/:slug', destination: '/de/e-bikes/:slug', permanent: true },
      { source: '/www/en/products/:slug', destination: '/en/e-bikes/:slug', permanent: true },
      { source: '/www/de/products', destination: '/de/e-bikes', permanent: true },
      { source: '/www/en/products', destination: '/en/e-bikes', permanent: true },
      { source: '/www/de/e-bikes/:slug', destination: '/de/e-bikes/:slug', permanent: true },
      { source: '/www/en/e-bikes/:slug', destination: '/en/e-bikes/:slug', permanent: true },
      { source: '/www/de/e-bikes', destination: '/de/e-bikes', permanent: true },
      { source: '/www/en/e-bikes', destination: '/en/e-bikes', permanent: true },
      // 旧官网通用前缀：具体规则必须排在上面，否则会被通配吃掉。
      { source: '/www/:locale', destination: '/:locale', permanent: true },
      { source: '/www/:locale/:path*', destination: '/:locale/:path*', permanent: true },

      // ── 旧站经销商入口（后台门户）→ 站内招商/门店页 ──
      { source: '/dealer', destination: '/de/dealers', permanent: true },
      { source: '/:locale/dealer', destination: '/:locale/dealers', permanent: true },

      // ── 旧站 /my 门户 → 站内账户中心 ──
      { source: '/my/:path*', destination: '/de/account', permanent: true },
      { source: '/my', destination: '/de/account', permanent: true },

      // ── 正式站商品列表叫 /bikes，本站规范 URL 是 /e-bikes ──
      // 反过来的话要改 23 处站内引用与已建立的 sitemap，收益不足以抵消风险。
      { source: '/bikes', destination: '/de/e-bikes', permanent: true },
      { source: '/:locale/bikes', destination: '/:locale/e-bikes', permanent: true },

      // ── 门店位置：数据为空，先导向有内容的 /dealers ──
      { source: '/dealers/locations', destination: '/de/dealers', permanent: true },
      { source: '/:locale/dealers/locations', destination: '/:locale/dealers', permanent: true },
      { source: '/service-locations', destination: '/de/dealers', permanent: true },
      { source: '/:locale/service-locations', destination: '/:locale/dealers', permanent: true },

      // ── 配件杯架：本站已有独立内容页，旧站路径反向对齐过来 ──
      { source: '/explore/accessory-cup-holder', destination: '/de/explore/cup-holder', permanent: true },
      { source: '/:locale/explore/accessory-cup-holder', destination: '/:locale/explore/cup-holder', permanent: true },

      // ── 旧站 24 个 /explore/* 内容页 ──
      // B 类：可售车型旧路径 → 商品详情
      ...LEGACY_MODEL_TO_CATALOG.flatMap((slug) => [
        { source: `/explore/${slug}`, destination: '/de/e-bikes', permanent: true },
        { source: `/:locale/explore/${slug}`, destination: `/:locale/e-bikes`, permanent: true },
      ]),
      // C 类（19 个概念/技术/配件页）不在这里配置：逐页判断见
      // app/[locale]/explore/[model]/page.tsx + src/lib/legacy-explore.ts
    ];
  },
};

export default nextConfig;
