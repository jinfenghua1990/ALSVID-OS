import React, { useEffect } from 'react';
import DealerApplicationForm from './DealerApplicationForm.jsx';
import { setPageMetadata } from '../seo.js';
import './catalog.css';

const copy = {
  zh: { title: '经销商合作', body: '欢迎了解 ALSVID 经销商合作。提交申请后，由管理员审核并联系。', account: '经销商登录', sales: '销售网点', service: '服务网点', home: '返回官网' },
  en: { title: 'Dealer partnerships', body: 'Explore a partnership with ALSVID. Our team reviews applications and will contact you.', account: 'Dealer sign in', sales: 'Sales locations', service: 'Service locations', home: 'Back to website' },
  de: { title: 'Händlerpartnerschaft', body: 'Entdecken Sie eine Partnerschaft mit ALSVID. Unser Team prüft Bewerbungen und nimmt Kontakt auf.', account: 'Händleranmeldung', sales: 'Verkaufsstandorte', service: 'Servicestandorte', home: 'Zur Website' },
};
export default function DealerPartnershipPage({ lang }) {
  const t=copy[lang];
  useEffect(()=>setPageMetadata({lang,title:t.title,description:t.body,path:`/${lang}/dealers`,robots:'noindex,nofollow'}),[lang,t]);
  return <div className="catalog-site" lang={lang}><header className="catalog-header"><a className="catalog-brand" href={`/www/${lang}`}>ALSVID</a><nav><a href={`/www/${lang}`}>{t.home}</a><a href="/dealer">{t.account}</a></nav></header><main><section className="catalog-intro"><h1>{t.title}</h1><p>{t.body}</p><p><a href={`/${lang}/dealers/locations`}>{t.sales}</a> · <a href={`/${lang}/service-locations`}>{t.service}</a></p><DealerApplicationForm lang={lang} captureMetadata/></section></main></div>;
}
