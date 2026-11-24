import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrdersPanel } from '@/components/account/orders';
import { ORDERS, pick } from '@/lib/account-text';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(ORDERS.title, locale),
    description: pick(ORDERS.lede, locale),
    alternates: {
      canonical: `${siteUrl}/${locale}/account/orders`,
      languages: { de: `${siteUrl}/de/account/orders`, en: `${siteUrl}/en/account/orders`, zh: `${siteUrl}/zh/account/orders`, 'x-default': `${siteUrl}/de/account/orders` },
    },
    robots: { index: false, follow: false },
  };
}

export default async function AccountOrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <OrdersPanel locale={locale as Locale} />;
}
