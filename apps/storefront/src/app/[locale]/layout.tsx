import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { notFound } from 'next/navigation';
import '../globals.css';
import { getCmsProductTemplate, type Locale, siteUrl } from '@/lib/alsvid-api';
import { CartNavLink } from '@/components/cart-nav-link';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  robots: { index: true, follow: true },
};

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  const lang = locale as Locale;
  const template = await getCmsProductTemplate(lang);
  return <div lang={lang}>
    <SiteHeader locale={lang} catalogLayout={template?.catalogLayout||null}/>
    {children}
    <footer className="site-footer"><span>ALSVID · Electric mobility</span><nav aria-label={copy.legalAria}>{copy.legal.map(([slug, label]) => <Link key={slug} href={`/${lang}/legal/${slug}`}>{label}</Link>)}</nav></footer>
  </div>;
}
