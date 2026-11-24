import { adminFetch } from '../api.js';
import React, { useEffect, useRef, useState } from 'react';

async function request(path, method = 'GET', body) {
  const response = await adminFetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(data?.error || '库位操作失败');
  return data;
}

const blank = { id: '', code: '', name: '', status: '启用', locationType: 'STORAGE', parentLocationUuid: '', isDefault: false };
const locationTypes = { RECEIVING: '收货区', STORAGE: '存储区', STAGING: '暂存区', PICK: '拣货区', QUARANTINE: '隔离区', DISPATCH: '发货区' };

export function WarehouseLocationSelect({ warehouseId, value, onChange, label, required = false }) {
  const [locationData, setLocationData] = useState({ warehouseId: '', rows: [] });
  const locations = locationData.warehouseId === warehouseId ? locationData.rows : [];
  useEffect(() => {
    let active = true;
    if (!warehouseId) { setLocationData({ warehouseId: '', rows: [] }); return () => { active = false; }; }
    request(`/api/warehouse-locations?warehouseId=${encodeURIComponent(warehouseId)}`)
      .then(rows => { if (active) setLocationData({ warehouseId, rows: rows.filter(row => row.status === '启用') }); })
      .catch(() => { if (active) setLocationData({ warehouseId, rows: [] }); });
    return () => { active = false; };
  }, [warehouseId]);
  return <div className="field"><label>{label}</label><select value={value || ''} required={required} disabled={!warehouseId} onChange={event => onChange(event.target.value)}>
    <option value="">默认主库位</option>
    {locations.map(location => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
  </select></div>;
}

export default function WarehouseLocations({ warehouses, canManage }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [locations, setLocations] = useState([]);
  const [stock, setStock] = useState([]);
  const [stockError, setStockError] = useState('');
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const loadSequence = useRef(0);
  const warehouse = warehouses.find(item => item.id === warehouseId);

  useEffect(() => {
    if (!warehouseId && warehouses.length) setWarehouseId(warehouses[0].id);
  }, [warehouseId, warehouses]);

  const reload = async () => {
    if (!warehouseId) return;
    const sequence = ++loadSequence.current;
    try {
      const rows = await request(`/api/warehouse-locations?warehouseId=${encodeURIComponent(warehouseId)}`);
      if (sequence !== loadSequence.current) return;
      setLocations(rows);
      setLoadError('');
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setLoadError(e.message);
      throw e;
    }
    try {
      const rows = await request('/api/stock/by-location');
      if (sequence !== loadSequence.current) return;
      setStock(rows.filter(row => row.warehouseId === warehouseId));
      setStockError('');
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setStock([]);
      setStockError(e.message);
    }
  };

  useEffect(() => {
    setError('');
    setForm(blank);
    reload().catch(() => {});
    return () => { loadSequence.current++; };
  }, [warehouseId]);

  const save = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setLoadError('');
    setNotice('');
    try {
      const path = form.id ? `/api/warehouse-locations/${encodeURIComponent(form.id)}` : `/api/warehouses/${encodeURIComponent(warehouseId)}/locations`;
      const body = { code: form.code, name: form.name, status: form.status, locationType: form.locationType, parentLocationId: form.parentLocationUuid || null };
      const saved = await request(path, form.id ? 'PATCH' : 'POST', body);
      const location = saved.after || saved;
      setLocations(current => form.id ? current.map(item => item.id === location.id ? location : item) : [location, ...current]);
      setForm(blank);
      setNotice(form.id ? '库位已更新。' : '库位已创建。');
      try { await reload(); } catch (e) { setNotice(form.id ? '库位已更新，但列表刷新失败。' : '库位已创建，但列表刷新失败。'); }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async location => {
    if (!window.confirm(`确认删除库位“${location.name}”？`)) return;
    setBusy(true);
    setError('');
    setLoadError('');
    setNotice('');
    try {
      await request(`/api/warehouse-locations/${encodeURIComponent(location.id)}`, 'DELETE');
      setLocations(current => current.filter(item => item.id !== location.id));
      setNotice('库位已删除。');
      try { await reload(); } catch (e) { setNotice('库位已删除，但列表刷新失败。'); }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="mt16">
    <h3>仓库库位</h3><button type="button" className="btn" disabled={busy||!warehouseId} onClick={()=>reload().catch(()=>{})}>刷新库位</button>{loadError&&<p className="error-text" role="alert">库位列表读取失败：{loadError} <button type="button" className="btn small" disabled={busy} onClick={()=>reload().catch(()=>{})}>重试读取</button></p>}{notice&&<p className="hint" role="status" />}
    {!warehouses.length ? <p className="hint" /> : <>
      <div className="row mb12">
        <label>选择仓库 <select value={warehouseId} disabled={busy} onChange={event => setWarehouseId(event.target.value)}>
          {warehouses.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}
        </select></label>
      </div>
      {canManage && <form className="row mb12" onSubmit={save}>
        <input aria-label="库位编号" placeholder="库位编号" maxLength={40} required value={form.code} disabled={busy || form.isDefault} onChange={event => setForm({ ...form, code: event.target.value })} />
        <input aria-label="库位名称" placeholder="库位名称" maxLength={100} required value={form.name} disabled={busy} onChange={event => setForm({ ...form, name: event.target.value })} />
        <select aria-label="库位类型" value={form.locationType || 'STORAGE'} disabled={busy} onChange={event => setForm({ ...form, locationType: event.target.value })}>{Object.entries(locationTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="上级库位" value={form.parentLocationUuid || ''} disabled={busy || form.isDefault} onChange={event => setForm({ ...form, parentLocationUuid: event.target.value })}><option value="">无上级</option>{locations.filter(item => item.id !== form.id && item.status === '启用').map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
        {form.id && <select aria-label="库位状态" value={form.status} disabled={busy || form.isDefault} onChange={event => setForm({ ...form, status: event.target.value })}><option>启用</option><option>停用</option></select>}
        <button className="btn primary" disabled={busy || warehouse?.status !== '启用'}>{form.id ? '保存库位' : '新增库位'}</button>
        {form.id && <button type="button" className="btn" disabled={busy} onClick={() => setForm(blank)}>取消编辑</button>}
      </form>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <table className="table"><thead><tr><th>编号</th><th>库位</th><th>类型</th><th>状态</th>{canManage && <th>操作</th>}</tr></thead><tbody>
        {locations.map(location => <tr key={location.id}>
          <td>{location.code}</td><td>{location.name}{location.parentCode ? `（上级：${location.parentCode}）` : ''}</td><td>{location.isDefault ? '默认库位' : locationTypes[location.locationType] || '存储区'}</td><td>{location.status}</td>
          {canManage && <td><button type="button" className="btn small" disabled={busy} onClick={() => setForm({ ...location })}>编辑</button>{!location.isDefault && <button type="button" className="btn small" disabled={busy} onClick={() => remove(location)}>删除</button>}</td>}
        </tr>)}
        {!locations.length && <tr><td colSpan={canManage ? 5 : 4} className="hint" /></tr>}
      </tbody></table>
      <h4 className="mt16">库位库存</h4>
      {stockError ? <p className="hint" /> : <table className="table"><thead><tr><th>库位</th><th>SKU</th><th>数量</th></tr></thead><tbody>
        {stock.map(row => <tr key={`${row.locationId}:${row.sku}`}><td>{row.locationCode} · {row.location}</td><td>{row.sku}</td><td>{row.quantity}</td></tr>)}
        {!stock.length && <tr><td colSpan="3" className="hint" /></tr>}
      </tbody></table>}
    </>}
  </section>;
}
