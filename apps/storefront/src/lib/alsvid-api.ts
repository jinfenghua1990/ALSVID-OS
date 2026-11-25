import { apiUrl as buildApiUrl, isApiConfigurationError, siteUrl as canonicalSiteUrl } from './origins';

export type Locale = 'de' | 'en' | 'zh';

export type CatalogProduct = {
  id: string;
  productId: string;
  slug: string;
  kind: 'vehicle' | 'part';
  model: string;
  title: string;
  description: string;
  delivery?: string;
  warranty?: string;
  relatedAccessories?: { id: string; productId: string; slug: string; title: string; images: { id: string; url: string }[]; prices: { currency: string; unitPrice: string }[] }[];
  languages: string[];
  images: { id: string; url: string }[];
  prices: { currency: string; unitPrice: string; referencePrice?: string|null }[];
  specifications: { label: string; value: string }[];
  detailBlocks?: { type: 'image' | 'text'; imageId?: string; alt?: string; text?: string; url?: string }[];
};

// 商品详情页 8 模块中的全局模块配置（②营销 ③④预留 ⑥评价开关 ⑦退换货 ⑧其他）。
export type ProductModuleBanner = {
  enabled: boolean;
  style: 'banner' | 'imageText' | 'promoBar';
  imageId: string;
  title: string;
  description: string;
  buttonText: string;
  href: string;
  text: string;
  theme: { background: 'none' | 'soft' | 'dark'; spacing: 'compact' | 'normal' | 'loose'; imageRatio: 'wide' | 'square' | 'auto'; buttonStyle: 'solid' | 'outline' | 'text' };
};
export type PerformanceConfig = {showParameters:boolean;fieldCodes:string[];mediaType:'image'|'video';imageId:string;videoId:string;headline:string;alignment:'left'|'center'|'right'};
export type PerformanceSpec = {code:string;label:string;value:string;unit:string};
export type ProductModuleCopy = { enabled: boolean; title: string; body: string };
export type ProductTemplateModules = {
  marketing: ProductModuleBanner;
  reserved3: ProductModuleBanner;
  performance?: PerformanceConfig;
  reserved4: ProductModuleBanner;
  reviews: { enabled: boolean; limit: number; style: 'list' | 'cards' };
  returns: ProductModuleCopy;
  other: ProductModuleCopy;
};
// 「全部产品」列表页版式：分类导航 + 自动展示（按销量）。null = 未装修，维持系统默认渲染。
export type CatalogLayout = { sort: 'sales' | 'default'; categories: { name: string; productIds: string[] }[] } | null;

export type Offer = { sku: string; spec: string; color: string; currency: string; unitPrice: string; referencePrice?:string|null; promotionEndsAt?:string|null; images?: {id:string;url:string}[] };
export type ProductAvailability = { available: boolean | null; items?: { sku: string; available: boolean }[] };
export type ReviewSummary = { average: string; total: number; goodRate: number; distribution?: Record<string, number> };
export type ReviewPage = {items:PublicReview[];counts:ReviewSummary;page:number;hasMore:boolean;filteredTotal:number};
export type PublicReview = { id: string; rating: number; content: string; reply: string | null; createdAt: string; items: { productId: string; productName: string; sku: string }[] };
export type PublicLocation = { id: string; name: string; country: string; city: string; address: string; sales: boolean; service: boolean };

function apiUrl(path: string) {
  // 来源统一由 lib/origins.ts 决定：生产环境缺 ALSVID_API_ORIGIN 会抛可诊断错误，
  // 不再悄悄回退到 localhost（换机器/换域名时那是静默故障源）。
  return buildApiUrl(path);
}

/** 解析后端 URL，并区分两类失败。
 *
 * 下面的 getJson* 原本用一个大 try 包住「拼地址 + 发请求」，于是连
 * 「生产环境没配 ALSVID_API_ORIGIN」这种部署错误也被吞成 null，
 * 表现是整站渲染成空白页、日志里却一片安静。现在把拼地址单独拆出来：
 * 配置错误向上抛，其余错误（网络、超时、5xx）仍然降级成空数据。
 */
