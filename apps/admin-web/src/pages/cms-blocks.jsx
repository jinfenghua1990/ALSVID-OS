import React from 'react';
import { api } from '../api.js';

export const COMPONENTS = [
  { key: 'hero', label: 'KV / Hero', description: '首屏标题、介绍与主按钮', defaults: { eyebrow: 'ALSVID', title: '', intro: '', ctaLabel: '', ctaHref: '' } },
  { key: 'twoColumn', label: '图文双栏', description: '左图右文或左文右图', defaults: { title: '', body: '', imageId: '', imageSide: 'right' } },
  { key: 'image', label: '单图展示', description: '独立图片、说明文字与可选链接', defaults: { imageId: '', alt: '', caption: '', href: '' } },
  { key: 'carousel', label: '图片轮播', description: '最多 8 张图片组成可滑动轮播', defaults: { heading: '', items: [{ imageId: '', alt: '', caption: '', href: '' }] } },
  { key: 'divider', label: '分隔线', description: '内容区域之间的标准分隔模块', defaults: { style: 'line' } },
  { key: 'spacer', label: '留白区域', description: '统一控制模块之间的垂直留白', defaults: { height: 48 } },
  { key: 'video', label: '视频展示', description: '从页面素材中选择 MP4 或 WebM 视频', defaults: { title: '', caption: '', videoId: '' } },
  { key: 'productGallery', label: '商品图库', description: '绑定已发布商品，读取商品主数据', defaults: { heading: 'Produkte' } },
  { key: 'specs', label: '技术参数', description: '只读绑定产品主数据的公开参数', defaults: { heading: 'Technische Daten' } },
  { key: 'features', label: '卖点卡片', description: '2–6 个卖点', defaults: { heading: '', items: [{ title: '', text: '' }] } },
  { key: 'faq', label: 'FAQ', description: '常见问题折叠列表', defaults: { heading: 'FAQ', items: [{ question: '', answer: '' }] } },
  { key: 'cta', label: 'CTA 行动区', description: '底部转化按钮', defaults: { title: '', text: '', buttonLabel: '', buttonHref: '/' } },
  { key: 'comparison', label: '车型对比', description: '横向对比 2-4 款车型的真实规格与售价', defaults: { heading: 'Modellvergleich', emptyNotice: '' } },
  { key: 'reviews', label: '车主评价', description: '自动绑定真实已公开车主评价与品牌回复', defaults: { heading: 'Kundenbewertungen', limit: 10 } },
  { key: 'accessories', label: '适配配件', description: '自动从适配关系表匹配当前车型的正品配件', defaults: { heading: 'Passendes Zubehör', limit: 12 } },
  { key: 'manuals', label: '说明书与下载', description: '整车用户手册、证书或技术文档下载', defaults: { heading: 'Handbücher & Downloads', items: [] } },
];

