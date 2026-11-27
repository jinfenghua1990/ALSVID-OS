import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BrandView } from './brand-view';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

const TITLES: Record<Locale, string> = {
  zh: '品牌形象与品牌故事 · ALSVID',
  de: 'Markenwelt & Geschichte · ALSVID',
  en: 'Brand Story & Philosophy · ALSVID',
};

const DESCRIPTIONS: Record<Locale, string> = {
  zh: '探索 ALSVID 品牌理念、设计哲学、航空级碳纤维技术与更轻盈的未来出行生活方式。',
  de: 'Entdecken Sie die ALSVID Markengeschichte, Designphilosophie und zukunftsweisende Leichtbau E-Bikes.',
  en: 'Discover ALSVID brand story, engineering philosophy, and urban lightweight mobility.',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) return {};
  const l = locale as Locale;
  return {
    title: TITLES[l],
    description: DESCRIPTIONS[l],
    alternates: {
      canonical: `${siteUrl}/${locale}/brand`,
      languages: { de: `${siteUrl}/de/brand`, en: `${siteUrl}/en/brand`, zh: `${siteUrl}/zh/brand`, 'x-default': `${siteUrl}/de/brand` },
    },
  };
}

export default async function BrandPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <BrandView locale={locale as Locale} />;
}
