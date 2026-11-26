'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';

export function ProductTemplateReviewConfirm({
  receipt,
  session,
  locale,
  device,
  draft,
  parentOrigin,
}: {
  receipt: string;
  session: string;
  locale: Locale;
  device: 'desktop' | 'mobile';
  draft: boolean;
  parentOrigin: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const confirm = () => {
    let origin = '';
    try {
      const url = new URL(parentOrigin);
      if (['http:', 'https:'].includes(url.protocol) && url.origin === parentOrigin) origin = url.origin;
    } catch (_) {}
    if (!origin || !window.parent || window.parent === window) return;
    window.parent.postMessage({
      type: 'alsvid:product-template-review-confirm',
      receipt,
      session,
      locale,
      device,
    }, origin);
    setConfirmed(true);
  };

  return <aside style={{ position: 'fixed', zIndex: 10000, inset: 'auto 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12, background: '#122018', color: '#fff', boxShadow: '0 -2px 12px #0003' }}>
    <span>{draft ? '正在核对本次商品模板草稿' : '正在核对当前正式页面'} · {locale.toUpperCase()} · {device === 'mobile' ? '移动端' : 'PC'}</span>
    <button type="button" onClick={confirm} disabled={confirmed} style={{ border: 0, borderRadius: 6, padding: '9px 16px', background: confirmed ? '#87b85c' : '#b7e547', color: '#16240d', fontWeight: 700, cursor: confirmed ? 'default' : 'pointer' }}>
      {confirmed ? '此项已确认' : '确认此项预览'}
    </button>
  </aside>;
}