export function createBlock(componentKey) {
  const definition = COMPONENTS.find(item => item.key === componentKey) || COMPONENTS[0];
  return {
    id: `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    componentKey: definition.key,
    schemaVersion: 1,
    visible: true,
    props: structuredClone(definition.defaults),
    bindings: (definition.key === 'productGallery' || definition.key === 'comparison') ? { productIds: [] } : ['specs', 'reviews', 'accessories', 'manuals'].includes(definition.key) ? { productId: '', fieldSet: 'public_specs' } : {},
  };
}

export function blockLabel(block) {
  return COMPONENTS.find(item => item.key === block.componentKey)?.label || block.componentKey;
}

export function BlockRenderer({ block, lang = 'zh' }) {
  const { props = {}, bindings = {}, data = {} } = block;
  if (block.visible === false) return null;
  const blockId = block.id || undefined;
  if (block.componentKey === 'hero') return <section id={blockId} className="cms-block cms-hero">
    {props.eyebrow && <p className="catalog-eyebrow">{props.eyebrow}</p>}
    <h1>{props.title || '未填写标题'}</h1>
    {props.intro && <p>{props.intro}</p>}
    {props.ctaLabel && <a className="catalog-home-button" href={props.ctaHref || '/'}>{props.ctaLabel} →</a>}
  </section>;
  if (block.componentKey === 'twoColumn') {
    const media = props.imageId ? <img src={api.assetUrl(props.imageId)} alt="" loading="lazy" /> : <div className="cms-image-empty">未选择图片</div>;
    return <section id={blockId} className={'cms-block cms-two-col' + (props.imageSide === 'left' ? ' is-left' : '')}>
      <div className="cms-two-col-media">{media}</div>
      <div className="cms-two-col-copy">{props.title && <h2>{props.title}</h2>}{props.body && String(props.body).split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</div>
    </section>;
  }
  if (block.componentKey === 'image') return <section id={blockId} className="cms-block cms-image">
    {props.imageId ? <img src={api.assetUrl(props.imageId)} alt={props.alt || ''} loading="lazy" /> : <div className="cms-image-empty">请选择图片素材</div>}
    {props.caption && <p>{props.caption}</p>}
  </section>;
  if (block.componentKey === 'carousel') return <section id={blockId} className="cms-block cms-carousel">
    {props.heading && <h2>{props.heading}</h2>}
    <div className="cms-carousel__track">{(props.items || []).filter(item => item.imageId).map((item, index) => <figure key={index}>
      <img src={api.assetUrl(item.imageId)} alt={item.alt || ''} loading="lazy" />
      {item.caption && <figcaption>{item.caption}</figcaption>}
    </figure>)}</div>
    {!(props.items || []).some(item => item.imageId) && <div className="cms-image-empty">添加轮播图片</div>}
  </section>;
  if (block.componentKey === 'divider') return <div id={blockId} className={'cms-block cms-divider is-' + (props.style === 'soft' ? 'soft' : 'line')} role="separator" />;
  if (block.componentKey === 'spacer') return <div id={blockId} className="cms-block cms-spacer" style={{ height: Number(props.height) || 48 }} aria-hidden="true" />;
  if (block.componentKey === 'video') return <section id={blockId} className="cms-block cms-video">
    {props.title && <h2>{props.title}</h2>}
    {data.videoUrl ? <video controls playsInline preload="metadata" src={data.videoUrl} /> : <div className="cms-image-empty">请选择页面视频素材</div>}
    {props.caption && <p>{props.caption}</p>}
  </section>;
  if (block.componentKey === 'productGallery') {
    const products = data.products || [];
    return <section id={blockId} className="cms-block">
      {props.heading && <h2>{props.heading}</h2>}
      {products.length ? <div className="catalog-grid">{products.map(product => <a className="catalog-card" key={product.id} href={`/www/${lang}/products/${encodeURIComponent(product.id)}`}><div className="catalog-card-image">{product.image?.url ? <img src={product.image.url} alt={product.title} loading="lazy" /> : <div className="catalog-no-image">{product.title}</div>}</div><div className="catalog-card-copy"><p className="catalog-eyebrow">{product.kind === 'vehicle' ? 'vehicle' : 'part'}</p><h3>{product.title}</h3></div></a>)}</div> : <p className="hint" />}
    </section>;
  }
  if (block.componentKey === 'specs') {
    const rows = data.specifications || [];
    return <section id={blockId} className="cms-block cms-specs">
      {props.heading && <h2>{props.heading}</h2>}
      {rows.length ? <table className="cms-specs-table"><tbody>{rows.map((row, index) => <tr key={row.code || index}><th>{row.label}</th><td>{row.value}{row.unit ? ` ${row.unit}` : ''}</td></tr>)}</tbody></table> : <p className="hint" />}
    </section>;
  }
  if (block.componentKey === 'features') return <section id={blockId} className="cms-block">
    {props.heading && <h2>{props.heading}</h2>}
    <div className="cms-features">{(props.items || []).map((item, index) => <article key={index}><h3>{item.title || '卖点标题'}</h3><p>{item.text}</p></article>)}</div>
  </section>;
  if (block.componentKey === 'faq') return <section id={blockId} className="cms-block">
    {props.heading && <h2>{props.heading}</h2>}
    <div className="cms-faq">{(props.items || []).map((item, index) => <details key={index}><summary>{item.question || '问题'}</summary><p>{item.answer}</p></details>)}</div>
  </section>;
  if (block.componentKey === 'cta') return <section id={blockId} className="cms-block cms-cta">
    <h2>{props.title || '行动标题'}</h2>{props.text && <p>{props.text}</p>}
    {props.buttonLabel && <a className="catalog-home-button" href={props.buttonHref || '/'}>{props.buttonLabel} →</a>}
  </section>;
  if (block.componentKey === 'comparison') {
    const comp = data.comparison || { products: [], specLabels: [] };
    const products = comp.products || [];
    return <section id={blockId} className="cms-block cms-specs">
      {props.heading && <h2>{props.heading}</h2>}
      {products.length ? <div style={{ overflowX: 'auto' }}>
        <table className="cms-specs-table">
          <thead>
            <tr>
              <th>对比项目</th>
              {products.map(p => <th key={p.id}><strong>{p.title}</strong>{p.prices?.[0] ? <div className="muted">{p.prices[0].currency} {p.prices[0].unitPrice}</div> : null}</th>)}
            </tr>
          </thead>
          <tbody>
            {(comp.specLabels || []).map(label => <tr key={label}>
              <th>{label}</th>
              {products.map(p => <td key={p.id}>{p.specifications?.find(s => s.label === label)?.value || '—'}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="hint">请在属性面板选择 2–4 款对比车型，将自动绑定真实规格。</p>}
    </section>;
  }
  if (block.componentKey === 'reviews') {
    const rev = data.reviews || { summary: { total: 0, average: '0' }, items: [] };
    return <section id={blockId} className="cms-block">
      {props.heading && <h2>{props.heading}</h2>}
      <div className="row" style={{ alignItems: 'baseline', gap: 12, margin: '12px 0' }}>
        <strong style={{ fontSize: 28 }}>{rev.summary.average} / 5</strong>
        <span className="muted">共 {rev.summary.total} 条真实车主评价</span>
      </div>
      {rev.items?.length ? <div className="cms-features">{rev.items.map(item => <article key={item.id}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</strong>
          <small className="muted">{item.author || '已验证车主'}</small>
        </div>
        <p>{item.content}</p>
        {item.reply && <p className="muted" style={{ borderLeft: '2px solid #555', paddingLeft: 8 }}>品牌回复：{item.reply}</p>}
      </article>)}</div> : <p className="hint">当前商品暂无已公开车主评价（数据严格来自真实订单评价，不伪造）。</p>}
    </section>;
  }
  if (block.componentKey === 'accessories') {
    const accs = data.accessories || [];
    return <section id={blockId} className="cms-block">
      {props.heading && <h2>{props.heading}</h2>}
      {accs.length ? <div className="catalog-grid">{accs.map(acc => <a className="catalog-card" key={acc.id} href={`/www/${lang}/products/${encodeURIComponent(acc.slug || acc.id)}`}>
        <div className="catalog-card-image">{acc.image?.url ? <img src={acc.image.url} alt={acc.title} loading="lazy" /> : <div className="catalog-no-image">{acc.title}</div>}</div>
        <div className="catalog-card-copy"><p className="catalog-eyebrow">适配配件</p><h3>{acc.title}</h3>{acc.prices?.[0] ? <small>{acc.prices[0].currency} {acc.prices[0].unitPrice}</small> : null}</div>
      </a>)}</div> : <p className="hint">暂无适配配件（数据严格来自 fits 车型配件适配关系表）。</p>}
    </section>;
  }
  if (block.componentKey === 'manuals') {
    const docs = data.manuals || [];
    return <section id={blockId} className="cms-block">
      {props.heading && <h2>{props.heading}</h2>}
      {docs.length ? <div className="cms-features">{docs.map(doc => <article key={doc.id || doc.title}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>📄 {doc.title}</strong>
          <span className="cms-badge">{doc.format || 'PDF'}</span>
        </div>
        {doc.fileName && <p className="muted">{doc.fileName}</p>}
        {doc.downloadUrl && <a className="btn small" href={doc.downloadUrl} target="_blank" rel="noreferrer">下载文档</a>}
      </article>)}</div> : <p className="hint">暂无可下载文档或技术手册。</p>}
    </section>;
  }
  return <section className="cms-block cms-warning">未知组件：{block.componentKey}，发布前请移除。</section>;
}

export function BlocksRenderer({ blocks = [], lang = 'zh' }) {
  return <div className="cms-blocks">{blocks.filter(block => block.visible !== false).map(block => <BlockRenderer key={block.id} block={block} lang={lang}/>)}</div>;
}
