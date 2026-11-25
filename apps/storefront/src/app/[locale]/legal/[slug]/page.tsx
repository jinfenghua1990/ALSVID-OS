import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CmsBlocks } from '@/components/cms-blocks';
import { getCmsPage, type Locale, siteUrl } from '@/lib/alsvid-api';
import { pageTitle } from '@/lib/seo';

// 德国站法定页面：Impressum / Datenschutz / AGB / Widerrufsbelehrung / Versand / Zahlung。
//
// 这里只做**承载结构**，不写任何经营主体信息与法律条文：
// 公司名、地址、Registergericht/HRB、USt-IdNr.、负责人、联系方式都必须由
// 实际经营主体提供，并经法务/税务确认后录入 CMS 草稿。凭猜测填出来的 Impressum
// 在德国是可被 Wettbewerber 直接发警告函（Abmahnung）的，所以宁可缺，不可编。
//
// 结构约定（由 scripts/seed-legal-pages.mjs 生成，也可在后台手工维护）：
//   article 区块的 heading  = 页面标题（如 "Impressum"）
//   article.sections[i]     = 一个条款/章节，heading 为条款名，body 为条文（换行分段）
// 页面未发布时本路由返回 404，这是上线前的正确行为：法定页不能先挂空壳。

type Props = { params: Promise<{ locale: Locale; slug: string }> };

const LEGAL_LABELS: Record<Locale, { updated: string; toc: string; missing: string }> = {
  de: { updated: 'Stand', toc: 'Inhalt', missing: 'Rechtliche Angaben sind noch nicht verfügbar.' },
  en: { updated: 'Last updated', toc: 'Contents', missing: 'Legal information is not available yet.' },
  zh: { updated: '更新日期', toc: '目录', missing: '法律信息尚未提供。' },
};

// 从 article 区块里取「更新日期」：约定第一段的形如 "Stand: 2026-12" 或 "更新日期：…"。
// 没有就整行不渲染，不留空占位。
function updatedLine(blocks: { componentKey: string; props?: Record<string, unknown> }[], label: string) {
  const article = blocks.find((block) => block.componentKey === 'article');
  const intro = String(article?.props?.intro || '');
  const match = intro.match(/(?:Stand|Last updated|更新日期)\s*[:：]\s*([^\n]+)/i);
  if (match) return `${label}: ${match[1].trim()}`;
  return '';
}

// 章节锚点：让 Impressum / Datenschutz 这类长文档可以直接链到某一节
function toc(blocks: { componentKey: string; props?: Record<string, unknown> }[], label: string) {
  const article = blocks.find((block) => block.componentKey === 'article');
  const sections = (article?.props?.sections as { heading?: string }[] | undefined) || [];
  const items = sections.map((section, index) => ({ heading: String(section.heading || '').trim(), id: `abschnitt-${index + 1}` })).filter((item) => item.heading);
  if (items.length < 2) return null;
  return (
    <nav className="legal-doc__toc" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <ol>
        {items.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.heading}</a></li>)}
      </ol>
    </nav>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getCmsPage(locale, `/legal/${slug}`);
  // 法定页不做 SEO 竞争，但必须可被抓取（Impressum 是德国站点信任信号）；
  // 未发布时明确 noindex，避免搜索引擎记录一个 404 页面。
  if (!page || /\{\{TODO_[A-Z_]+\}\}/i.test(JSON.stringify(page))) return { title: LEGAL_LABELS[locale].missing, robots: { index: false, follow: false } };
  return { title: pageTitle(page.seo.title, page.name), description: page.seo.description, alternates: { canonical: `${siteUrl}/${locale}/legal/${encodeURIComponent(slug)}` } };
}

export default async function LegalPage({ params }: Props) {
  const { locale, slug } = await params;
  const page = await getCmsPage(locale, `/legal/${slug}`);
  if (!page || /\{\{TODO_[A-Z_]+\}\}/i.test(JSON.stringify(page))) notFound();
  const labels = LEGAL_LABELS[locale];
  const updated = updatedLine(page.blocks, labels.updated);
  const contents = toc(page.blocks, labels.toc);
  return (
    <main className="legal-doc container">
      {updated && <p className="legal-doc__updated">{updated}</p>}
      {contents}
      <CmsBlocks blocks={page.blocks} locale={locale} />
    </main>
  );
}
