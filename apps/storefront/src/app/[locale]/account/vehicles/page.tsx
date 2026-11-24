import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { VehiclesPanel } from '@/components/account/vehicles';
import { VEHICLES, pick } from '@/lib/account-text';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(VEHICLES.title, locale),
    description: pick(VEHICLES.lede, locale),
    alternates: {
      canonical: `${siteUrl}/${locale}/account/vehicles`,
      languages: { de: `${siteUrl}/de/account/vehicles`, en: `${siteUrl}/en/account/vehicles`, zh: `${siteUrl}/zh/account/vehicles`, 'x-default': `${siteUrl}/de/account/vehicles` },
    },
    robots: { index: false, follow: false },
  };
}

export default async function AccountVehiclesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <VehiclesPanel locale={locale as Locale} />;
}
