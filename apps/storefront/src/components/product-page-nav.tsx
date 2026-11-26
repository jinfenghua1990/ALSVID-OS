'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { CartNavLink } from './cart-nav-link';

const copy = {
  de: { nav: 'Produktnavigation', menu: 'Menü', home: 'Startseite', overview: 'Übersicht', specs: 'Technische Daten', video: 'Videos', downloads: 'Downloads', configure: 'Konfigurieren', account: 'Kundenbereich', unavailable: 'Derzeit nicht verfügbar' },
  en: { nav: 'Product navigation', menu: 'Menu', home: 'Home', overview: 'Overview', specs: 'Specifications', video: 'Videos', downloads: 'Downloads', configure: 'Configure', account: 'Account', unavailable: 'Currently unavailable' },
  zh: { nav: '商品导航', menu: '菜单', home: '返回首页', overview: '概览', specs: '技术参数', video: '视频', downloads: '下载', configure: '配置车型', account: '个人账户', unavailable: '暂无内容' },
} as const;

function Icon({ name }: { name: 'menu' | 'cart' | 'account' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'menu' ? <path d="M3 6h18M3 12h18M3 18h18"/> : name === 'cart' ? <><path d="M2 3h3l3 13h12l2-10H6"/><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/></> : <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>}
  </svg>;
}

export function ProductPageNav({ locale, model, hasSpecs, hasVideo, hasDownloads, purchaseHref='#product-purchase', overviewHref='#product-overview' }: { locale: Locale; model: string; hasSpecs: boolean; hasVideo: boolean; hasDownloads: boolean; purchaseHref?:string; overviewHref?:string }) {
  const t = copy[locale];
  const ref = useRef<HTMLElement>(null);
  const [active,setActive]=useState(overviewHref);
  useEffect(() => {
    const nav = ref.current;
    const shell = nav?.closest<HTMLElement>('[lang]');
    if (!nav || !shell) return;
    const announcement = shell.querySelector<HTMLElement>(':scope > .site-announcement');
    const measure = () => {
      shell.style.setProperty('--product-announcement-height', (announcement?.getBoundingClientRect().height || 0) + 'px');
      shell.style.setProperty('--product-nav-height', nav.getBoundingClientRect().height + 'px');
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    if (announcement) observer.observe(announcement);
    const closeOutside = (event: PointerEvent) => {
      nav.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(item => {
        if (!item.contains(event.target as Node)) item.open = false;
      });
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', closeOutside);
      shell.style.removeProperty('--product-announcement-height');
      shell.style.removeProperty('--product-nav-height');
    };
  }, [locale]);
  const closeMenus = () => ref.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(item => { item.open = false; });
  const links = [
    { label: t.overview, href: overviewHref, enabled: true },
    { label: t.specs, href: '#product-specifications', enabled: hasSpecs },
    { label: t.video, href: '#product-video', enabled: hasVideo },
    { label: t.downloads, href: '#product-downloads', enabled: hasDownloads },
  ];
  useEffect(()=>{const update=()=>{const offset=(ref.current?.getBoundingClientRect().bottom||0)+40;const anchors=[overviewHref,'#product-specifications','#product-video','#product-downloads'];const found=anchors.map(href=>({href,el:document.getElementById(href.slice(1))})).filter(x=>x.el&&x.el.getBoundingClientRect().top<=offset).sort((a,b)=>(b.el?.getBoundingClientRect().top||0)-(a.el?.getBoundingClientRect().top||0))[0];setActive(found?.href||overviewHref)};update();window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update)},[overviewHref,hasSpecs,hasVideo,hasDownloads]);
  return <nav ref={ref} className="product-section-nav product-section-nav--single" aria-label={t.nav} data-module-id="ALSVID-P00" data-module="productNavigation" onKeyDown={event => {
    if (event.key === 'Escape') {
      const open = ref.current?.querySelector<HTMLDetailsElement>('details[open]');
      closeMenus();
      open?.querySelector('summary')?.focus();
    }
  }}>
    <div className="product-nav-leading">
      <details className="product-nav-menu">
        <summary className="product-nav-icon" aria-label={t.menu}><Icon name="menu"/></summary>
        <div className="product-nav-popover"><Link href={'/' + locale} onClick={closeMenus}>{t.home}</Link></div>
      </details>
      <strong className="product-nav-model" title={model}>{model}</strong>
    </div>
    <div className="product-section-nav__links" tabIndex={0}>
      {links.map(link => link.enabled ? <a key={link.href} href={link.href} aria-current={active===link.href?'location':undefined} onClick={event=>{const el=document.getElementById(link.href.slice(1));if(el){event.preventDefault();el.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});setActive(link.href)}closeMenus()}}>{link.label}</a> : <span key={link.href} aria-disabled="true" title={t.unavailable}>{link.label}</span>)}
    </div>
    <div className="product-nav-trailing">
      <details className="product-nav-purchase">
        <summary className="product-section-nav__buy"><Icon name="cart"/><span>{t.configure}</span></summary>
        <div className="product-nav-popover" onClick={closeMenus}><a href={purchaseHref}>{t.configure}</a><CartNavLink locale={locale}/></div>
      </details>
      <Link className="product-nav-icon" href={'/' + locale + '/account'} aria-label={t.account}><Icon name="account"/></Link>
    </div>
  </nav>;
}
