import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RepairsPanel } from '@/components/account/repairs';
import { REPAIRS, pick } from '@/lib/account-text';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(REPAIRS.title, locale),
    description: pick(REPAIRS.lede, locale),
    alternates: {
      canonical: `${siteUrl}/${locale}/account/repairs`,
      languages: { de: `${siteUrl}/de/account/repairs`, en: `${siteUrl}/en/account/repairs`, zh: `${siteUrl}/zh/account/repairs`, 'x-default': `${siteUrl}/de/account/repairs` },
    },
    robots: { index: false, follow: false },
  };
}

export default async function AccountRepairsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <RepairsPanel locale={locale as Locale} />;
}
