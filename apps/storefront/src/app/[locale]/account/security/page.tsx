import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SecurityPanel } from '@/components/account/security';
import { SECURITY, pick } from '@/lib/account-text';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pick(SECURITY.title, locale),
    description: pick(SECURITY.lede, locale),
    alternates: {
      canonical: `${siteUrl}/${locale}/account/security`,
      languages: { de: `${siteUrl}/de/account/security`, en: `${siteUrl}/en/account/security`, zh: `${siteUrl}/zh/account/security`, 'x-default': `${siteUrl}/de/account/security` },
    },
    robots: { index: false, follow: false },
  };
}

export default async function AccountSecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <SecurityPanel locale={locale as Locale} />;
}
