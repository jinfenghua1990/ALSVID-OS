import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { cookies, draftMode } from 'next/headers';
import { getProducts, getPreviewLayout, getPublishedLayout, getCmsPage, getStorefrontLayoutReviewPreview, localeLabels, publicApiUrl, type Locale, siteUrl } from '@/lib/alsvid-api';
import { prepareLayoutSnapshot } from '@/lib/layout-snapshot';
import { CmsBlocks } from '@/components/cms-blocks';
import { pageTitle } from '@/lib/seo';
import {StorefrontLayoutReviewConfirm} from '@/components/storefront-layout-review-confirm';

// 预览横幅：必须明确告诉运营「你现在看的不是线上内容」，否则极易误判发布结果。
const PREVIEW_TEXT: Record<Locale, { label: string; hint: string; sourceMismatch: string; exit: string }> = {
  de: {
    label: 'Entwurfsvorschau',
    hint: 'Sie sehen den unveröffentlichten Entwurf. Besucher sehen diese Inhalte nicht.',
    sourceMismatch: 'Der Entwurf existiert nur auf Chinesisch; die Sprachfassung entsteht erst beim Veröffentlichen.',
    exit: 'Vorschau beenden',
  },
  en: {
    label: 'Draft preview',
    hint: 'You are viewing the unpublished draft. Visitors do not see this content.',
    sourceMismatch: 'The draft only exists in Chinese; the localized version is produced at publish time.',
    exit: 'Exit preview',
  },
  zh: {
    label: '草稿预览中',
    hint: '当前展示的是未发布草稿，访客看不到这些内容。',
    sourceMismatch: '草稿只有中文源稿，该语言版本在发布时才会生成。',
    exit: '退出预览',
  },
};

const HOME_DESCRIPTION: Record<Locale, string> = {
  de: 'Entdecke ALSVID E-Bikes und elektrische Mobilität.',
  en: 'Explore ALSVID electric bikes and mobility.',
  zh: '探索 ALSVID 电动自行车与城市出行解决方案。',
};

// 无装修内容时的兜底文案（三语独立，不做二选一回退）
const HERO: Record<Locale, { title: string; lede: string; cta: string; selected: string }> = {
  de: {
    title: 'Für jede Fahrt gemacht.',
    lede: 'Entdecke elektrische Mobilität mit durchdachtem Design und klarer Funktion.',
    cta: 'E-Bikes entdecken',
    selected: 'Ausgewählte Modelle',
  },
  en: {
    title: 'Made for every journey.',
    lede: 'Explore electric mobility with considered design and purposeful function.',
    cta: 'Explore E-Bikes',
    selected: 'Selected models',
  },
  zh: {
    title: '为每一段旅程而造。',
    lede: '以克制的设计与清晰的功能，重新理解电动出行。',
    cta: '浏览整车',
    selected: '精选车型',
  },
};

function homepageModuleIds(blocks: { id: string; componentKey: string; moduleId?: string; visible?: boolean }[]) {
  const ids: Record<string, string> = {};
  const activeBlocks = blocks.filter(b => b.visible !== false);
  const slots = ['ALSVID-G03-01', 'ALSVID-G03-02', 'ALSVID-G03-03', 'ALSVID-G03-04', 'ALSVID-G03-05'];
  activeBlocks.forEach((block, idx) => {
    if (block.moduleId) {
      ids[block.id] = block.moduleId;
    } else if (idx < slots.length) {
      ids[block.id] = slots[idx];
    }
  });
  return ids;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: Locale }>; searchParams?:Promise<{reviewToken?:string}> }): Promise<Metadata> {
  const { locale } = await params;
  if((await searchParams)?.reviewToken)return {title:localeLabels[locale].tagline,robots:{index:false,follow:false,nocache:true}};
  const cmsHome = await getCmsPage(locale, '/');
  const text = localeLabels[locale];
  const title = cmsHome?.seo?.title ? pageTitle(cmsHome.seo.title) : text.tagline;
  const description = cmsHome?.seo?.description || HOME_DESCRIPTION[locale];
  // 预览态绝不能进搜索引擎：即使运营误把预览链接分享出去，也不会污染索引。
  if ((await draftMode()).isEnabled) {
    return { title, description, robots: { index: false, follow: false, nocache: true } };
  }
  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: { de: `${siteUrl}/de`, en: `${siteUrl}/en`, zh: `${siteUrl}/zh`, 'x-default': `${siteUrl}/de` },
    },
  };
}

