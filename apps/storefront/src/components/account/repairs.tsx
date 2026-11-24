'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { ApiError, apiJson, postJson } from './account-api';
import { COMMON, REPAIRS, REPAIR_STATUS, REPAIR_TYPE, pickStatus } from '@/lib/account-text';

type Payment = { amountMinor: string; method: string; receivedOn: string | null };
type Quote = {
  id: string; revision: number; currency: string; laborMinor: string; partsMinor: string; otherMinor: string;
  totalMinor: string; note: string; createdAt: string; decision: string | null; decisionNote: string | null; payments: Payment[];
};
type StatusChange = { fromStatus: string | null; toStatus: string | null; changedAt: string | null };
type Repair = {
  id: string; vin: string; workOrderNo: string; type: string; fault: string; status: string;
  createdAt: string; serviceCenterName: string | null; quotes: Quote[]; statusHistory: StatusChange[];
};

const PAYMENT_METHOD: Record<string, Record<Locale, string>> = {
  bank_transfer: { de: 'Überweisung', en: 'Bank transfer', zh: '银行转账' },
  cash: { de: 'Bar', en: 'Cash', zh: '现金' },
  other: { de: 'Sonstiges', en: 'Other', zh: '其他' },
};

export function RepairsPanel({ locale }: { locale: Locale }) {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await apiJson<Repair[]>('/api/portal/repair-history');
      const list = Array.isArray(rows) ? rows : [];
      // quotes / statusHistory / payments 都是 jsonb 聚合，形状归一后再交给渲染层。
      setRepairs(list.map((repair) => ({
        ...repair,
        quotes: (Array.isArray(repair.quotes) ? repair.quotes : []).map((quote) => ({ ...quote, payments: Array.isArray(quote.payments) ? quote.payments : [] })),
        statusHistory: Array.isArray(repair.statusHistory) ? repair.statusHistory : [],
      })));
    } catch {
      setError(COMMON.requestFailed[locale]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="account-muted" role="status">{COMMON.loading[locale]}</p>;

  return <>
    <header className="account-section-head">
      <div>
        <h2>{REPAIRS.title[locale]}</h2>
        <p className="account-muted">{REPAIRS.lede[locale]}</p>
      </div>
    </header>
    {error && <p className="account-error" role="alert">{error}</p>}
    {!repairs.length && <section className="account-panel"><p>{REPAIRS.empty[locale]}</p></section>}
    <div className="account-list">
      {repairs.map((repair) => <RepairCard key={repair.id} locale={locale} repair={repair} onChanged={load} />)}
    </div>
  </>;
}

function RepairCard({ locale, repair, onChanged }: { locale: Locale; repair: Repair; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // 后端只允许对「最新一版」报价做决定，旧版本一律 409。
  const latest = repair.quotes.reduce<Quote | null>((acc, quote) => (!acc || quote.revision > acc.revision ? quote : acc), null);
  const decidable = latest && !latest.decision && !['已完成', '已关闭'].includes(repair.status);

  const decide = async (decision: 'accepted' | 'declined') => {
    if (!latest || busy) return;
    setBusy(decision);
    setError('');
    try {
      await postJson(`/api/portal/repairs/${repair.id}/quotes/${latest.id}/decision`, { decision, note: note.trim() });
      setNote('');
      await onChanged();
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      setError(status === 409 ? REPAIRS.staleQuote[locale] : REPAIRS.decisionFailed[locale]);
    } finally {
      setBusy('');
    }
  };

  return <article className="account-card">
    <header className="account-card-head">
      <div>
        <span className={`account-badge is-${repair.status}`}>{pickStatus(REPAIR_STATUS, repair.status, locale)}</span>
        <h3>{repair.workOrderNo}</h3>
        <p className="account-muted">{REPAIRS.vin[locale]} · {repair.vin}</p>
      </div>
      <span className="account-muted">{REPAIRS.createdAt[locale]} · {formatDate(repair.createdAt, locale)}</span>
    </header>

    <dl className="account-facts">
      <div><dt>{REPAIRS.type[locale]}</dt><dd>{pickStatus(REPAIR_TYPE, repair.type, locale)}</dd></div>
      <div><dt>{REPAIRS.center[locale]}</dt><dd>{repair.serviceCenterName || '—'}</dd></div>
    </dl>
    <p>{repair.fault}</p>

    {repair.quotes.length > 0 && <section className="account-subpanel">
      <h4>{REPAIRS.quotes[locale]}</h4>
      <ul className="account-timeline">{repair.quotes.map((quote) => <li key={quote.id}>
        <strong>{REPAIRS.revision[locale]} {quote.revision}</strong>
        <span className="account-muted"> · {formatDateTime(quote.createdAt, locale)}</span>
        <dl className="account-facts">
          <div><dt>{REPAIRS.labor[locale]}</dt><dd>{money(quote.laborMinor, quote.currency, locale)}</dd></div>
          <div><dt>{REPAIRS.parts[locale]}</dt><dd>{money(quote.partsMinor, quote.currency, locale)}</dd></div>
          <div><dt>{REPAIRS.other[locale]}</dt><dd>{money(quote.otherMinor, quote.currency, locale)}</dd></div>
          <div><dt>{REPAIRS.total[locale]}</dt><dd><strong>{money(quote.totalMinor, quote.currency, locale)}</strong></dd></div>
        </dl>
        {quote.note && <p className="account-muted">{REPAIRS.quoteNote[locale]} · {quote.note}</p>}
        {quote.decision && <p className="account-muted">{REPAIRS.decision[locale]} · {quote.decision === 'accepted' ? REPAIRS.accepted[locale] : REPAIRS.declined[locale]}{quote.decisionNote ? ` · ${quote.decisionNote}` : ''}</p>}
        {quote.payments.length > 0 && <ul className="account-timeline">{quote.payments.map((payment, index) => <li key={`${quote.id}-pay-${index}`} className="account-muted">
          {REPAIRS.payments[locale]} · {money(payment.amountMinor, quote.currency, locale)} · {PAYMENT_METHOD[payment.method]?.[locale] || payment.method} · {formatDate(payment.receivedOn, locale)}
        </li>)}</ul>}
      </li>)}</ul>
    </section>}

    {repair.statusHistory.length > 0 && <section className="account-subpanel">
      <h4>{REPAIRS.statusHistory[locale]}</h4>
      <ul className="account-timeline">{repair.statusHistory.map((change, index) => <li key={`${repair.id}-h-${index}`} className="account-muted">
        {pickStatus(REPAIR_STATUS, change.fromStatus || '', locale) || '—'} → {pickStatus(REPAIR_STATUS, change.toStatus || '', locale)} · {formatDateTime(change.changedAt, locale)}
      </li>)}</ul>
    </section>}

    {decidable && <section className="account-subpanel">
      <h4>{REPAIRS.decision[locale]}</h4>
      <div className="account-form">
        <label>{REPAIRS.decisionNote[locale]} <span className="account-muted">({COMMON.optional[locale]})</span>
          <textarea maxLength={2000} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error && <p className="account-error" role="alert">{error}</p>}
        <div className="account-actions">
          <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void decide('accepted')}>{busy === 'accepted' ? COMMON.submitting[locale] : REPAIRS.accept[locale]}</button>
          <button className="account-ghost" type="button" disabled={Boolean(busy)} onClick={() => void decide('declined')}>{REPAIRS.decline[locale]}</button>
        </div>
      </div>
    </section>}
  </article>;
}
