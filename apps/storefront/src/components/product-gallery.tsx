'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { CatalogProduct, Locale } from '@/lib/alsvid-api';

const labels = {
  de: { gallery: 'Produktbilder', previous: 'Vorheriges Bild', next: 'Nächstes Bild' },
  en: { gallery: 'Product images', previous: 'Previous image', next: 'Next image' },
  zh: { gallery: '商品图片', previous: '上一张', next: '下一张' },
} satisfies Record<Locale, Record<string, string>>;

export function ProductGallery({ images, title, locale, productId, style = 'standard' }: { images: CatalogProduct['images']; title: string; locale: Locale; productId:string; style?: 'standard' | 'immersive' | 'mosaic' | 'columns' }) {
  const [active, setActive] = useState(0);
  const [variantImages,setVariantImages]=useState<CatalogProduct['images']|null>(null);
  const displayImages=variantImages?.length?variantImages:images;
  useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.productId!==productId)return;const next=Array.isArray(detail.images)?detail.images.filter((x:any)=>x&&typeof x.url==='string'&&typeof x.id==='string'):[];setVariantImages(next.length?next:null);setActive(0)};window.addEventListener('alsvid:purchase-config',handler);return()=>window.removeEventListener('alsvid:purchase-config',handler)},[productId]);
  const current = displayImages[active] || displayImages[0];
  const dialog=useRef<HTMLDialogElement>(null);
  const t = labels[locale];
  // 客户端组件里读不到服务端 env（非 NEXT_PUBLIC_ 变量在构建时被替换为 undefined），
  // 所以这里绝不能用 process.env.ALSVID_API_ORIGIN 拼绝对地址 —— 那会固化成
  // localhost:8089。站内 /api/* 有同域代理，相对路径就是正确做法。
  const src = (url: string) => (/^https?:\/\//i.test(url) ? url : url.startsWith('/') ? url : `/${url}`);

  return <div className={`product-gallery product-gallery--${style}`} aria-label={t.gallery}>
    <dialog ref={dialog} className="gallery-dialog" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}><div className="gallery-dialog-inner"><button type="button" className="gallery-close" onClick={()=>dialog.current?.close()} aria-label={locale==='zh'?'关闭':locale==='de'?'Schließen':'Close'}>×</button>{current&&<Image src={src(current.url)} alt={title} width={1600} height={1200} sizes="90vw"/>}{displayImages.length>1&&<><button type="button" className="product-gallery__arrow is-prev" aria-label={t.previous} onClick={()=>setActive(i=>(i-1+displayImages.length)%displayImages.length)}>‹</button><button type="button" className="product-gallery__arrow is-next" aria-label={t.next} onClick={()=>setActive(i=>(i+1)%displayImages.length)}>›</button></>}</div></dialog>
    {style === 'mosaic' && displayImages.length > 0 ? <div className="product-gallery__mosaic">{displayImages.map((image, index) => <button key={image.id} type="button" aria-label={`${title} ${index + 1}`} onClick={() => {setActive(index);dialog.current?.showModal()}}><Image src={src(image.url)} alt={`${title} ${index + 1}`} width={900} height={760} sizes="(max-width:720px) 45vw, 28vw" priority={index === 0}/></button>)}</div> : <>
    <div className="product-gallery__main">
      {current ? <Image src={src(current.url)} alt={`${title} ${active + 1}`} width={1200} height={1000} sizes="(max-width:720px) 90vw, 55vw" priority={active === 0} /> : <div className="product-gallery__empty">{title}</div>}
      {current&&<button type="button" className="gallery-enlarge" aria-label={locale==='de'?'Bild vergrößern':locale==='en'?'Enlarge image':'放大图片'} onClick={()=>dialog.current?.showModal()}>⤢</button>}
      {displayImages.length > 1 && <>
        <button className="product-gallery__arrow is-prev" type="button" aria-label={t.previous} onClick={() => setActive(index => (index - 1 + displayImages.length) % displayImages.length)}>‹</button>
        <button className="product-gallery__arrow is-next" type="button" aria-label={t.next} onClick={() => setActive(index => (index + 1) % displayImages.length)}>›</button>
      </>}
    </div>
    {images.length > 1 && <div className="product-gallery__thumbs" aria-label={t.gallery}>
      {images.map((image, index) => <button key={image.id} type="button" className={index === active ? 'is-active' : ''} aria-label={`${title} ${index + 1}`} aria-pressed={index === active} onClick={() => setActive(index)}>
        <Image src={src(image.url)} alt="" width={160} height={140} sizes="96px" />
      </button>)}
    </div>}
    </>}
  </div>;
}