export default async function Home({ params, searchParams }: { params: Promise<{ locale: Locale }>; searchParams?:Promise<{reviewToken?:string;parent?:string;device?:string}> }) {
  const { locale } = await params;
  const query=(await searchParams)||{};
  const layoutReview=query.reviewToken?await getStorefrontLayoutReviewPreview(locale,query.reviewToken):null;
  if(query.reviewToken&&!layoutReview)return <main className="container"><h1>首页审核预览不可用</h1><p>预览凭证无效、已过期，或草稿已更新。请回到后台重新开始审核。</p></main>;

  // 草稿预览：Draft Mode 开启且持有令牌时读未发布草稿，否则一律读已发布版本。
  // 令牌存在 HttpOnly Cookie 里，不出现在 URL 与页面源码中。
  let layout = null;
  let preview = false;
  let previewSourceMismatch = false;
  if ((await draftMode()).isEnabled) {
    const token = (await cookies()).get('alsvid_preview')?.value;
    if (token) {
      const draft = await getPreviewLayout(locale, token);
      if (draft?.html) {
        layout = draft;
        preview = true;
        // 草稿只有中文源稿；de/en 的快照是发布时才渲染的，这里必须如实提示
        previewSourceMismatch = Boolean(draft.draftSourceLocale && draft.draftSourceLocale !== locale);
      }
    }
  }
  if (!layout) layout = layoutReview?.html?layoutReview:await getPublishedLayout(locale);

  // 快照是「整页 HTML」，自带旧站的 header/footer。布局层已经有统一的头部和页脚，
  // 原样注入会出现两条导航、两个页脚，所以注入前先剥掉站点外壳、把线上绝对链接本地化。
  const snapshotHtml = layout?.html ? prepareLayoutSnapshot(layout.html, locale) : '';

  // 优先尝试读取 CMS 统一页面系统配置的首页（支持与内容页统一的模块化编排）
  const cmsHome = layoutReview?null:await getCmsPage(locale, '/');
  if (cmsHome?.blocks && cmsHome.blocks.length > 0) {
    return <main data-alsvid-layout-source="cms-page">
      <CmsBlocks blocks={cmsHome.blocks} locale={locale} moduleIds={homepageModuleIds(cmsHome.blocks)}/>
    </main>;
  }

  const products = await getProducts(locale);
  return <main data-alsvid-layout-version={layoutReview?.revision??layout?.version??'unpublished'} data-alsvid-preview={preview?'draft':layoutReview?'release-review':'live'}>
    {preview && <div className="preview-banner" role="status">
      <strong>{PREVIEW_TEXT[locale].label}</strong>
      <span>{previewSourceMismatch ? PREVIEW_TEXT[locale].sourceMismatch : PREVIEW_TEXT[locale].hint}</span>
      <a href={`/api/preview/exit?locale=${locale}`}>{PREVIEW_TEXT[locale].exit}</a>
    </div>}
    {snapshotHtml ? <><style>{layout?.css}</style><div dangerouslySetInnerHTML={{ __html: snapshotHtml }} /></> : <section className="container hero" data-module-id="ALSVID-H01"><p className="eyebrow">ALSVID ELECTRIC MOBILITY</p><h1>{HERO[locale].title}</h1><p className="lede">{HERO[locale].lede}</p><Link className="button" href={`/${locale}/e-bikes`}>{HERO[locale].cta}</Link></section>}
    {layoutReview&&<StorefrontLayoutReviewConfirm confirmationToken={layoutReview.confirmationToken} session={layoutReview.session} locale={locale} device={query.device==='mobile'?'mobile':'desktop'} draft={layoutReview.draft} parentOrigin={query.parent||''}/>}
    {!snapshotHtml && <section className="container catalog" data-module-id="ALSVID-H02"><p className="eyebrow">{HERO[locale].selected}</p><div className="product-grid">{products.filter(product => product.kind === 'vehicle').slice(0, 4).map(product => <Link className="product-card" key={product.productId} href={`/${locale}/e-bikes/${encodeURIComponent(product.slug)}`}>{product.images[0] && <Image src={publicApiUrl(product.images[0].url)} alt={product.title} width={900} height={760} sizes="(max-width:720px) 90vw, 30vw" /> }<div className="product-copy"><h2>{product.title}</h2><p>{product.description}</p></div></Link>)}</div></section>}
  </main>;
}
