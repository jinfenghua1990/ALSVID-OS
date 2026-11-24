'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { formatDate } from '@/lib/format';
import { uuidv7 } from '@/lib/uuid';
import { ApiError, apiJson, postJson } from './account-api';
import { COMMON, SERVICE, SERVICE_STATUS, pickStatus } from '@/lib/account-text';

type ServiceRequest = {
  id: string; vinId: string; vin: string; description: string; status: string;
  replyNote: string | null; createdAt: string; serviceCenterName: string | null;
  workOrderNo: string | null; repairStatus: string | null;
};
type Vehicle = { id: string; vin: string; model: string };
type ServiceCenter = { id: string; code: string; name: string; city: string | null; country: string | null };

export function ServicePanel({ locale }: { locale: Locale }) {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [centers, setCenters] = useState<ServiceCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ vinId: '', serviceCenterId: '', description: '' });
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [requestRows, vehicleRows, centerRows] = await Promise.all([
        apiJson<ServiceRequest[]>('/api/portal/service-requests'),
        apiJson<Vehicle[]>('/api/portal/vehicles'),
        // 服务网点是可选信息，取不到不影响申请主流程。
        apiJson<ServiceCenter[]>('/api/service-centers').catch(() => []),
      ]);
      setRequests(Array.isArray(requestRows) ? requestRows : []);
      const list = Array.isArray(vehicleRows) ? vehicleRows : [];
      setVehicles(list);
      setCenters(Array.isArray(centerRows) ? centerRows : []);
      setForm((current) => ({ ...current, vinId: current.vinId || list[0]?.id || '' }));
    } catch {
      setError(COMMON.requestFailed[locale]);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (busy) return;
    if (!form.description.trim()) { setFormError(SERVICE.descriptionRequired[locale]); return; }
    if (!form.vinId) { setFormError(SERVICE.needVehicle[locale]); return; }
    setBusy(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = { id: uuidv7(), vinId: form.vinId, description: form.description.trim() };
      if (form.serviceCenterId) payload.serviceCenterId = form.serviceCenterId;
      await postJson('/api/portal/service-requests', payload);
      setForm((current) => ({ ...current, description: '', serviceCenterId: '' }));
      await load();
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      setFormError(status === 400 || status === 403 || status === 409 ? (cause as ApiError).message : SERVICE.failed[locale]);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="account-muted" role="status">{COMMON.loading[locale]}</p>;

  return <>
    <header className="account-section-head">
      <div>
        <h2>{SERVICE.title[locale]}</h2>
        <p className="account-muted">{SERVICE.lede[locale]}</p>
      </div>
    </header>
    {error && <p className="account-error" role="alert">{error}</p>}

    <section className="account-panel">
      <h3>{SERVICE.formTitle[locale]}</h3>
      {!vehicles.length
        ? <p className="account-muted">{SERVICE.needVehicle[locale]}</p>
        : <div className="account-form">
          <label>{SERVICE.vehicle[locale]}
            <select value={form.vinId} onChange={(event) => setForm((current) => ({ ...current, vinId: event.target.value }))}>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.model || 'ALSVID'} · {vehicle.vin}</option>)}
            </select>
          </label>
          <label>{SERVICE.center[locale]} <span className="account-muted">({COMMON.optional[locale]})</span>
            <select value={form.serviceCenterId} onChange={(event) => setForm((current) => ({ ...current, serviceCenterId: event.target.value }))}>
              <option value="">{SERVICE.anyCenter[locale]}</option>
              {centers.map((center) => <option key={center.id} value={center.id}>{center.name}{center.city ? ` · ${center.city}` : ''}</option>)}
            </select>
          </label>
          <label>{SERVICE.description[locale]} <span className="account-muted">({COMMON.required[locale]})</span>
            <textarea required maxLength={2000} rows={4} placeholder={SERVICE.descriptionPlaceholder[locale]} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </label>
          {formError && <p className="account-error" role="alert">{formError}</p>}
          <button className="button" type="button" disabled={busy || !form.description.trim() || !form.vinId} onClick={() => void submit()}>{busy ? COMMON.submitting[locale] : SERVICE.submit[locale]}</button>
        </div>}
    </section>

    {!requests.length && <section className="account-panel"><p>{SERVICE.empty[locale]}</p></section>}

    <div className="account-list">
      {requests.map((request) => <article className="account-card" key={request.id}>
        <header className="account-card-head">
          <div>
            <span className={`account-badge is-${request.status}`}>{pickStatus(SERVICE_STATUS, request.status, locale)}</span>
            <h3>{request.vin}</h3>
            <p className="account-muted">{SERVICE.createdAt[locale]} · {formatDate(request.createdAt, locale)}</p>
          </div>
          {request.workOrderNo && <span className="account-muted">{SERVICE.workOrder[locale]} · {request.workOrderNo}</span>}
        </header>
        <p>{request.description}</p>
        {request.serviceCenterName && <p className="account-muted">{SERVICE.center[locale]} · {request.serviceCenterName}</p>}
        {request.replyNote && <section className="account-subpanel">
          <h4>{SERVICE.reply[locale]}</h4>
          <p>{request.replyNote}</p>
        </section>}
      </article>)}
    </div>
  </>;
}
