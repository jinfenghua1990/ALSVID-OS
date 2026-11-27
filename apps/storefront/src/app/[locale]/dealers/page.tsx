import type { Metadata } from 'next';
import { type Locale, siteUrl } from '@/lib/alsvid-api';
import { pageTitle } from '@/lib/seo';
import { DealersView } from './dealers-view';

type Props = {
  params: Promise<{ locale: Locale }>;
};

const SEO_COPY: Record<Locale, { title: string; description: string }> = {
  zh: {
    title: '全球经销商与服务中心 · 商业合作',
    description: '查找附近的 ALSVID 官方授权体验店与服务中心，或了解如何在您的区域成为官方合作伙伴。',
  },
  de: {
    title: 'Händlernetzwerk & Showrooms · Partnerschaft',
    description: 'Finden Sie einen autorisierten ALSVID Showroom in Ihrer Nähe oder werden Sie exklusiver Partner in Ihrer Region.',
  },
  en: {
    title: 'Global Dealer Network & Showrooms · Partnership',
    description: 'Find an authorized ALSVID showroom and service partner near you, or explore opportunities to partner with us.',
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const seo = SEO_COPY[locale] || SEO_COPY.de;

  return {
    title: pageTitle(seo.title),
    description: seo.description,
    alternates: {
      canonical: `${siteUrl}/${locale}/dealers`,
      languages: {
        de: `${siteUrl}/de/dealers`,
        en: `${siteUrl}/en/dealers`,
        zh: `${siteUrl}/zh/dealers`,
        'x-default': `${siteUrl}/de/dealers`,
      },
    },
  };
}

export default async function DealersPage({ params }: Props) {
  const { locale } = await params;
  return <DealersView locale={locale} />;
}
