import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { setPageMetadata } from '../seo.js';
import { BlocksRenderer } from './cms-blocks.jsx';
import './catalog.css';

const NAV = { zh: '中文', en: 'EN', de: 'DE' };

export default function CmsPublicPage({ lang = 'de', path = '/' }) {
  const [page, setPage] = useState(null), [state, setState] = useState('loading');
  // 后台装修工作区用 ?version=N / ?draft=1 预览历史版本与草稿
  const previewParams = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    return { version: search.get('version') || '', draft: search.get('draft') === '1' };
  }, []);
  useEffect(() => {
    let active = true;
    setState('loading');
    api.publicCmsPage(lang, path, previewParams).then(data => { if (active) { setPage(data); setState(data ? 'ready' : 'missing'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [lang, path, previewParams]);
  useEffect(() => {
    setPageMetadata({ lang, title: page?.seo?.title || page?.name || 'ALSVID', description: page?.seo?.description || '', path: `/www/${lang}${path}` });
  }, [lang, path, page]);
  return <div className="catalog-site">
    <header className="catalog-header">
      <a className="catalog-brand" href={`/www/${lang}`}><img className="alsvid-brand-logo" src="/alsvid-logo.png" alt="ALSVID" /><span>Electric mobility</span></a>
      <nav>{Object.entries(NAV).map(([code, label]) => <a key={code} href={`/www/${code}${path}`} aria-current={code === lang ? 'page' : undefined}>{label}</a>)}</nav>
    </header>
    <main>
      {state === 'loading' && <p className="catalog-state">…</p>}
      {state === 'missing' && <section className="catalog-intro"><p className="catalog-eyebrow">ALSVID</p><h1>页面未发布</h1><p>该页面不存在或尚未发布。</p><a className="catalog-home-link" href={`/www/${lang}`}>返回首页</a></section>}
      {state === 'error' && <p className="catalog-state">页面暂时无法加载，请稍后重试。</p>}
      {state === 'ready' && <BlocksRenderer blocks={page.blocks} lang={lang}/>}
      {state === 'ready' && previewParams.draft && <p className="catalog-state" style={{ padding: 12 }}>（草稿预览）</p>}
      {state === 'ready' && previewParams.version && <p className="catalog-state" style={{ padding: 12 }}>（历史版本预览）</p>}
    </main>
    <footer className="catalog-footer"><img className="alsvid-brand-logo" src="/alsvid-logo.png" alt="ALSVID" /><span>Electric mobility</span></footer>
  </div>;
}