function resolveUrl(path: string): URL | null {
  try {
    return apiUrl(path);
  } catch (error) {
    if (isApiConfigurationError(error)) throw error;
    return null;
  }
}

/** 浏览器渲染用的媒体地址：保持同源相对路径。
 *
 * 关键：8091 有 /api/* 同域代理（route.ts 白名单已覆盖商品图与 cms-media），
 * 相对路径在浏览器里天然可用。绝不能把 ALSVID_API_ORIGIN（内部地址，如
 * 127.0.0.1:8089）拼进 HTML —— 那个地址只有 8091 服务端能访问，部署到
 * Hetzner 后浏览器会全部裂图，本地却完全正常，属于最难发现的迁移坑。
 */
export function publicApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

/** 需要绝对地址的场合（JSON-LD、canonical、邮件）才用这个，前缀用站点对外地址。 */
export function absoluteApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = canonicalSiteUrl() || apiUrl('/').origin;
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function getJson<T>(path: string): Promise<T | null> {
  const url = resolveUrl(path);
  if (!url) return null;
  try {
    const response = await fetch(url, { next: { revalidate: 60, tags: ['storefront-products','storefront-cms'] } });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function getJsonLive<T>(path: string): Promise<T | null> {
  const url = resolveUrl(path);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function getProducts(locale: Locale, sort?: 'sales') {
  const items: CatalogProduct[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await getJsonLive<{ items: CatalogProduct[]; hasMore: boolean }>(`/api/catalog/products?lang=${locale}&page=${page}${sort === 'sales' ? '&sort=sales' : ''}`);
    if (!result) break;
    items.push(...result.items);
    if (!result.hasMore) break;
  }
  return items;
}

export async function getProduct(slug: string, locale: Locale) {
  return getJson<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(slug)}?lang=${locale}`);
}

export async function getOffers(slug: string, locale: Locale) {
  return await getJsonLive<Offer[]>(`/api/catalog/products/${encodeURIComponent(slug)}/offers?lang=${locale}`) || [];
}

export async function getAvailability(slug: string, locale: Locale) {
  return getJsonLive<ProductAvailability>(`/api/catalog/products/${encodeURIComponent(slug)}/availability?lang=${locale}`);
}

// available：本次发布现在真的能对外提供哪些语言（含源语言 zh），与「实际能否渲染」保持一致。
// sourceLocale：源稿语言。源稿存在 base 字段里，不在 locales 里，所以必须单独声明。
export type StorefrontLayout = { html: string; css: string; version: number | null; publishedAt: string | null; preview?: boolean; requestedLocale?: Locale; draftSourceLocale?: string; available?: Locale[]; sourceLocale?: Locale };

// 装修版式统一挂同一个 tag：发布一次就要让三种语言一起失效，
// 因此不按语言拆 tag，避免 8089 发布后还要知道该刷哪几个。
export const LAYOUT_CACHE_TAG = 'storefront-layout';

async function getJsonTagged<T>(path: string, tag: string): Promise<T | null> {
  const url = resolveUrl(path);
  if (!url) return null;
  try {
    // revalidate 只作为兜底（1 小时）；真正的失效靠 /api/revalidate 主动触发，
    // 这样「后台点发布 → 前台立刻新」，不必等 TTL。
    const response = await fetch(url, { next: { tags: [tag], revalidate: 3600 } });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function getPublishedLayout(locale: Locale) {
  return getJsonTagged<StorefrontLayout>(`/api/site/layout?locale=${locale}`, LAYOUT_CACHE_TAG);
}

// 草稿预览：凭 8089 签发的短时效令牌读取未发布内容。
// 令牌由 8091 的 /api/preview 存进 HttpOnly Cookie，页面渲染时取出这里用。
// 绝不缓存、绝不透出给客户端脚本。
export async function getPreviewLayout(locale: Locale, token: string) {
  const url = resolveUrl(`/api/public/layout-preview?locale=${locale}&token=${encodeURIComponent(token)}`);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as StorefrontLayout;
  } catch {
    return null;
  }
}

export type ShellLink={label:string;href:string};
export type SiteAnnouncementConfig={kind:'announcement';enabled:boolean;text:string;href:string};
export type SiteHeaderConfig={kind:'header';brand:string;links:ShellLink[]};
export type SiteFooterConfig={kind:'footer';brand:string;groups:{title:string;links:ShellLink[]}[]};
type SiteShellConfig=SiteAnnouncementConfig|SiteHeaderConfig|SiteFooterConfig;
export async function getSiteShell(locale:Locale){
  const get=(kind:string)=>getJson<{siteShell?:SiteShellConfig}>(`/api/cms/pages/public?locale=${locale}&path=${encodeURIComponent('/site-shell/'+kind)}`);
  const [a,h,f]=await Promise.all([get('announcement'),get('header'),get('footer')]);
  return {announcement:a?.siteShell?.kind==='announcement'?a.siteShell:null,header:h?.siteShell?.kind==='header'?h.siteShell:null,footer:f?.siteShell?.kind==='footer'?f.siteShell:null};
}
export async function getCmsPage(locale: Locale, path: string) {
  return getJson<{ id: string; name: string; locale: string; path: string; seo: { title?: string; description?: string }; blocks: CmsBlock[] }>(`/api/cms/pages/public?locale=${locale}&path=${encodeURIComponent(path)}`);
}

export async function getCmsSitemap() {
  return await getJson<{ locale: string; path: string }[]>('/api/cms/pages/sitemap') || [];
}

export async function getPublicLocations(capability: 'sales' | 'service') {
  const result = await getJson<{ data: PublicLocation[] }>(`/api/public/dealer-locations?capability=${capability}`);
  return result?.data || [];
}

export async function getCmsProductTemplate(locale: Locale, productId = '') {
  return getJson<{ id: string; name: string; locale: string; isProductSpecific: boolean; seo: { title?: string; description?: string }; productLayout?: { gallery?: 'standard' | 'immersive' | 'mosaic' | 'columns'; specifications?: 'list' | 'table' | 'accordion'; reviews?: 'list' | 'cards' }; modules?: ProductTemplateModules; performance?: PerformanceConfig; performanceSpecs?: PerformanceSpec[]; catalogLayout?: CatalogLayout; blocks: CmsBlock[] }>(`/api/cms/product-template?locale=${locale}&productId=${encodeURIComponent(productId)}`);
}

export interface SharedModuleRef {
  mode: 'follow' | 'pinned' | 'independent';
  moduleId?: string;
  pinnedVersion?: number | null;
}

export type CmsBlock = {
  id: string;
  componentKey: string;
  visible?: boolean;
  props: Record<string, any>;
  bindings?: Record<string, any>;
  data?: Record<string, any>;
  sharedRef?: SharedModuleRef | null;
  sharedMeta?: { sourceId: string; mode: string; resolved: boolean };
};

export async function getReviews(productId?: string, limit=20) {
  const query = new URLSearchParams({ limit: String(Math.min(50,Math.max(1,limit))) });
  if (productId) query.set('productId', productId);
  return getJsonLive<ReviewPage>(`/api/site/reviews?${query}`);
}

export function publicAssetUrl(id: string) {
  return publicApiUrl(`/api/public/cms-media/${encodeURIComponent(id)}`);
}

export const localeLabels: Record<Locale, { home: string; catalog: string; tagline: string }> = {
  de: { home: 'Startseite', catalog: 'E-Bikes', tagline: 'Für Freiheit entwickelt' },
  en: { home: 'Home', catalog: 'E-Bikes', tagline: 'Engineered for freedom' },
  zh: { home: '首页', catalog: '整车', tagline: '为自由而生' },
};

// canonical / sitemap / JSON-LD 用的站点绝对地址。
// 优先 SITE_URL / SITE_ORIGINS，最后才回落到正式域名 —— 预发环境若没配，
// canonical 指向正式站总比指向 localhost 或空串安全（不会产生重复内容）。
export const siteUrl = canonicalSiteUrl() || 'https://www.alsvidbike.com';
