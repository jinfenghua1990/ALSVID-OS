import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServicePanel } from '@/components/account/service';
import { SERVICE, pick } from '@/lib/account-text';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(SERVICE.title, locale),
    description: pick(SERVICE.lede, locale),
    alternates: {
      canonical: `${siteUrl}/${locale}/account/service`,
      languages: { de: `${siteUrl}/de/account/service`, en: `${siteUrl}/en/account/service`, zh: `${siteUrl}/zh/account/service`, 'x-default': `${siteUrl}/de/account/service` },
    },
    robots: { index: false, follow: false },
  };
}

export default async function AccountServicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <ServicePanel locale={locale as Locale} />;
}
