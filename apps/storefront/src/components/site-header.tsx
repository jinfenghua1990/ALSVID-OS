import Link from 'next/link';
import type {Locale,CatalogLayout,SiteHeaderConfig} from '@/lib/alsvid-api';
import {CartNavLink} from './cart-nav-link';
const copy={de:{home:'Startseite',catalog:'E-Bikes',all:'Alle E-Bikes',ride:'Probefahrt',owner:'Kundenbereich',search:'Produkte suchen',searchPlaceholder:'Modell oder Stichwort',menu:'Menü',categories:'Kategorien'},en:{home:'Home',catalog:'E-Bikes',all:'All E-Bikes',ride:'Test ride',owner:'Owner area',search:'Search products',searchPlaceholder:'Model or keyword',menu:'Menu',categories:'Categories'},zh:{home:'首页',catalog:'整车',all:'全部整车',ride:'试骑预约',owner:'车主中心',search:'搜索商品',searchPlaceholder:'车型或关键词',menu:'菜单',categories:'商品分类'}} satisfies Record<Locale,Record<string,string>>;

const languageNames: Record<Locale,string> = { de:'Deutsch', en:'English', zh:'中文' };
function LanguageFlag({locale}:{locale:Locale}){
 return locale==='de'?<svg width="26" height="16" viewBox="0 0 5 3" aria-hidden="true" focusable="false"><path fill="#000" d="M0 0h5v1H0z"/><path fill="#D00" d="M0 1h5v1H0z"/><path fill="#FFCE00" d="M0 2h5v1H0z"/></svg>:locale==='en'?<svg width="30" height="15" viewBox="0 0 60 30" aria-hidden="true" focusable="false"><path fill="#012169" d="M0 0h60v30H0z"/><path stroke="#FFF" strokeWidth="6" d="m0 0 60 30m0-30L0 30"/><path stroke="#C8102E" strokeWidth="2" d="M0 0l30 15m30 15L30 15m30-15L30 15M0 30l30-15"/><path stroke="#FFF" strokeWidth="10" d="M30 0v30M0 15h60"/><path stroke="#C8102E" strokeWidth="6" d="M30 0v30M0 15h60"/></svg>:<svg width="24" height="16" viewBox="0 0 30 20" aria-hidden="true" focusable="false"><path fill="#DE2910" d="M0 0h30v20H0z"/>{[[5,5,3,0],[10,2,1,-20],[12,4,1,-40],[12,7,1,-65],[10,9,1,-85]].map(([x,y,r,angle],i)=><polygon key={i} fill="#FFDE00" points={Array.from({length:10},(_,j)=>{const a=(j*36-90+angle)*Math.PI/180;const d=j%2?r*0.382:r;return (x+d*Math.cos(a))+','+(y+d*Math.sin(a));}).join(' ')}/>)}</svg>;
}

export function SiteHeader({locale,catalogLayout,config=null}:{locale:Locale;catalogLayout:CatalogLayout;config?:SiteHeaderConfig|null}){
 const t=copy[locale],categories=catalogLayout?.categories||[];
 return <header className="site-header" data-module-id="ALSVID-G02">
  <Link className="brand" href={'/'+locale} aria-label="ALSVID">{config?.brand||'ALSVID'}</Link>
  <details className="mobile-menu"><summary aria-label={t.menu}><svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></summary><nav className="site-nav" aria-label={t.menu}>
   <Link href={'/'+locale}>{t.home}</Link>
   <details className="nav-mega"><summary>{t.catalog}</summary><div className="nav-mega__panel">
    <div className="nav-mega__intro"><span className="eyebrow">{t.categories}</span><strong>{t.all}</strong><p>{locale==='de'?'Entdecken Sie die ALSVID E-Bike Modelle.':locale==='en'?'Explore the ALSVID electric bike range.':'探索 ALSVID 电动自行车系列。'}</p><Link className="nav-mega__all" href={'/'+locale+'/e-bikes'}>{t.all} →</Link></div>
    <div className="nav-mega__links">{categories.length?categories.map((category,index)=><Link key={category.name+'-'+index} href={'/'+locale+'/e-bikes?cat='+index}><strong>{category.name}</strong><span>{category.productIds.length} {locale==='zh'?'款车型':locale==='de'?'Modelle':'models'}</span></Link>):<Link href={'/'+locale+'/e-bikes'}>{t.all} →</Link>}</div>
   </div></details>
   {config?.links?.map((item,i)=><Link key={i} href={item.href}>{item.label}</Link>)}
   <Link href={'/'+locale+'/test-ride'}>{t.ride}</Link>
  </nav>  <form className="site-search" action={'/'+locale+'/e-bikes'} method="get" role="search"><label className="sr-only" htmlFor="site-search-input">{t.search}</label><input id="site-search-input" name="q" type="search" placeholder={t.searchPlaceholder}/><button type="submit" aria-label={t.search}>⌕</button></form></details>

  <div className="site-header-actions"><details className="locale-switch locale-switch--flags"><summary aria-label={locale==='zh'?'切换语言':locale==='de'?'Sprache wählen':'Choose language'}><LanguageFlag locale={locale}/><span className="sr-only">{languageNames[locale]}</span></summary><nav aria-label="Language">{(['de','en','zh'] as Locale[]).map(lang=><Link key={lang} href={'/'+lang} lang={lang} aria-current={lang===locale?'page':undefined}><LanguageFlag locale={lang}/>{languageNames[lang]}</Link>)}</nav></details>
 <CartNavLink locale={locale}/><Link href={'/'+locale+'/account'} aria-label={t.owner}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></Link></div>
 </header>;
}
