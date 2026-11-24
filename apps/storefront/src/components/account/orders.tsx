'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { uuidv7 } from '@/lib/uuid';
import { ApiError, apiList, postJson } from './account-api';
import { COMMON, ORDERS, ORDER_STATUS, RETURN_STATUS, pick, pickStatus } from '@/lib/account-text';

type OrderLine = { id: string; sku: string; quantity: number };
type ReturnItem = { returnItemId: string; itemId: string; sku: string; quantity: number; receivedQuantity: number };
type ReturnRequest = { id: string; status: string; reason: string; reviewNote: string | null; createdAt: string; items: ReturnItem[] };
type Quote = { id: string; revision: number; shippingMinor: string; taxMinor: string; totalMinor: string; note: string; createdAt: string };
type Shipment = { carrier: string; trackingNo: string; shippedAt: string | null };
type Review = { id: string; rating: number; content: string; reply: string | null; repliedAt: string | null };
export type Order = {
  id: string;
  status: string;
  currency: string;
  subtotalMinor: string;
  delivery: Record<string, string> | null;
  items: { productId: string; sku: string; currency: string; quantity: number; unitPrice: string }[];
  createdAt: string;
  refundedMinor: string;
  paidMinor: string;
  orderLines: OrderLine[];
  returns: ReturnRequest[];
  receipt: { note: string | null; receivedAt: string | null } | null;
  shipment: Shipment | null;
  cancelReason: string | null;
  quote: Quote | null;
  review: Review | null;
};

// 后端各聚合字段都带 COALESCE，但这里再做一次形状归一：
// 一旦某天某个子查询返回 null，页面不应整体崩在 undefined.length 上。
function normalizeOrder(raw: Order): Order {
  return {
    ...raw,
    orderLines: Array.isArray(raw.orderLines) ? raw.orderLines : [],
    returns: Array.isArray(raw.returns) ? raw.returns : [],
    items: Array.isArray(raw.items) ? raw.items : [],
    quote: raw.quote ?? null,
    review: raw.review ?? null,
    receipt: raw.receipt ?? null,
    shipment: raw.shipment ?? null,
  };
}

export function OrdersPanel({ locale }: { locale: Locale }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (target: number) => {
    setBusy(true);
    setError('');
    try {
      const result = await apiList<Order>(`/api/portal/storefront/orders?page=${target}`);
      const rows = result.items.map(normalizeOrder);
      setOrders((current) => target === 1 ? rows : [...current, ...rows]);
      setHasMore(result.hasMore);
      setPage(target);
    } catch {
      setError(COMMON.requestFailed[locale]);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }, [locale]);

  useEffect(() => { void load(1); }, [load]);

  const refresh = useCallback(async () => {
    // 操作后只重载已加载的页数，避免把用户翻到第 3 页后打回第 1 页。
    setBusy(true);
    setError('');
    try {
      const pages = await Promise.all(Array.from({ length: page }, (_, index) => apiList<Order>(`/api/portal/storefront/orders?page=${index + 1}`)));
      setOrders(pages.flatMap((entry) => entry.items.map(normalizeOrder)));
      setHasMore(pages[pages.length - 1]?.hasMore ?? false);
    } catch {
      setError(COMMON.requestFailed[locale]);
    } finally {
      setBusy(false);
    }
  }, [locale, page]);

  if (loading) return <p className="account-muted" role="status">{COMMON.loading[locale]}</p>;

  return <>
    <header className="account-section-head">
      <div>
        <h2>{ORDERS.title[locale]}</h2>
        <p className="account-muted">{ORDERS.lede[locale]}</p>
      </div>
    </header>
    {error && <p className="account-error" role="alert">{error}</p>}
    {!orders.length && <section className="account-panel">
      <p>{ORDERS.empty[locale]}</p>
      <Link className="button" href={`/${locale}/e-bikes`}>{ORDERS.browse[locale]}</Link>
    </section>}
    <div className="account-list">
      {orders.map((order) => <OrderCard key={order.id} locale={locale} order={order} onChanged={refresh} />)}
    </div>
    {hasMore && <div className="account-more">
      <button className="account-ghost" type="button" disabled={busy} onClick={() => void load(page + 1)}>{busy ? COMMON.loading[locale] : ORDERS.loadMore[locale]}</button>
    </div>}
  </>;
}

