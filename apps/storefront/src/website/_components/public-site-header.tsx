import React from 'react';
import type { Locale } from '../_lib/i18n';

export function PublicSiteHeader({ locale, myUrl, active }: { locale: Locale; myUrl: string; active: string }) {
  const slug = active === 'l8' ? 'l1' : active;
  const labels = {
    zh: { products: '产品目录', owner: '车主中心', dealer: '经销商' },
    en: { products: 'Products', owner: 'Owner centre', dealer: 'Dealers' },
    de: { products: 'Produkte', owner: 'Kundenbereich', dealer: 'Händler' },
  };
  const text = labels[locale];
  return <header className="catalog-header">
    <a className="catalog-brand" href={`/www/${locale}`}>ALSVID</a>
    <nav aria-label={text.products}>
      <a href={`/www/${locale}/products`}>{text.products}</a>
      <a href={myUrl}>{text.owner}</a>
      <a href="/dealer">{text.dealer}</a>
      {(['zh', 'en', 'de'] as const).map(lang => <a key={lang} href={`/${lang}/explore/${slug}`} aria-current={lang === locale ? 'page' : undefined}>{lang.toUpperCase()}</a>)}
    </nav>
  </header>;
}
