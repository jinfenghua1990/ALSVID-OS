import type { Locale } from './alsvid-api';

// 首页装修快照是「整页 HTML」：从旧站原样迁移过来，自带 <header> 与 <footer>。
// 布局层（app/[locale]/layout.tsx）已经统一提供头部和页脚，若把快照原样注入，
// 页面会出现两条导航栏、两个页脚，而且快照头部是 position:absolute 的覆盖层，
// 会紧贴在布局头部下沿，看起来像「多出来一条深色栏」。
// 因此注入前必须剥掉快照自带的站点外壳，只保留中间的内容区块。
const SITE_CHROME = /<(header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

// 快照里的链接是发布时写死的线上绝对地址（实测 78/110 条），本地预览点一下就会
// 跳到 www.alsvidbike.com，且语言段固定为发布时的语言。这里统一改写为站内相对路径，
// 并把语言段对齐到当前 locale。
const PROD_HOST = /(?:https?:)?\/\/(?:www\.)?alsvidbike\.com/gi;

export function stripSiteChrome(html: string): string {
  return html.replace(SITE_CHROME, '');
}

export function localizeSnapshotLinks(html: string, locale: Locale): string {
  return html
    // 带语言段：…/de/xxx → /zh/xxx（顺序必须在裸域名规则之前）
    .replace(/(?:https?:)?\/\/(?:www\.)?alsvidbike\.com\/(?:de|en|zh)(?=[/?#"'])/gi, `/${locale}`)
    // 裸域名：…/xxx → /zh/xxx；…com" → /zh"
    .replace(PROD_HOST, `/${locale}`);
}

// 注入前的唯一入口：剥外壳 + 链接本地化。
export function prepareLayoutSnapshot(html: string, locale: Locale): string {
  if (!html) return '';
  return localizeSnapshotLinks(stripSiteChrome(html), locale)
    .replace(/<section\b(?=[^>]*\bdata-home-carousel="true")[^>]*>/i, tag => addModuleId(tag, 'ALSVID-H01'))
    .replace(/<section\b(?=[^>]*\bid="folding")[^>]*>/i, tag => addModuleId(tag, 'ALSVID-G03-02'))
    .replace(/<section\b(?=[^>]*\bid="platforms")[^>]*>/i, tag => addModuleId(tag, 'ALSVID-H02'))
    .replace(/<section\b(?=[^>]*\bid="tech")[^>]*>/i, tag => addModuleId(tag, 'ALSVID-H03'))
    .replace(/<section\b(?=[^>]*\bid="about")[^>]*>/i, tag => addModuleId(tag, 'ALSVID-H04'));
}

function addModuleId(tag: string, id: string): string {
  return /\bdata-module-id\s*=/.test(tag) ? tag : tag.replace(/>$/, ` data-module-id="${id}">`);
}
