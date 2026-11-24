'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { formatDate } from '@/lib/format';
import { uuidv7 } from '@/lib/uuid';
import { ApiError, apiJson, postJson } from './account-api';
import { COMMON, VEHICLES, VEHICLE_REQUEST_STATUS, pickStatus } from '@/lib/account-text';

type Warranty = { id: string; coverage: string; startsOn: string | null; endsOn: string | null; revoked: boolean };
type Vehicle = { id: string; vin: string; model: string; producedAt: string | null; warranties: Warranty[] };
type VehicleRequest = { id: string; vin: string; note: string; status: string; decisionNote: string | null; createdAt: string; reviewedAt: string | null };

// 与后端 portal.js 的校验保持一致，先在浏览器侧挡住明显无效的输入。
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{11,20}$/;

export function VehiclesPanel({ locale }: { locale: Locale }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [requests, setRequests] = useState<VehicleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ vin: '', note: '' });
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [vehicleRows, requestRows] = await Promise.all([
        apiJson<Vehicle[]>('/api/portal/vehicles'),
        apiJson<VehicleRequest[]>('/api/portal/vehicle-requests'),
      ]);
      setVehicles(Array.isArray(vehicleRows) ? vehicleRows : []);
      setRequests(Array.isArray(requestRows) ? requestRows : []);
    } catch {
      setError(COMMON.requestFailed[locale]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (busy) return;
    const vin = form.vin.trim().toUpperCase();
    if (!VIN_PATTERN.test(vin)) { setFormError(VEHICLES.requestInvalidVin[locale]); return; }
    if (!form.note.trim()) { setFormError(VEHICLES.requestNoteRequired[locale]); return; }
    setBusy(true);
    setFormError('');
    try {
      await postJson('/api/portal/vehicle-requests', { id: uuidv7(), vin, note: form.note.trim() });
      setForm({ vin: '', note: '' });
      await load();
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      setFormError(status === 400 || status === 409 ? (cause as ApiError).message : VEHICLES.requestFailed[locale]);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="account-muted" role="status">{COMMON.loading[locale]}</p>;

  return <>
    <header className="account-section-head">
      <div>
        <h2>{VEHICLES.title[locale]}</h2>
        <p className="account-muted">{VEHICLES.lede[locale]}</p>
      </div>
    </header>
    {error && <p className="account-error" role="alert">{error}</p>}

    {!vehicles.length && <section className="account-panel"><p>{VEHICLES.empty[locale]}</p></section>}

    <div className="account-list">
      {vehicles.map((vehicle) => <article className="account-card" key={vehicle.id}>
        <header className="account-card-head">
          <div>
            <h3>{vehicle.model || 'ALSVID'}</h3>
            <p className="account-muted">{VEHICLES.vin[locale]} · {vehicle.vin}</p>
          </div>
          {vehicle.producedAt && <span className="account-muted">{VEHICLES.producedAt[locale]} · {formatDate(vehicle.producedAt, locale)}</span>}
        </header>
        {vehicle.warranties.length > 0 && <section className="account-subpanel">
          <h4>{VEHICLES.warranty[locale]}</h4>
          <ul className="account-timeline">{vehicle.warranties.map((warranty) => <li key={warranty.id}>
            <strong>{warranty.coverage || '—'}</strong>
            {warranty.revoked && <span className="account-badge is-cancelled">{VEHICLES.revoked[locale]}</span>}
            <p className="account-muted">{VEHICLES.period[locale]} · {formatDate(warranty.startsOn, locale)} — {formatDate(warranty.endsOn, locale)}</p>
          </li>)}</ul>
        </section>}
      </article>)}
    </div>

    <section className="account-panel">
      <h3>{VEHICLES.requestTitle[locale]}</h3>
      <p className="account-muted">{VEHICLES.requestLede[locale]}</p>
      <div className="account-form">
        <label>{VEHICLES.vin[locale]}
          <input required maxLength={20} value={form.vin} onChange={(event) => setForm((current) => ({ ...current, vin: event.target.value }))} />
        </label>
        <label>{VEHICLES.requestNote[locale]} <span className="account-muted">({COMMON.required[locale]})</span>
          <textarea required maxLength={2000} rows={3} value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
        </label>
        {formError && <p className="account-error" role="alert">{formError}</p>}
        <button className="button" type="button" disabled={busy || !form.vin.trim() || !form.note.trim()} onClick={() => void submit()}>{busy ? COMMON.submitting[locale] : VEHICLES.requestSubmit[locale]}</button>
      </div>
    </section>

    {requests.length > 0 && <section className="account-panel">
      <h3>{VEHICLES.requests[locale]}</h3>
      <ul className="account-timeline">{requests.map((request) => <li key={request.id}>
        <strong>{request.vin}</strong>
        <span className={`account-badge is-${request.status}`}>{pickStatus(VEHICLE_REQUEST_STATUS, request.status, locale)}</span>
        <p className="account-muted">{formatDate(request.createdAt, locale)}</p>
        <p>{request.note}</p>
        {request.decisionNote && <p className="account-muted">{request.decisionNote}</p>}
      </li>)}</ul>
    </section>}
  </>;
}
