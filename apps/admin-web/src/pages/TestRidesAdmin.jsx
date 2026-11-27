import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import StoreAppointmentsAdmin from './StoreAppointmentsAdmin.jsx';
import { TestRideAssignment, TestRideLocationAuthorizations } from './TestRideAssignments.jsx';

const STATUS = { NEW: '待处理', REVIEWING: '处理中', CONTACTED: '已联系', CLOSED: '已关闭' };
const NOTIFICATION = { UNCONFIGURED: '未配置', PENDING: '待发送', SENT: '已发送', FAILED: '发送失败' };

export default function TestRidesAdmin({ active = true, user }) {
  const [rows, setRows] = useState(null), [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null), [status, setStatus] = useState('NEW'), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [history, setHistory] = useState(null), [historyError, setHistoryError] = useState('');
  const [source, setSource] = useState(null), [sourceError, setSourceError] = useState('');
  const loadVersion = useRef(0);
  const historyVersion = useRef(0);

  const load = async () => {
    const version = ++loadVersion.current;
    try {
      const result = await api.testRides();
      if (version === loadVersion.current) { setRows(result.data); setLoadError(''); }
    } catch (failure) {
      if (version === loadVersion.current) setLoadError(failure.message);
      throw failure;
    }
  };
  useEffect(() => {
    if (!active || user?.role !== 'admin') return;
    load().catch(() => {});
    return () => { loadVersion.current++; historyVersion.current++; };
  }, [active, user?.role]);

  const select = row => {
    setEditing(row); setStatus(row.status); setNote(row.reviewNote || ''); setError(''); setMessage(''); setHistory(null); setHistoryError(''); setSource(null); setSourceError('');
    const version = ++historyVersion.current;
    api.testRideHistory(row.id).then(result => { if (version === historyVersion.current) setHistory(result.data); })
      .catch(failure => { if (version === historyVersion.current) setHistoryError(failure.message); });
    api.testRideSource(row.id).then(result => { if (version === historyVersion.current) setSource(result.data || false); })
      .catch(failure => { if (version === historyVersion.current) setSourceError(failure.message); });
  };
  const save = async event => {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.reviewTestRide(editing.id, { status, note, version: editing.version });
      loadVersion.current++;
      setRows(current => current?.map(row => row.id === result.data.id ? result.data : row));
      historyVersion.current++;
      setEditing(null);
      try { await load(); setMessage('处理结果已保存。'); }
      catch (_) { setMessage('处理结果已保存，但列表刷新失败。'); }
    } catch (failure) {
      setError(failure.status === 409 ? '记录已被其他人更新。请刷新列表并重新选择，当前输入不会自动提交。' : failure.message);
    } finally { setBusy(false); }
  };

  if (user?.role !== 'admin') return <div className="card">仅管理员可查看试骑意向。</div>;
  return <section className="card">
    <h2>试骑意向</h2>
    <p>这里只记录客户意向，不代表试骑时间、地点、订单或付款已确认。列表显示最近 200 条。</p>
    <TestRideLocationAuthorizations />
    <StoreAppointmentsAdmin />
    <button type="button" className="btn" disabled={busy} onClick={() => load().catch(() => {})}>刷新列表</button>
    {loadError && <p role="alert" className="error-text">列表读取失败：{loadError} <button type="button" className="btn small" onClick={() => load().catch(() => {})}>重试</button></p>}
    {error && <p role="alert" className="error-text">{error}</p>}
    {message && <p role="status">{message}</p>}
    {rows === null && !loadError ? <p>正在加载…</p> : rows?.length === 0 ? <p>暂无试骑意向。</p> : rows?.length > 0 && <div style={{ overflowX: 'auto' }}><table className="table">
      <thead><tr><th>状态</th><th>联系人</th><th>地区</th><th>车型与颜色</th><th>提交时间</th><th>通知</th><th>操作</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{STATUS[row.status] || row.status}</td><td>{row.name || '—'}<div>{row.email}</div></td>
        <td>{row.country} · {row.city}</td><td>{row.model} · {row.colour}</td>
        <td>{new Date(row.createdAt).toLocaleString('zh-CN')}</td><td>{NOTIFICATION[row.notificationState] || row.notificationState}</td>
        <td><button type="button" className="btn small" disabled={busy} onClick={() => select(row)}>处理</button></td>
      </tr>)}</tbody>
    </table></div>}
    {editing && <form onSubmit={save} className="card mt16">
      <h3>处理试骑意向</h3>
      <p>{editing.name || '未填写姓名'} · {editing.email} · {editing.country} {editing.city}</p>
      <TestRideAssignment key={editing.id} id={editing.id} onChanged={version=>{setEditing(current=>current?{...current,version}:current);load().catch(()=>{})}} />
      <details><summary>迁移来源</summary>{sourceError ? <p role="alert">来源读取失败：{sourceError}</p> : source === null ? <p>正在读取…</p> : source === false ? <p>此记录没有 V1 迁移来源。</p> : <p>旧编号：{source.sourceId} · 原状态：{STATUS[source.sourceStatus] || source.sourceStatus} · 原网点：{source.sourceLocationId || '未分配'} · V2 网点：{source.locationName || '未分配'}</p>}</details>
      <details><summary>历史处理记录</summary>
        {historyError ? <p role="alert">记录读取失败：{historyError}</p> : history === null ? <p>正在加载…</p> : history.length === 0 ? <p>暂无处理记录。</p> : <ul>{history.map(event => <li key={event.version}>{new Date(event.createdAt).toLocaleString('zh-CN')} · {event.actor} · {STATUS[event.previousStatus] || event.previousStatus} → {STATUS[event.status] || event.status}<div style={{whiteSpace:'pre-wrap'}}>{event.note || '无备注'}</div></li>)}</ul>}
      </details>
      <div className="field"><label htmlFor="test-ride-status">状态</label><select id="test-ride-status" value={status} onChange={event => setStatus(event.target.value)} disabled={busy}>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="test-ride-note">处理备注</label><textarea id="test-ride-note" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} disabled={busy}/></div>
      <button type="submit" className="btn primary" disabled={busy}>{busy ? '保存中…' : '保存处理结果'}</button>{' '}
      <button type="button" className="btn" disabled={busy} onClick={() => { historyVersion.current++; setEditing(null); }}>取消</button>
    </form>}
  </section>;
}
