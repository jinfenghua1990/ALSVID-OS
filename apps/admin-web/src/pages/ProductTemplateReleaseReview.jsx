import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import './unified-design.css';

const LANG = { zh: '中文', en: '英文', de: '德文' };

export default function ProductTemplateReleaseReview({ page, previewScope, productId = '', storefrontOrigin, onPublished, onClose }) {
  const [session, setSession] = useState(null);
  const [active, setActive] = useState(0);
  const [receipts, setReceipts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const frame = useRef(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const start = async () => {
    setBusy(true); setError(''); setSession(null); setReceipts({}); setActive(0);
    try {
      if (!storefrontOrigin) throw Error('未配置有效的商城前台地址，无法进行真实页面预览');
      const response = await api.startProductTemplateReview(page.id, {
        revision: page.revision,
        previewScope,
        productId,
      });
      if (!Array.isArray(response.slots) || response.slots.length !== 6 || response.revision !== page.revision) throw Error('六项预览会话不完整');
      if (alive.current) setSession(response);
    } catch (e) {
      if (alive.current) setError(e.message || '无法启动预览');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const slot = session?.slots[active];
  const key = slot ? `${slot.locale}:${slot.device}` : '';
  useEffect(() => {
    if (!session || !slot || !storefrontOrigin) return undefined;
    const listener = event => {
      if (event.source !== frame.current?.contentWindow || event.origin !== storefrontOrigin || event.data?.type !== 'alsvid:product-template-review-confirm' || event.data.session !== session.session || event.data.locale !== slot.locale || event.data.device !== slot.device || typeof event.data.receipt !== 'string') return;
      setReceipts(old => ({ ...old, [key]: event.data.receipt }));
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [session, slot, storefrontOrigin, key]);

  const publish = async () => {
    if (!session || busy || session.slots.some(item => !receipts[`${item.locale}:${item.device}`])) return;
    if (!window.confirm('确认将这份商品模板发布到正式商城？')) return;
    setBusy(true); setError('');
    try {
      const updated = await api.publishReviewedCmsPage(page.id, {
        revision: page.revision,
        session: session.session,
        receipts: session.slots.map(item => receipts[`${item.locale}:${item.device}`]),
        previewScope,
        productId,
      });
      onPublished?.(updated);
    } catch (e) {
      if (alive.current) setError(e.message || '发布失败');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  let src = '';
  if (slot && storefrontOrigin) {
    const path = previewScope === 'listing' ? `/www/${slot.locale}/e-bikes` : `/www/${slot.locale}/e-bikes/${encodeURIComponent(productId)}`;
    const url = new URL(path, storefrontOrigin);
    url.searchParams.set('reviewToken', slot.token);
    url.searchParams.set('parent', window.location.origin);
    src = url.toString();
  }
  const completed = Object.keys(receipts).length;

  return <div style={{ position: 'fixed', zIndex: 10000, inset: 0, overflow: 'auto', padding: '2vh 2vw', background: '#172019a8' }}>
  <section className="udw-review" role="dialog" aria-modal="true" aria-label="商品模板发布审核" style={{ maxWidth: 1500, margin: '0 auto', background: '#fff', boxShadow: '0 12px 48px #0005' }}>
    <div className="udw-top">
      <h3>商品页面发布审核 · {completed}/6</h3>
      <div className="udw-tabs">
        <button className="btn" disabled={busy} onClick={onClose}>关闭</button>
        <button className="btn" disabled={busy} onClick={start}>{session ? '重新开始' : '加载六项预览'}</button>
        <button className="btn primary" disabled={busy || completed !== 6} onClick={publish}>确认发布</button>
      </div>
    </div>
    <p className="hint">审核范围：{previewScope === 'listing' ? '商品列表模板' : `商品详情公共模板 · ${productId}`}。本次草稿按中文、英文、德文及 PC、移动端各核对一次；草稿修改后必须重新审核。</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    {session && slot && <>
      <div className="udw-tabs">{session.slots.map((item, index) => {
        const itemKey = `${item.locale}:${item.device}`;
        return <button key={itemKey} className={'btn small' + (index === active ? ' primary' : '')} onClick={() => setActive(index)}>{LANG[item.locale]} {item.device === 'desktop' ? 'PC' : '移动端'} · {receipts[itemKey] ? '已确认' : '待确认'}</button>;
      })}</div>
      <div className="udw-top"><small>真实商城页面 · {slot.draft ? '本次草稿' : '当前正式内容'} · {slot.device === 'mobile' ? '390px' : '1200px'} 宽</small><button className="btn small" disabled={busy} onClick={() => { setReceipts(old => { const next = { ...old }; delete next[key]; return next; }); setReload(value => value + 1); }}>重新加载此项</button></div>
      <div style={{ height: '70vh', overflow: 'auto', background: '#eee' }}><iframe key={`${key}:${reload}`} ref={frame} title={`${LANG[slot.locale]} ${slot.device} 商品模板预览`} src={src} referrerPolicy="no-referrer" style={{ width: slot.device === 'mobile' ? 390 : 1200, minWidth: slot.device === 'mobile' ? 390 : 1200, height: '100%', display: 'block', margin: 'auto', border: 0, background: '#fff' }} /></div>
    </>}
  </section>
  </div>;
}
