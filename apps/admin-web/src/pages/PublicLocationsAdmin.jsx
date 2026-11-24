import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { uuidv7 } from '../uuidv7.js';

const empty = () => ({ id: uuidv7(), name: '', country: 'DE', city: '', address: '', sales: false, service: false, approvedForPublication: false, authorizationActive: false, revision: 0 });
const fields = [['name', '名称', 160], ['city', '城市', 120], ['address', '公开地址', 500]];
const flags = [['sales', '销售网点'], ['service', '服务网点'], ['approvedForPublication', '批准公开'], ['authorizationActive', '授权有效']];

export default function PublicLocationsAdmin({ active, user }) {
  const [rows, setRows] = useState(null), [form, setForm] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [source, setSource] = useState(null), [sourceError, setSourceError] = useState('');
  const loadVersion = useRef(0);
  const sourceVersion = useRef(0);
  const load = async () => {
    const version = ++loadVersion.current;
    try { const result = await api.publicLocations(); if (version === loadVersion.current) { setRows(result.data); setError(''); } }
    catch (failure) { if (version === loadVersion.current) setError(failure.message); throw failure; }
  };
  useEffect(() => { if (!active || user?.role !== 'admin') return; load().catch(() => {}); return () => { loadVersion.current++; sourceVersion.current++; }; }, [active, user?.role]);
  const edit = row => {
    setForm({ ...row }); setError(''); setMessage(''); setSource(null); setSourceError('');
    const version = ++sourceVersion.current;
    api.publicLocationSource(row.id).then(result => { if (version === sourceVersion.current) setSource(result.data || false); })
      .catch(failure => { if (version === sourceVersion.current) setSourceError(failure.message); });
  };
  const save = async event => {
    event.preventDefault(); if (!form || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.savePublicLocation(form.id, form);
      setForm(null);
      try { await load(); setMessage('公开网点资料已保存。'); }
      catch (_) { setMessage('资料已保存，但列表刷新失败。'); }
    } catch (failure) { setError(failure.status === 409 ? '网点已被修改，请保留当前内容并刷新列表后重新核对。' : failure.message); }
    finally { setBusy(false); }
  };
  if (user?.role !== 'admin') return <section className="card">仅管理员可维护公开网点。</section>;
  return <section className="card"><h2>公开网点</h2>
    <p>只有同时批准公开、授权有效且选择网点类型的记录才会出现在官网。请先核实地址及公开授权。</p>
    <button type="button" className="btn" disabled={busy} onClick={() => { sourceVersion.current++; setSource(null); setSourceError(''); setForm(empty()); setError(''); setMessage(''); }}>新增</button>{' '}
    <button type="button" className="btn" disabled={busy} onClick={() => load().catch(() => {})}>刷新</button>
    {error && <p role="alert" className="error-text">{error}</p>}{message && <p role="status">{message}</p>}
    {rows === null && !error ? <p>正在加载…</p> : rows?.length === 0 ? <p>暂无网点。</p> : rows?.length > 0 && <table className="table"><thead><tr><th>名称</th><th>地区</th><th>类型</th><th>公开状态</th><th>操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.country} · {row.city} · {row.address}</td><td>{[row.sales && '销售', row.service && '服务'].filter(Boolean).join(' / ') || '未选择'}</td><td>{row.approvedForPublication && row.authorizationActive && (row.sales || row.service) ? '已公开' : '未公开'}</td><td><button type="button" className="btn small" disabled={busy} onClick={() => edit(row)}>编辑</button></td></tr>)}</tbody></table>}
    {form && <form className="card mt16" onSubmit={save}><h3>{form.revision ? '编辑网点' : '新增网点'}</h3><fieldset disabled={busy} style={{ border: 0 }}>
      {form.revision > 0 && <section><h4>迁移来源</h4>{sourceError ? <p role="alert">来源读取失败：{sourceError}</p> : source === null ? <p>正在读取来源…</p> : source === false ? <p>此记录没有 V1 迁移来源。</p> : <><p>旧编号：{source.sourceId} · 合作伙伴编号：{source.partnerId || '无'}</p><p>原公开批准：{source.snapshot.approved_for_publication ? '是' : '否'} · 原授权有效：{source.snapshot.authorization_active ? '是' : '否'} · 原试骑授权：{source.testRideAuthorized ? '是' : '否'}</p><p>原资料：{source.snapshot.display_name} · {source.snapshot.country_code} {source.snapshot.city} {source.snapshot.address}</p></>}</section>}
      {fields.map(([key,label,max]) => <div className="field" key={key}><label htmlFor={`location-${key}`}>{label}</label><input id={`location-${key}`} required maxLength={max} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></div>)}
      <div className="field"><label htmlFor="location-country">国家</label><select id="location-country" value={form.country} onChange={event => setForm({ ...form, country: event.target.value })}><option value="DE">德国</option><option value="AT">奥地利</option></select></div>
      {flags.map(([key,label]) => <label key={key} style={{ display: 'block' }}><input type="checkbox" checked={form[key]} onChange={event => setForm({ ...form, [key]: event.target.checked })} /> {label}</label>)}
      <button className="btn primary" type="submit">保存</button>{' '}<button className="btn" type="button" onClick={() => setForm(null)}>取消</button>
    </fieldset></form>}
  </section>;
}
