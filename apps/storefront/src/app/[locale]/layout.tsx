import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import '../globals.css';
import { localeLabels, type Locale, siteUrl } from '@/lib/alsvid-api';
import { CartNavLink } from '@/components/cart-nav-link';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  robots: { index: true, follow: true },
};

// 导航与页脚文案：三语独立维护，避免出现「德语站显示英文/中文」的回退。
const UI_TEXT: Record<Locale, {
  testRide: string;
  owner: string;
  legalAria: string;
  legal: [string, string][];
}> = {
  de: {
    testRide: 'Probefahrt',
    owner: 'Kundenbereich',
    legalAria: 'Rechtliche Informationen',
    legal: [['impressum', 'Impressum'], ['datenschutz', 'Datenschutz'], ['agb', 'AGB'], ['widerrufsbelehrung', 'Widerruf']],
  },
  en: {
    testRide: 'Test ride',
    owner: 'Owner area',
    legalAria: 'Legal information',
    legal: [['impressum', 'Impressum'], ['datenschutz', 'Privacy'], ['agb', 'AGB'], ['widerrufsbelehrung', 'Returns']],
  },
  zh: {
    testRide: '试骑预约',
    owner: '车主中心',
    legalAria: '法律信息',
    legal: [['impressum', '法律声明'], ['datenschutz', '隐私政策'], ['agb', '销售条款'], ['widerrufsbelehrung', '撤销权与退货']],
  },
};

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  const lang = locale as Locale;
  const text = localeLabels[lang];
  const copy = UI_TEXT[lang];
  return <div lang={lang}>
    <header className="site-header">
      <Link className="brand" href={`/${lang}`}>ALSVID</Link>
      <nav className="site-nav"><Link href={`/${lang}`}>{text.home}</Link><Link href={`/${lang}/e-bikes`}>{text.catalog}</Link><Link href={`/${lang}/test-ride`}>{copy.testRide}</Link><CartNavLink locale={lang} /><Link href={`/${lang}/account`}>{copy.owner}</Link></nav>
      <div className="locale-switch"><Link href="/de">DE</Link><Link href="/en">EN</Link><Link href="/zh">中文</Link></div>
    </header>
    {children}
    <footer className="site-footer"><span>ALSVID · Electric mobility</span><nav aria-label={copy.legalAria}>{copy.legal.map(([slug, label]) => <Link key={slug} href={`/${lang}/legal/${slug}`}>{label}</Link>)}</nav></footer>
  </div>;
}