function OrderCard({ locale, order, onChanged }: { locale: Locale; order: Order; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'return' | 'review' | null>(null);
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [review, setReview] = useState({ rating: '5', content: '' });

  const run = async (action: () => Promise<unknown>, errorText: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setPanel(null);
      setReason('');
      setQuantities({});
      await onChanged();
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      // 409 在后端代表状态已变（报价更新、重复申请、金额超限），提示重试即可。
      setError(status === 409 ? (cause as ApiError).message : errorText);
    } finally {
      setBusy(false);
    }
  };

  const respond = (decision: 'accept' | 'decline') => run(
    () => postJson(`/api/portal/storefront/orders/${order.id}/respond`, { quoteId: order.quote?.id, decision }),
    ORDERS.quoteFailed[locale],
  );

  const confirmReceipt = () => run(
    () => postJson(`/api/portal/storefront/orders/${order.id}/receive`, { note: '' }),
    ORDERS.receiptFailed[locale],
  );

  // 已被待审或已批准的退货占用的数量，需从可申请数量中扣除，否则后端会以 409 拒绝。
  const claimed = new Map<string, number>();
  for (const request of order.returns) {
    if (request.status !== 'pending' && request.status !== 'approved') continue;
    for (const item of request.items) claimed.set(item.itemId, (claimed.get(item.itemId) || 0) + item.quantity);
  }

  const submitReturn = () => {
    const lines = Object.entries(quantities)
      .map(([itemId, value]) => ({ itemId, quantity: Number(value) }))
      .filter((line) => Number.isSafeInteger(line.quantity) && line.quantity > 0);
    if (!lines.length || !reason.trim()) return;
    void run(
      () => postJson(`/api/portal/storefront/orders/${order.id}/returns`, { id: uuidv7(), reason: reason.trim(), items: lines }),
      ORDERS.returnFailed[locale],
    );
  };

  const submitReview = () => run(
    () => postJson(`/api/portal/storefront/orders/${order.id}/reviews`, { id: uuidv7(), rating: Number(review.rating), content: review.content.trim() }),
    ORDERS.reviewFailed[locale],
  );

  const canRespond = order.status === 'quoted' && order.quote;
  const canReceive = order.status === 'shipped';
  const canReturn = (order.status === 'shipped' || order.status === 'delivered')
    && !order.returns.some((request) => request.status === 'pending');
  const canReview = order.status === 'delivered' && !order.review;

  return <article className="account-card">
    <header className="account-card-head">
      <div>
        <span className={`account-badge is-${order.status}`}>{pickStatus(ORDER_STATUS, order.status, locale)}</span>
        <h3>{order.id.slice(0, 8).toUpperCase()}</h3>
        <p className="account-muted">{ORDERS.createdAt[locale]} · {formatDate(order.createdAt, locale)}</p>
      </div>
      <strong className="account-amount">{money(order.subtotalMinor, order.currency, locale)}</strong>
    </header>

    <dl className="account-facts">
      <div><dt>{ORDERS.subtotal[locale]}</dt><dd>{money(order.subtotalMinor, order.currency, locale)}</dd></div>
      <div><dt>{ORDERS.paid[locale]}</dt><dd>{money(order.paidMinor, order.currency, locale)}</dd></div>
      <div><dt>{ORDERS.refunded[locale]}</dt><dd>{money(order.refundedMinor, order.currency, locale)}</dd></div>
    </dl>

    {order.orderLines.length > 0 && <table className="account-table">
      <caption className="account-muted">{ORDERS.items[locale]}</caption>
      <thead><tr><th scope="col">SKU</th><th scope="col">{ORDERS.returnQuantity[locale]}</th></tr></thead>
      <tbody>{order.orderLines.map((line) => <tr key={line.id}><td>{line.sku}</td><td>{line.quantity}</td></tr>)}</tbody>
    </table>}

    {order.quote && <section className="account-subpanel">
      <h4>{ORDERS.quote[locale]} · {ORDERS.quoteDetail[locale]}</h4>
      <p className="account-muted">{formatDateTime(order.quote.createdAt, locale)}{order.quote.note ? ` · ${order.quote.note}` : ''}</p>
      <dl className="account-facts">
        <div><dt>{ORDERS.quoteDetail[locale]}</dt><dd>{money(order.quote.shippingMinor, order.currency, locale)} / {money(order.quote.taxMinor, order.currency, locale)}</dd></div>
        <div><dt>{ORDERS.quoteTotal[locale]}</dt><dd><strong>{money(order.quote.totalMinor, order.currency, locale)}</strong></dd></div>
      </dl>
      {canRespond && <div className="account-actions">
        <button className="button" type="button" disabled={busy} onClick={() => void respond('accept')}>{ORDERS.acceptQuote[locale]}</button>
        <button className="account-ghost" type="button" disabled={busy} onClick={() => void respond('decline')}>{ORDERS.declineQuote[locale]}</button>
      </div>}
    </section>}

    {order.shipment && <section className="account-subpanel">
      <h4>{ORDERS.shipment[locale]}</h4>
      <dl className="account-facts">
        <div><dt>{ORDERS.carrier[locale]}</dt><dd>{order.shipment.carrier || '—'}</dd></div>
        <div><dt>{ORDERS.trackingNo[locale]}</dt><dd>{order.shipment.trackingNo || '—'}</dd></div>
      </dl>
    </section>}

    {order.receipt?.receivedAt && <p className="account-muted">{ORDERS.receipt[locale]} · {formatDateTime(order.receipt.receivedAt, locale)}</p>}
    {order.cancelReason && <p className="account-muted">{ORDERS.cancelReason[locale]} · {order.cancelReason}</p>}

    {order.returns.length > 0 && <section className="account-subpanel">
      <h4>{ORDERS.returns[locale]}</h4>
      <ul className="account-timeline">{order.returns.map((request) => <li key={request.id}>
        <strong>{pickStatus(RETURN_STATUS, request.status, locale)}</strong>
        <span className="account-muted"> · {formatDate(request.createdAt, locale)}</span>
        <p>{request.reason}</p>
        {request.reviewNote && <p className="account-muted">{request.reviewNote}</p>}
      </li>)}</ul>
    </section>}

    {order.review && <section className="account-subpanel">
      <h4>{ORDERS.review[locale]} · {'★'.repeat(order.review.rating)}{'☆'.repeat(5 - order.review.rating)}</h4>
      <p>{order.review.content}</p>
      {order.review.reply && <p className="account-muted">ALSVID · {order.review.reply}</p>}
    </section>}

    {error && <p className="account-error" role="alert">{error}</p>}

    <div className="account-actions">
      {canReceive && <button className="button" type="button" disabled={busy} onClick={() => void confirmReceipt()}>{ORDERS.confirmReceipt[locale]}</button>}
      {canReturn && <button className="account-ghost" type="button" disabled={busy} onClick={() => setPanel(panel === 'return' ? null : 'return')}>{ORDERS.requestReturn[locale]}</button>}
      {canReview && <button className="account-ghost" type="button" disabled={busy} onClick={() => setPanel(panel === 'review' ? null : 'review')}>{ORDERS.review[locale]}</button>}
    </div>

    {panel === 'return' && <section className="account-subpanel">
      <h4>{ORDERS.requestReturn[locale]}</h4>
      <div className="account-form">
        {order.orderLines.map((line) => {
          const remaining = line.quantity - (claimed.get(line.id) || 0);
          if (remaining <= 0) return null;
          return <label key={line.id}>{line.sku} · {ORDERS.returnQuantity[locale]} (≤ {remaining})
            <input type="number" min="1" max={remaining} step="1" value={quantities[line.id] ?? ''} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} />
          </label>;
        })}
        <label>{ORDERS.returnReason[locale]}
          <textarea required maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="account-actions">
          <button className="button" type="button" disabled={busy || !reason.trim() || !Object.values(quantities).some((value) => Number(value) > 0)} onClick={submitReturn}>{busy ? COMMON.submitting[locale] : ORDERS.returnSubmit[locale]}</button>
          <button className="account-ghost" type="button" disabled={busy} onClick={() => setPanel(null)}>{COMMON.cancel[locale]}</button>
        </div>
      </div>
    </section>}

    {panel === 'review' && <section className="account-subpanel">
      <h4>{ORDERS.review[locale]}</h4>
      <div className="account-form">
        <label>{ORDERS.rating[locale]}
          <select value={review.rating} onChange={(event) => setReview((current) => ({ ...current, rating: event.target.value }))}>
            {['5', '4', '3', '2', '1'].map((value) => <option key={value} value={value}>{'★'.repeat(Number(value))}</option>)}
          </select>
        </label>
        <label>{ORDERS.reviewContent[locale]}
          <textarea required maxLength={2000} rows={4} value={review.content} onChange={(event) => setReview((current) => ({ ...current, content: event.target.value }))} />
        </label>
        <div className="account-actions">
          <button className="button" type="button" disabled={busy || !review.content.trim()} onClick={() => void submitReview()}>{busy ? COMMON.submitting[locale] : ORDERS.reviewSubmit[locale]}</button>
          <button className="account-ghost" type="button" disabled={busy} onClick={() => setPanel(null)}>{COMMON.cancel[locale]}</button>
        </div>
      </div>
    </section>}
  </article>;
}
