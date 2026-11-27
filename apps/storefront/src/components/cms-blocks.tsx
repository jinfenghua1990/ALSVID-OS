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

export function CmsBlocks({ blocks, locale, moduleIds = {} }: { blocks: CmsBlock[]; locale: Locale; moduleIds?: Record<string, string> }) {
  return <div className="cms-blocks">{blocks.filter(block => block.visible !== false).map(block => {
    const { props = {}, data = {} } = block;
    const moduleId=moduleIds[block.id]||moduleIds[block.componentKey];
    if (block.componentKey === 'hero') {
      const hasBg = Boolean(props.imageId);
      if (!hasBg) {
        return (
          <section className="container hero" key={block.id} data-module-id={moduleId}>
            <p className="eyebrow">{props.eyebrow}</p>
            <h1>{props.title}</h1>
            <p className="lede">{props.intro}</p>
            {props.ctaLabel && <CtaLink locale={locale} href={props.ctaHref}>{props.ctaLabel} →</CtaLink>}
          </section>
        );
      }
      return (
        <section
          key={block.id}
          data-module-id={moduleId}
          style={{
            position: 'relative',
            minHeight: '88vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '80px clamp(24px, 6vw, 120px)',
            overflow: 'hidden',
            color: props.theme === 'light' ? '#111827' : '#ffffff',
            background: '#0d1210',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
            <Image
              src={publicAssetUrl(props.imageId)}
              alt={props.title || ''}
              fill
              priority
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              sizes="100vw"
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: props.theme === 'light'
                  ? 'linear-gradient(to right, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.4) 55%, transparent 100%)'
                  : 'linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)'
              }}
            />
          </div>
          <div style={{ position: 'relative', zIndex: 2, maxWidth: 640 }}>
            {props.eyebrow && (
              <p style={{
                color: props.theme === 'light' ? '#059669' : '#34d399',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                margin: '0 0 14px'
              }}>
                {props.eyebrow}
              </p>
            )}
            <h1 style={{
              color: 'inherit',
              margin: '0 0 18px',
              fontWeight: 700,
              fontSize: 'clamp(36px, 5.5vw, 68px)',
              lineHeight: 1.08,
              letterSpacing: '-0.02em'
            }}>
              {props.title}
            </h1>
            {props.intro && (
              <p style={{
                color: props.theme === 'light' ? '#4b5563' : 'rgba(255,255,255,0.82)',
                fontSize: 'clamp(16px, 1.8vw, 20px)',
                lineHeight: 1.6,
                margin: '0 0 28px'
              }}>
                {props.intro}
              </p>
            )}
            {props.ctaLabel && (
              <div>
                <CtaLink locale={locale} href={props.ctaHref}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      background: props.theme === 'light' ? '#111827' : '#ffffff',
                      color: props.theme === 'light' ? '#ffffff' : '#111827',
                      padding: '14px 28px',
                      borderRadius: 30,
                      fontSize: 15,
                      fontWeight: 600,
                      textDecoration: 'none',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.18)'
                    }}
                  >
                    {props.ctaLabel} →
                  </span>
                </CtaLink>
              </div>
            )}
          </div>
        </section>
      );
    }
    if (block.componentKey === 'twoColumn') return <section className="container cms-two-column" key={block.id} data-module-id={moduleId}>{props.imageId && <Image src={publicAssetUrl(props.imageId)} alt={props.imageAlt || ''} width={1000} height={760} sizes="(max-width:720px) 90vw, 45vw"/>}<div><h2>{props.title}</h2>{String(props.body || '').split('\n').filter(Boolean).map((line: string, i: number) => <p key={i}>{line}</p>)}</div></section>;
    if (block.componentKey === 'image') return props.imageId ? <section className="container cms-image" key={block.id}>
      {props.href ? <CtaLink locale={locale} href={props.href}><Image src={publicAssetUrl(props.imageId)} alt={props.alt || ''} width={1600} height={1000} sizes="(max-width:900px) 94vw, 1200px"/></CtaLink> : <Image src={publicAssetUrl(props.imageId)} alt={props.alt || ''} width={1600} height={1000} sizes="(max-width:900px) 94vw, 1200px"/>}
      {props.caption && <p>{props.caption}</p>}
    </section> : null;
    if (block.componentKey === 'carousel') return <section className="container cms-carousel" key={block.id} data-module-id={moduleId}>
      {props.heading && <h2>{props.heading}</h2>}
      <div className="cms-carousel__track">{(props.items || []).filter((item: any) => item.imageId).map((item: any, i: number) => <figure key={i}>
        {item.href ? <CtaLink locale={locale} href={item.href}><Image src={publicAssetUrl(item.imageId)} alt={item.alt || ''} width={1400} height={900} sizes="(max-width:720px) 86vw, 50vw"/></CtaLink> : <Image src={publicAssetUrl(item.imageId)} alt={item.alt || ''} width={1400} height={900} sizes="(max-width:720px) 86vw, 50vw"/>}
        {item.caption && <figcaption>{item.caption}</figcaption>}
      </figure>)}</div>
    </section>;
    if (block.componentKey === 'divider') return <hr className={'container cms-divider is-' + (props.style === 'soft' ? 'soft' : 'line')} key={block.id}/>;
    if (block.componentKey === 'spacer') return <div className="cms-spacer" style={{ height: Number(props.height) || 48 }} aria-hidden="true" key={block.id}/>;
    if (block.componentKey === 'video') return <section className="container cms-video" key={block.id} data-module-id={moduleId}>{props.title && <h2>{props.title}</h2>}{data.videoUrl && <video controls playsInline preload="metadata" src={publicApiUrl(data.videoUrl)} />}{props.caption && <p>{props.caption}</p>}</section>;
    if (block.componentKey === 'productGallery') return <section className="container catalog" key={block.id} data-module-id={moduleId}><h2>{props.heading}</h2><div className="product-grid">{(data.products || []).map((product: any) => <Link className="product-card" key={product.id} href={`/${locale}/e-bikes/${encodeURIComponent(product.slug || product.id)}`}>{product.image?.url && <Image src={publicApiUrl(product.image.url)} alt={product.title} width={900} height={760} sizes="(max-width:720px) 90vw, 30vw"/>}<div className="product-copy"><h3>{product.title}</h3></div></Link>)}</div></section>;
    if (block.componentKey === 'specs') return <section className="container cms-specs" key={block.id}><h2>{props.heading}</h2><ul className="spec-list">{(data.specifications || []).map((item: any, i: number) => <li key={i}><span>{item.label}</span><strong>{item.value}{item.unit ? ` ${item.unit}` : ''}</strong></li>)}</ul></section>;
    if (block.componentKey === 'features') return <section className="container cms-features" key={block.id} data-module-id={moduleId}><h2>{props.heading}</h2><div className="product-grid">{(props.items || []).map((item: any, i: number) => <article className="product-copy" key={i}><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>;
    if (block.componentKey === 'faq') return <section className="container cms-faq" key={block.id}><h2>{props.heading}</h2>{(props.items || []).map((item: any, i: number) => <details key={i}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>;
    if (block.componentKey === 'cta') return <section className="container cms-cta" key={block.id}><h2>{props.title}</h2><p>{props.text}</p>{props.buttonLabel && <CtaLink locale={locale} href={props.buttonHref}>{props.buttonLabel} →</CtaLink>}</section>;
    if (block.componentKey === 'article') return <article className="container cms-article" key={block.id} data-module-id={moduleId}>
      {props.heading && <h1>{props.heading}</h1>}
      {props.intro && <p className="lede">{props.intro}</p>}
      {props.imageId && <Image className="cms-article__hero" src={publicAssetUrl(props.imageId)} alt={props.imageAlt || props.heading || ''} width={1536} height={1024} sizes="(max-width:900px) 94vw, 860px" priority/>}
      {(props.sections || []).map((section: any, i: number) => <section className="cms-article__section" id={`abschnitt-${i + 1}`} key={i}>
        {section.heading && <h2>{section.heading}</h2>}
        {section.imageId && <Image className="cms-article__image" src={publicAssetUrl(section.imageId)} alt={section.imageAlt || section.heading || ''} width={1200} height={800} sizes="(max-width:900px) 92vw, 820px"/>}
        {String(section.body || '').split('\n').filter(Boolean).map((line: string, j: number) => <p key={j}>{line}</p>)}
      </section>)}
    </article>;
    if (block.componentKey === 'comparison') {
      const comp = data.comparison || { products: [], specLabels: [] };
      const products = comp.products || [];
      return <section className="container cms-comparison" key={block.id}>
        {props.heading && <h2>{props.heading}</h2>}
        {products.length > 0 ? <div className="cms-comparison__table-wrap">
          <table>
            <thead>
              <tr>
                <th>{locale === 'de' ? 'Modell' : locale === 'zh' ? '对比车型' : 'Model'}</th>
                {products.map((p: any) => <th key={p.id}>
                  <div className="cms-comparison__card">
                    {p.image?.url && <Image src={publicApiUrl(p.image.url)} alt={p.title} width={300} height={200} sizes="(max-width:720px) 40vw, 220px"/>}
                    <strong>{p.title}</strong>
                    {p.prices?.[0] && <small className="price">{p.prices[0].currency} {p.prices[0].unitPrice}</small>}
                    <Link href={`/${locale}/e-bikes/${encodeURIComponent(p.slug || p.id)}`} className="button small" style={{ marginTop: 6 }}>
                      {locale === 'de' ? 'Details ansehen' : locale === 'zh' ? '查看详情' : 'View details'} →
                    </Link>
                  </div>
                </th>)}
              </tr>
            </thead>
            <tbody>
              {(comp.specLabels || []).map((label: string) => <tr key={label}>
                <th>{label}</th>
                {products.map((p: any) => <td key={p.id}>{p.specifications?.find((s: any) => s.label === label)?.value || '—'}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div> : <p className="hint empty-state">{props.emptyNotice || (locale === 'de' ? 'Keine Vergleichsmodelle verfügbar' : locale === 'zh' ? '暂未配置对比车型' : 'No comparison models available')}</p>}
      </section>;
    }
    if (block.componentKey === 'reviews') {
      const rev = data.reviews || { summary: { total: 0, average: '0', goodRate: 0 }, items: [] };
      return <section className="container cms-reviews-box" key={block.id}>
        {props.heading && <h2>{props.heading}</h2>}
        <div className="cms-reviews-summary">
          <span className="cms-reviews-score">{rev.summary.average} / 5</span>
          <span className="cms-reviews-stars">{'★'.repeat(Math.round(Number(rev.summary.average) || 0))}{'☆'.repeat(Math.max(0, 5 - Math.round(Number(rev.summary.average) || 0)))}</span>
          <span className="cms-reviews-meta">{locale === 'de' ? `${rev.summary.total} verifizierte Bewertungen (${rev.summary.goodRate}% positiv)` : locale === 'zh' ? `共 ${rev.summary.total} 条真实车主评价（好评率 ${rev.summary.goodRate}%）` : `${rev.summary.total} verified reviews (${rev.summary.goodRate}% positive)`}</span>
        </div>
        {rev.items?.length > 0 ? <div className="cms-reviews-list">
          {rev.items.map((item: any) => <article className="cms-review-card" key={item.id}>
            <div className="cms-review-card__head">
              <span className="cms-reviews-stars">{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span>
              <span className="cms-review-card__verified">{locale === 'de' ? 'Verifizierter Käufer' : locale === 'zh' ? '官方认证车主' : 'Verified Buyer'}</span>
            </div>
            <p className="cms-review-content">{item.content}</p>
            {item.reply && <div className="cms-review-reply">
              <strong>{locale === 'de' ? 'Antwort von ALSVID:' : locale === 'zh' ? '品牌方回复：' : 'Response from ALSVID:'}</strong>
              <p>{item.reply}</p>
            </div>}
          </article>)}
        </div> : <p className="empty-state">{locale === 'de' ? 'Noch keine verifizierten Bewertungen für dieses Modell vorhanden.' : locale === 'zh' ? '当前车型暂无真实车主评价（禁止虚假刷评，评价仅来自真实订单）。' : 'No verified customer reviews yet for this model.'}</p>}
      </section>;
    }
    if (block.componentKey === 'accessories') {
      const accs = data.accessories || [];
      return <section className="container product-related" key={block.id}>
        {props.heading && <h2>{props.heading}</h2>}
        {accs.length > 0 ? <div className="product-related__grid">
          {accs.map((item: any) => <Link key={item.id} href={`/${locale}/e-bikes/${encodeURIComponent(item.slug || item.id)}`}>
            <div>{item.image?.url ? <Image src={publicApiUrl(item.image.url)} alt={item.title} width={360} height={260} sizes="(max-width:720px) 45vw, 240px"/> : <span>{item.title}</span>}</div>
            <strong>{item.title}</strong>
            {item.prices?.length > 0 && <small>{item.prices.map((p: any) => `${p.currency} ${p.unitPrice}`).join(' · ')}</small>}
          </Link>)}
        </div> : <p className="empty-state">{locale === 'de' ? 'Derzeit kein passendes Zubehör für dieses Modell verknüpft.' : locale === 'zh' ? '当前车型暂无适配正品配件（严格按适配关系表展示，不伪造）。' : 'No compatible accessories linked for this model.'}</p>}
      </section>;
    }
    if (block.componentKey === 'manuals') {
      const docs = data.manuals || [];
      return <section className="container cms-manuals" key={block.id}>
        {props.heading && <h2>{props.heading}</h2>}
        {docs.length > 0 ? <div className="cms-manuals-grid">
          {docs.map((doc: any) => <a key={doc.id || doc.title} className="cms-manual-card" href={doc.downloadUrl ? publicApiUrl(doc.downloadUrl) : '#'} download target="_blank" rel="noreferrer">
            <div className="cms-manual-card__info">
              <span className="cms-manual-card__badge">{doc.format || 'PDF'}{doc.sizeBytes ? ` · ${(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}</span>
              <strong>{doc.title}</strong>
              {doc.fileName && <small className="muted">{doc.fileName}</small>}
            </div>
            <span className="cms-manual-card__btn">{locale === 'de' ? 'Download' : locale === 'zh' ? '下载' : 'Download'} ↓</span>
          </a>)}
        </div> : <p className="empty-state">{locale === 'de' ? 'Derzeit keine technischen Dokumente oder Handbücher verfügbar.' : locale === 'zh' ? '当前车型暂无相关说明书或技术文档。' : 'No technical documents or manuals available.'}</p>}
      </section>;
    }
    return null;
  })}</div>;
}
