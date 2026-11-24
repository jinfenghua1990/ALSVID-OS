import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OverviewPanel } from '@/components/account/overview';
import { OVERVIEW, pick } from '@/lib/account-text';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(OVERVIEW.title, locale),
    alternates: {
      canonical: `${siteUrl}/${locale}/account`,
      languages: { de: `${siteUrl}/de/account`, en: `${siteUrl}/en/account`, zh: `${siteUrl}/zh/account`, 'x-default': `${siteUrl}/de/account` },
    },
    robots: { index: false, follow: false },
  };
}

export default async function AccountOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <OverviewPanel locale={locale as Locale} />;
}
