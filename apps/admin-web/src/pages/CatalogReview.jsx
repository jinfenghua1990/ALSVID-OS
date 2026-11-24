import React, { useState } from 'react';
import { uuidv7 } from '../uuidv7.js';

const copy = {
  zh: {
    title: '评价本单',
    note: '整单一次评价，提交后不可修改；商家回复会显示在官网评价区。',
    rating: '评分',
    content: '评价内容',
    placeholder: '做工、续航、物流、客服……写点具体的对别人更有帮助',
    submit: '提交评价',
    saved: '评价已提交，感谢反馈。',
    savedRefresh: '评价已提交，但订单列表刷新失败。',
    error: '评价未提交成功，请稍后重试。',
    conflict: '该订单已评价或状态已变化，请刷新后查看。',
    rated: '已评价',
    reply: '商家回复',
    empty: '还没有评价',
  },
  en: {
    title: 'Review this order',
    note: 'One review per order. It cannot be edited after submission; the seller reply appears on the public review list.',
    rating: 'Rating',
    content: 'Your review',
    placeholder: 'Build quality, range, shipping, support…',
    submit: 'Submit review',
    saved: 'Review submitted. Thank you.',
    savedRefresh: 'Review submitted, but the order list could not be refreshed.',
    error: 'The review was not submitted. Please try again.',
    conflict: 'This order was already reviewed or changed. Please reload.',
    rated: 'Reviewed',
    reply: 'Seller reply',
    empty: 'No review yet',
  },
  de: {
    title: 'Bestellung bewerten',
    note: 'Eine Bewertung pro Bestellung, nach dem Absenden nicht mehr änderbar; die Antwort des Verkäufers erscheint öffentlich.',
    rating: 'Bewertung',
    content: 'Ihre Bewertung',
    placeholder: 'Verarbeitung, Reichweite, Versand, Service …',
    submit: 'Bewertung senden',
    saved: 'Bewertung gesendet. Vielen Dank.',
    savedRefresh: 'Bewertung gesendet, die Bestellliste konnte jedoch nicht aktualisiert werden.',
    error: 'Die Bewertung wurde nicht gesendet. Bitte erneut versuchen.',
    conflict: 'Diese Bestellung wurde bereits bewertet oder geändert. Bitte neu laden.',
    rated: 'Bewertet',
    reply: 'Antwort des Verkäufers',
    empty: 'Noch keine Bewertung',
  },
};

export default function CatalogReview({ order, lang, onChanged }) {
  const t = copy[lang] || copy.zh;
  const [reviewId] = useState(() => uuidv7());
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = order.review || null;

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/portal/storefront/orders/${encodeURIComponent(order.id)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reviewId, rating, content }),
      });
      if (!response.ok) {
        const failure = new Error('review');
        failure.status = response.status;
        throw failure;
      }
      setMessage(t.saved);
      try { await onChanged?.(); } catch { setMessage(t.savedRefresh); }
    } catch (e) {
      setError(e.status === 409 ? t.conflict : t.error);
    } finally { setBusy(false); }
  };

  if (saved) return (
    <div className="catalog-review">
      <h4>{t.title} · {t.rated}</h4>
      <p><span className="catalog-review__stars" aria-label={`${saved.rating} / 5`}>{'★'.repeat(saved.rating)}{'☆'.repeat(5 - saved.rating)}</span>{saved.content ? ` · ${saved.content}` : ` · ${t.empty}`}</p>
      {saved.reply && <p>{t.reply}: {saved.reply}</p>}
    </div>
  );

  return (
    <div className="catalog-review">
      <h4>{t.title}</h4>
      <p>{t.note}</p>
      <form onSubmit={submit}>
        <label>{t.rating}{' '}
          <select value={rating} onChange={e => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map(score => <option key={score} value={score}>{'★'.repeat(score)}{'☆'.repeat(5 - score)} · {score}</option>)}
          </select>
        </label>
        <label style={{ display: 'block', marginTop: 6 }}>{t.content}{' '}
          <textarea rows={3} maxLength={2000} value={content} onChange={e => setContent(e.target.value)} placeholder={t.placeholder} style={{ width: '100%', maxWidth: 560 }} />
        </label>
        <button disabled={busy}>{t.submit}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
