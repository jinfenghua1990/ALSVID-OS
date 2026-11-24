// 页面标题归一。
//
// 问题来源：从正式站迁过来的 SEO 标题本身就是「电池设计 | ALSVID」这种带品牌后缀的
// 完整标题，而 layout 的 title template 又会补一次 `%s · ALSVID`，渲染出来变成
// 「电池设计 | ALSVID · ALSVID」——重复品牌后缀会稀释标题的相关性。
//
// 处理原则：CMS 里**保留原文**（它是对照正式站的依据），只在渲染时去掉后缀，
// 由 template 统一补一次。这样后台手填的标题也不会出问题。
const BRAND_SUFFIX = /\s*[|·—–-]\s*ALSVID\s*$/i;

export function pageTitle(raw: string | undefined | null, fallback = ''): string {
  const value = String(raw || '').trim();
  if (!value) return fallback;
  const stripped = value.replace(BRAND_SUFFIX, '').trim();
  return stripped || value;
}
