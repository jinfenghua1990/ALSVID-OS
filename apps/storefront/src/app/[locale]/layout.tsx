import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { notFound } from 'next/navigation';
import '../globals.css';
import { getCmsProductTemplate, type Locale, siteUrl } from '@/lib/alsvid-api';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  robots: { index: true, follow: true },
};

const LEGAL_TEXT:Record<Locale,{legalAria:string;legal:[string,string][]}>={de:{legalAria:'Rechtliche Informationen',legal:[['impressum','Impressum'],['datenschutz','Datenschutz'],['agb','AGB'],['widerrufsbelehrung','Widerruf']]},en:{legalAria:'Legal information',legal:[['impressum','Impressum'],['datenschutz','Privacy'],['agb','AGB'],['widerrufsbelehrung','Returns']]},zh:{legalAria:'法律信息',legal:[['impressum','法律声明'],['datenschutz','隐私政策'],['agb','销售条款'],['widerrufsbelehrung','撤销权与退货']]}};

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  const lang = locale as Locale;
  const template = await getCmsProductTemplate(lang);
  const copy=LEGAL_TEXT[lang];
  return <div lang={lang}>
    <SiteHeader locale={lang} catalogLayout={template?.catalogLayout||null}/>
    {children}
    <footer className="site-footer"><span>ALSVID · Electric mobility</span><nav aria-label={copy.legalAria}>{copy.legal.map(([slug, label]) => <Link key={slug} href={`/${lang}/legal/${slug}`}>{label}</Link>)}</nav></footer>
  </div>;
}
