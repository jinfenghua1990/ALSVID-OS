import React, { useEffect, useRef, useState } from 'react';
import { portalRequest, serviceStatus } from './PortalPage.jsx';

const timeText = value => (value ? new Date(value).toLocaleString('zh-CN') : '—');
const filters = [['all', '全部'], ['submitted', '待受理'], ['accepted', '已受理'], ['rejected', '未受理']];

export default function ServiceRequestsAdmin({ user, active = true }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('submitted');
  const [review, setReview] = useState(null), [note, setNote] = useState('');
  const [message, setMessage] = useState(''), [messageError, setMessageError] = useState(false), [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const reload = async () => {
    const version = ++loadVersion.current;
    const data = await portalRequest('/api/portal-management/service-requests');
    if (version === loadVersion.current) setRows(data);
  };
  useEffect(() => {
    if (user.role !== 'admin' || !active) return;
    setMessage('');
    reload().catch(e => { setMessage(e.message); setMessageError(true); });
    return () => { loadVersion.current++; };
  }, [user.role, active]);
  const submit = async (decision) => {
    if (!review || !note.trim() || busy) return;
    setBusy(true); setMessage(''); setMessageError(false);
    try {
      await portalRequest(`/api/portal-management/service-requests/${encodeURIComponent(review.id)}/review`, 'POST', { decision, note });
      setReview(null); setNote('');
      await reload();
      setMessage(decision === 'accept' ? '已受理，并生成对应维修工单。' : '已标记为不予受理。');
    } catch (e) { setMessage(e.message); setMessageError(true); }
    finally { setBusy(false); }
  };
  if (user.role !== 'admin') return <div className="card">仅管理员可处理门户服务申请。</div>;

  const pending = rows.filter(r => r.status === 'submitted').length;
  const accepted = rows.filter(r => r.status === 'accepted').length;
  const visible = filter === 'all' ? rows : rows.filter(r => r.status === filter);

  return <div className="padmin">
    <header className="padmin-head">
      <div>
        <h2>门户服务申请</h2>
        <p className="hint">车主在门户提交的售后服务申请集中在这里处理；受理后自动创建维修工单并回填工单号。</p>
      </div>
      <div className="padmin-head__tools">
        <a className="btn small" href="/my" target="_blank" rel="noreferrer">车主入口 ↗</a>
        <button type="button" className="btn small" disabled={busy} onClick={() => { setMessage(''); reload().then(() => setMessage('服务申请已刷新。')).catch(e => { setMessage(e.message); setMessageError(true); }); }}>刷新数据</button>
      </div>
    </header>

    <div className="padmin-stats">
      <div className="padmin-stat"><span>待受理申请</span><strong className={pending ? 'is-warn' : ''}>{pending}<em>需处理</em></strong></div>
      <div className="padmin-stat"><span>已受理</span><strong className="is-on">{accepted}<em>已建工单</em></strong></div>
      <div className="padmin-stat"><span>累计申请</span><strong>{rows.length}<em>全部</em></strong></div>
      <div className="padmin-stat"><span>未受理</span><strong>{rows.filter(r => r.status === 'rejected').length}<em>已回复</em></strong></div>
    </div>

    {message && <p className={'padmin-flash' + (messageError ? ' is-error' : '')} role={messageError ? 'alert' : 'status'}>{message}</p>}

    {review && <section className="padmin-review">
      <div className="padmin-review__head">
        <h3>处理服务申请 · {review.vin}</h3>
        <span>{review.username} · {timeText(review.createdAt)}{review.serviceCenterName && ' · ' + review.serviceCenterName}</span>
      </div>
      <p className="padmin-review__quote">{review.description}</p>
      <div className="field"><label htmlFor="service-request-reply">给申请人的回复</label><textarea id="service-request-reply" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></div>
      <div className="padmin-review__actions">
        <button className="btn accent" disabled={busy || !note.trim()} onClick={() => submit('accept')}>受理并创建维修工单</button>
        <button className="btn primary" disabled={busy || !note.trim()} onClick={() => submit('reject')}>不予受理</button>
        <button className="btn" disabled={busy} onClick={() => { setReview(null); setNote(''); }}>取消</button>
      </div>
    </section>}

    <section className="padmin-panel">
      <div className="padmin-panel__head">
        <h3>申请列表</h3>
        <div className="padmin-filters">
          {filters.map(([key, label]) => <button type="button" key={key} className={'padmin-chip' + (filter === key ? ' is-active' : '')} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
      </div>
      <div className="padmin-panel__scroll">
        <table className="table">
          <thead><tr><th>VIN</th><th>申请人</th><th>申请网点</th><th>问题描述</th><th>提交时间</th><th>工单</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {visible.map(s => <tr key={s.id}>
              <td className="padmin-mono">{s.vin}</td>
              <td>{s.username}</td>
              <td>{s.serviceCenterName || '—'}</td>
              <td><div className="padmin-note" title={s.description}>{s.description || '—'}</div></td>
              <td className="padmin-time">{timeText(s.createdAt)}</td>
              <td>{s.workOrderNo ? <div className="cell-stack"><span className="stack-main">{s.workOrderNo}</span><span className="stack-sub">{s.repairStatus || '—'}</span></div> : '—'}</td>
              <td><span className={'tag ' + (s.status === 'accepted' ? 'on' : s.status === 'submitted' ? 'plan' : 'off')}>{serviceStatus[s.status] || s.status}</span></td>
              <td><div className="padmin-ops">{s.status === 'submitted' ? <button className="btn small" disabled={busy} onClick={() => { setReview(s); setNote(''); }}>处理申请</button> : <span className="muted">—</span>}</div></td>
            </tr>)}
            {!visible.length && <tr><td colSpan={8}><div className="padmin-empty"><strong>{rows.length ? '当前筛选下没有申请' : '暂无服务申请'}</strong>{rows.length ? '切换上方状态筛选查看其它记录。' : '车主在门户提交售后服务申请后会显示在这里。'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
