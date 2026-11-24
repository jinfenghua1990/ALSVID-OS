import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Locale } from '@/website/_lib/i18n';
import { CmsBlocks } from '@/components/cms-blocks';
import { getCmsPage } from '@/lib/alsvid-api';
import { pageTitle } from '@/lib/seo';
import { exploreFallback } from '@/lib/legacy-explore';
import { Fc1StoryPage } from '@/website/_components/product/fc1-story-v4';
import { Fc2ProductPage } from '@/website/_components/product/fc2-product';
import { L7ProductPage } from '@/website/_components/product/l7-product';
import { L8ProductPage } from '@/website/_components/product/l8-product';
import { CupHolderProductPage } from '@/website/_components/product/cup-holder-product';
import '@/website/catalog.css';

// 历史车型内容页（旧官网 /explore/*）。
// 注意：这些是「内容页」而非商品页，不创建也不映射到可售商品；
// 是否可购买统一由商品目录 /e-bikes 决定。
const MODELS = ['fc1', 'fc2', 'l7', 'l8', 'cup-holder'] as const;
type Model = (typeof MODELS)[number];

// 标题不带站点后缀：layout 已配置 template '%s · ALSVID'
const META: Record<Model, { title: Record<Locale, string>; description: Record<Locale, string> }> = {
  fc1: {
    title: { de: 'FC1', en: 'FC1', zh: 'FC1' },
    description: {
      de: 'Das ALSVID FC1 Faltrad im Detail: Rahmen, Antrieb, Faltmechanik und Abmessungen.',
      en: 'The ALSVID FC1 folding bike in detail: frame, drive, folding mechanism and dimensions.',
      zh: 'ALSVID FC1 折叠车详解：车架、驱动系统、折叠结构与尺寸参数。',
    },
  },
  fc2: {
    title: { de: 'FC2', en: 'FC2', zh: 'FC2' },
    description: {
      de: 'Das ALSVID FC2 im Detail: Carbonrahmen, Antrieb, Federung und Abmessungen.',
      en: 'The ALSVID FC2 in detail: carbon frame, drive, suspension and dimensions.',
      zh: 'ALSVID FC2 详解：碳纤维车架、驱动系统、悬挂与尺寸参数。',
    },
  },
  l7: {
    title: { de: 'L7', en: 'L7', zh: 'L7' },
    description: {
      de: 'Das ALSVID L7 im Detail: Ausstattung, Abmessungen und Einsatzbereich.',
      en: 'The ALSVID L7 in detail: equipment, dimensions and intended use.',
      zh: 'ALSVID L7 详解：配置、尺寸与适用场景。',
    },
  },
  l8: {
    title: { de: 'L8', en: 'L8', zh: 'L8' },
    description: {
      de: 'Das ALSVID L8 im Detail: Ausstattung, Abmessungen und Einsatzbereich.',
      en: 'The ALSVID L8 in detail: equipment, dimensions and intended use.',
      zh: 'ALSVID L8 详解：配置、尺寸与适用场景。',
    },
  },
  'cup-holder': {
    title: { de: 'Flaschenhalter', en: 'Cup holder', zh: '水壶架' },
    description: {
      de: 'ALSVID Flaschenhalter: Montage, Material und Kompatibilität.',
      en: 'ALSVID cup holder: mounting, material and compatibility.',
      zh: 'ALSVID 水壶架：安装方式、材质与适配说明。',
    },
  },
};

type Props = { params: Promise<{ locale: string; model: string }> };

function asLocale(value: string): Locale {
  if (value === 'en') return 'en';
  if (value === 'zh') return 'zh';
  return 'de';
}

function asModel(value: string): Model | null {
  return (MODELS as readonly string[]).includes(value) ? (value as Model) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, model } = await params;
  const lang = asLocale(locale);
  const key = asModel(model);
  if (key) {
    return {
      title: META[key].title[lang],
      description: META[key].description[lang],
      alternates: {
        canonical: `/${lang}/explore/${key}`,
        languages: {
          de: `/de/explore/${key}`,
          en: `/en/explore/${key}`,
          zh: `/zh/explore/${key}`,
          'x-default': `/de/explore/${key}`,
        },
      },
    };
  }
  // 逐页判断：CMS 有这一页就用它自己的 SEO 资料（保留原 title/description），
  // 没有才走兜底 —— 这样每迁一页，SEO 就自动按页生效，不需要任何全局开关。
  const page = await getCmsPage(lang, `/explore/${model}`);
  if (page) {
    return {
      title: pageTitle(page.seo.title, page.name),
      description: page.seo.description,
      alternates: {
        canonical: `/${lang}/explore/${model}`,
        languages: {
          de: `/de/explore/${model}`,
          en: `/en/explore/${model}`,
          zh: `/zh/explore/${model}`,
          'x-default': `/de/explore/${model}`,
        },
      },
    };
  }
  return { title: 'Seite nicht gefunden · ALSVID', robots: { index: false, follow: false } };
}

export default async function ExplorePage({ params }: Props) {
  const { locale, model } = await params;
  const lang = asLocale(locale);
  const key = asModel(model);

  if (key) {
    // 车主中心暂由 8089 提供，站点自有账户中心上线后改为站内路径。
    const myUrl = `/${lang}/account`;
    const dealerUrl = `/${lang}/dealers`;
    switch (key) {
      case 'fc1':
        return <Fc1StoryPage locale={lang} myUrl={myUrl} />;
      case 'fc2':
        return <Fc2ProductPage locale={lang} dealerUrl={dealerUrl} myUrl={myUrl} />;
      case 'l7':
        return <L7ProductPage locale={lang} myUrl={myUrl} />;
      case 'l8':
        return <L8ProductPage locale={lang} myUrl={myUrl} />;
      case 'cup-holder':
        return <CupHolderProductPage locale={lang} />;
    }
  }

  // 逐页判断（用户明确要求的做法，替代原来的全局开关）：
  //   1. CMS 已发布这一页 → 直接渲染，保留原 URL、原 title、原正文；
  //   2. 尚未迁移 → 308 到主题最近的聚合页，绝不让它变成 404。
  // 迁移是逐页完成的，所以这里也是逐页判断，不存在「关开关那天一部分页面掉 404」。
  const page = await getCmsPage(lang, `/explore/${model}`);
  if (page) {
    return <main><CmsBlocks blocks={page.blocks} locale={lang} /></main>;
  }
  const fallback = exploreFallback(model);
  if (fallback) permanentRedirect(`/${lang}${fallback}`);
  notFound();
}
