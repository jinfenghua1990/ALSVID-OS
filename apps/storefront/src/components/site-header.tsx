import Link from 'next/link';
import type {Locale,CatalogLayout} from '@/lib/alsvid-api';
import {CartNavLink} from './cart-nav-link';
const copy={de:{home:'Startseite',catalog:'E-Bikes',all:'Alle E-Bikes',ride:'Probefahrt',owner:'Kundenbereich',search:'Produkte suchen',searchPlaceholder:'Modell oder Stichwort',menu:'Menü',categories:'Kategorien'},en:{home:'Home',catalog:'E-Bikes',all:'All E-Bikes',ride:'Test ride',owner:'Owner area',search:'Search products',searchPlaceholder:'Model or keyword',menu:'Menu',categories:'Categories'},zh:{home:'首页',catalog:'整车',all:'全部整车',ride:'试骑预约',owner:'车主中心',search:'搜索商品',searchPlaceholder:'车型或关键词',menu:'菜单',categories:'商品分类'}} satisfies Record<Locale,Record<string,string>>;
export function SiteHeader({locale,catalogLayout}:{locale:Locale;catalogLayout:CatalogLayout}){
 const t=copy[locale],categories=catalogLayout?.categories||[];
 return <header className="site-header">
  <Link className="brand" href={'/'+locale} aria-label="ALSVID">ALSVID</Link>
  <details className="mobile-menu"><summary>{t.menu}</summary><nav className="site-nav" aria-label={t.menu}>
   <Link href={'/'+locale}>{t.home}</Link>
   <details className="nav-mega"><summary>{t.catalog}</summary><div className="nav-mega__panel">
    <div className="nav-mega__intro"><span className="eyebrow">{t.categories}</span><strong>{t.all}</strong><p>{locale==='de'?'Entdecken Sie die ALSVID E-Bike Modelle.':locale==='en'?'Explore the ALSVID electric bike range.':'探索 ALSVID 电动自行车系列。'}</p><Link className="nav-mega__all" href={'/'+locale+'/e-bikes'}>{t.all} →</Link></div>
    <div className="nav-mega__links">{categories.length?categories.map((category,index)=><Link key={category.name+'-'+index} href={'/'+locale+'/e-bikes?cat='+index}><strong>{category.name}</strong><span>{category.productIds.length} {locale==='zh'?'款车型':locale==='de'?'Modelle':'models'}</span></Link>):<Link href={'/'+locale+'/e-bikes'}>{t.all} →</Link>}</div>
   </div></details>
   <Link href={'/'+locale+'/test-ride'}>{t.ride}</Link><CartNavLink locale={locale}/><Link href={'/'+locale+'/account'}>{t.owner}</Link>
  </nav></details>
  <form className="site-search" action={'/'+locale+'/e-bikes'} method="get" role="search"><label className="sr-only" htmlFor="site-search-input">{t.search}</label><input id="site-search-input" name="q" type="search" placeholder={t.searchPlaceholder}/><button type="submit" aria-label={t.search}>⌕</button></form>
  <nav className="locale-switch" aria-label="Language"><Link href="/de" lang="de">DE</Link><Link href="/en" lang="en">EN</Link><Link href="/zh" lang="zh">中文</Link></nav>
 </header>;
}
