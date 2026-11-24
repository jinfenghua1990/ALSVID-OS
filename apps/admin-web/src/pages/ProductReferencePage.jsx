import React, { useEffect } from 'react';
import { setPageMetadata } from '../seo.js';
import { L7ProductPage } from '../website/_components/product/l7-product';
import { L8ProductPage } from '../website/_components/product/l8-product';
import { Fc2ProductPage } from '../website/_components/product/fc2-product';
import { Fc1StoryPage } from '../website/_components/product/fc1-story-v4';
import { CupHolderProductPage } from '../website/_components/product/cup-holder-product';
import './catalog.css';

export default function ProductReferencePage({ lang, product }) {
  const slug = product === 'l8' ? 'l1' : product;
  useEffect(() => setPageMetadata({
    lang, title: product === 'l7' ? 'ALSVID A1' : product === 'fc1' ? 'ALSVID A1 Ultra' : product === 'fc2' ? 'ALSVID L1 Pro' : product === 'accessory-cup-holder' ? 'ALSVID Cup Holder' : 'ALSVID L1',
    description: '', path: `/${lang}/explore/${slug}`, robots: 'noindex,nofollow',
  }), [lang, product, slug]);
  return product === 'l7' ? <L7ProductPage locale={lang} myUrl="/my" /> : product === 'fc1' ? <Fc1StoryPage locale={lang} myUrl="/my" /> : product === 'fc2' ? <Fc2ProductPage locale={lang} myUrl="/my" dealerUrl="/dealer" /> : product === 'accessory-cup-holder' ? <CupHolderProductPage locale={lang} /> : <L8ProductPage locale={lang} myUrl="/my" />;
}
