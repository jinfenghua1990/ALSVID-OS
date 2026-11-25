import Link from 'next/link';
import Image from 'next/image';
import type { CmsBlock, Locale } from '@/lib/alsvid-api';
import { publicApiUrl, publicAssetUrl } from '@/lib/alsvid-api';

function siteHref(href: string, locale: Locale) {
  return href.replace(/^\/www\/(de|en)\/products(?:\/|$)/, (_, lang: Locale) => `/${lang}/e-bikes/`);
}

function CtaLink({ href, children, locale }: { href: string; children: React.ReactNode; locale: Locale }) {
  const target = siteHref(href || `/${locale}`, locale);
  if (/^https?:\/\//.test(target)) return <a href={target} rel="noreferrer">{children}</a>;
  return <Link href={target}>{children}</Link>;
}

export function CmsBlocks({ blocks, locale }: { blocks: CmsBlock[]; locale: Locale }) {
  return <div className="cms-blocks">{blocks.filter(block => block.visible !== false).map(block => {
    const { props = {}, data = {} } = block;
    if (block.componentKey === 'hero') return <section className="container hero" key={block.id}><p className="eyebrow">{props.eyebrow}</p><h1>{props.title}</h1><p className="lede">{props.intro}</p>{props.ctaLabel && <CtaLink locale={locale} href={props.ctaHref}>{props.ctaLabel} →</CtaLink>}</section>;
    if (block.componentKey === 'twoColumn') return <section className="container cms-two-column" key={block.id}>{props.imageId && <Image src={publicAssetUrl(props.imageId)} alt={props.imageAlt || ''} width={1000} height={760} sizes="(max-width:720px) 90vw, 45vw"/>}<div><h2>{props.title}</h2>{String(props.body || '').split('\n').filter(Boolean).map((line: string, i: number) => <p key={i}>{line}</p>)}</div></section>;
    if (block.componentKey === 'video') return <section className="container cms-video" key={block.id}>{props.title && <h2>{props.title}</h2>}{data.videoUrl && <video controls playsInline preload="metadata" src={publicApiUrl(data.videoUrl)} />}{props.caption && <p>{props.caption}</p>}</section>;
    if (block.componentKey === 'productGallery') return <section className="container catalog" key={block.id}><h2>{props.heading}</h2><div className="product-grid">{(data.products || []).map((product: any) => <Link className="product-card" key={product.id} href={`/${locale}/e-bikes/${encodeURIComponent(product.slug || product.id)}`}>{product.image?.url && <Image src={publicApiUrl(product.image.url)} alt={product.title} width={900} height={760} sizes="(max-width:720px) 90vw, 30vw"/>}<div className="product-copy"><h3>{product.title}</h3></div></Link>)}</div></section>;
    if (block.componentKey === 'specs') return <section className="container cms-specs" key={block.id}><h2>{props.heading}</h2><ul className="spec-list">{(data.specifications || []).map((item: any, i: number) => <li key={i}><span>{item.label}</span><strong>{item.value}{item.unit ? ` ${item.unit}` : ''}</strong></li>)}</ul></section>;
    if (block.componentKey === 'features') return <section className="container cms-features" key={block.id}><h2>{props.heading}</h2><div className="product-grid">{(props.items || []).map((item: any, i: number) => <article className="product-copy" key={i}><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>;
    if (block.componentKey === 'faq') return <section className="container cms-faq" key={block.id}><h2>{props.heading}</h2>{(props.items || []).map((item: any, i: number) => <details key={i}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
    if (block.componentKey === 'cta') return <section className="container cms-cta" key={block.id}><h2>{props.title}</h2><p>{props.text}</p>{props.buttonLabel && <CtaLink locale={locale} href={props.buttonHref}>{props.buttonLabel} →</CtaLink>}</section>;
    if (block.componentKey === 'article') return <article className="container cms-article" key={block.id}>
      {props.heading && <h1>{props.heading}</h1>}
      {props.intro && <p className="lede">{props.intro}</p>}
      {props.imageId && <Image className="cms-article__hero" src={publicAssetUrl(props.imageId)} alt={props.imageAlt || props.heading || ''} width={1536} height={1024} sizes="(max-width:900px) 94vw, 860px" priority/>}
      {(props.sections || []).map((section: any, i: number) => <section className="cms-article__section" id={`abschnitt-${i + 1}`} key={i}>
        {section.heading && <h2>{section.heading}</h2>}
        {section.imageId && <Image className="cms-article__image" src={publicAssetUrl(section.imageId)} alt={section.imageAlt || section.heading || ''} width={1200} height={800} sizes="(max-width:900px) 92vw, 820px"/>}
        {String(section.body || '').split('\n').filter(Boolean).map((line: string, j: number) => <p key={j}>{line}</p>)}
      </section>)}
    </article>;
    return null;
  })}</div>;
}
