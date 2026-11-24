import React, { useEffect, useState } from 'react';
import { setPageMetadata } from '../seo.js';
import './catalog.css';

const copy = {
  zh: { sales: '销售网点', service: '服务网点', home: '返回官网', owner: '车主中心', loading: '正在读取网点…', error: '网点目录暂不可用，请稍后重试。', empty: '暂未公布网点。', retry: '重试' },
  en: { sales: 'Sales locations', service: 'Service locations', home: 'Back to website', owner: 'Owner centre', loading: 'Loading locations…', error: 'The directory is temporarily unavailable. Please try again.', empty: 'No locations have been published yet.', retry: 'Retry' },
  de: { sales: 'Verkaufsstandorte', service: 'Servicestandorte', home: 'Zur Website', owner: 'Kundenbereich', loading: 'Standorte werden geladen…', error: 'Das Verzeichnis ist vorübergehend nicht verfügbar. Bitte erneut versuchen.', empty: 'Noch keine Standorte veröffentlicht.', retry: 'Erneut versuchen' },
};

export default function PublicLocationsPage({ lang, kind }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const t = copy[lang], path = kind === 'sales' ? `/${lang}/dealers/locations` : `/${lang}/service-locations`;
  useEffect(() => { setPageMetadata({ lang, title: t[kind], description: '', path, robots: 'noindex,nofollow' }); }, [lang, kind, path, t]);
  useEffect(() => {
    let active = true; setRows(null); setError(false);
    fetch(`/api/public/dealer-locations?capability=${kind}`, { cache: 'no-store' }).then(response => { if (!response.ok) throw Error('Unavailable'); return response.json(); }).then(result => {
      if (!Array.isArray(result.data)) throw Error('Invalid response');
      if (active) setRows(result.data.filter(row => row && ['DE','AT'].includes(row.country) && typeof row.name === 'string' && typeof row.city === 'string' && typeof row.address === 'string' && row[kind] === true));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [kind, attempt]);
  return <div className="catalog-site" lang={lang}><header className="catalog-header"><a className="catalog-brand" href={`/www/${lang}`}>ALSVID</a><nav><a href={`/www/${lang}`}>{t.home}</a><a href="/my">{t.owner}</a></nav></header>
    <main><section className="catalog-intro"><h1>{t[kind]}</h1>
      {error ? <p role="alert">{t.error} <button type="button" onClick={() => setAttempt(value => value + 1)}>{t.retry}</button></p> : rows === null ? <p role="status">{t.loading}</p> : rows.length === 0 ? <p>{t.empty}</p> : <ul>{rows.map(row => <li key={row.id}><strong>{row.name}</strong><div>{row.address}, {row.city}, {row.country}</div></li>)}</ul>}
    </section></main></div>;
}
