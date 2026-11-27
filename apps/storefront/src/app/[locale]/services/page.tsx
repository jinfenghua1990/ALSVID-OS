import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServicesView } from './services-view';
import { siteUrl, type Locale } from '@/lib/alsvid-api';

const TITLES: Record<Locale, string> = {
  zh: '服务与支持 · 用户手册与质保保障 · ALSVID',
  de: 'Service & Support · Anleitungen & Garantie · ALSVID',
  en: 'Service & Support · Manuals & Warranty · ALSVID',
};

const DESCRIPTIONS: Record<Locale, string> = {
  zh: '获取 ALSVID 电助力折叠车说明书、快速折叠安装视频、5年车架质保政策与常见问题解答。',
  de: 'Bedienungsanleitungen, Faltvideos, Garantiebedingungen und technischer Support für Ihr ALSVID E-Bike.',
  en: 'User manuals, folding video guides, European warranty policies, and technical support for ALSVID bikes.',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) return {};
  const l = locale as Locale;
  return {
    title: TITLES[l],
    description: DESCRIPTIONS[l],
    alternates: {
      canonical: `${siteUrl}/${locale}/services`,
      languages: { de: `${siteUrl}/de/services`, en: `${siteUrl}/en/services`, zh: `${siteUrl}/zh/services`, 'x-default': `${siteUrl}/de/services` },
    },
  };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <ServicesView locale={locale as Locale} />;
}
