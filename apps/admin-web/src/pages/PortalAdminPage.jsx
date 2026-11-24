import React, { useEffect, useRef, useState } from 'react';
import { portalRequest, requestStatus } from './PortalPage.jsx';

const blankAccount = { username: '', password: '', role: 'owner', reviewNote: '', supplierPartnerId: '' };
const roleNames = { owner: '车主', dealer: '经销商', supplier: '供应商' };
const requestFilters = [['all', '全部'], ['pending', '待审核'], ['approved', '已批准'], ['rejected', '未通过'], ['revoked', '已撤销']];
const timeText = value => (value ? new Date(value).toLocaleString('zh-CN') : '—');
const roleTag = role => <span className={`padmin-role is-${role}`}>{roleNames[role] || role}</span>;

export default function PortalAdminPage({ user, active = true }) {
  const [accounts, setAccounts] = useState([]), [requests, setRequests] = useState([]), [partners, setPartners] = useState([]);
  const [tab, setTab] = useState('accounts'), [requestFilter, setRequestFilter] = useState('pending');
  const [message, setMessage] = useState(''), [messageError, setMessageError] = useState(false), [reloadError, setReloadError] = useState(''), [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blankAccount), [review, setReview] = useState(null), [note, setNote] = useState('');
  const [reset, setReset] = useState(null), [newPassword, setNewPassword] = useState('');
  const loadVersion = useRef(0);
  const reload = async () => {
    const version = ++loadVersion.current;
    const [a, r, p] = await Promise.all([
      portalRequest('/api/portal-management/accounts'),
      portalRequest('/api/portal-management/vehicle-requests'),
      portalRequest('/api/procurement').catch(() => ({ data: { partners: [] } })),
    ]);
    if (version !== loadVersion.current) return;
    setAccounts(a); setRequests(r); setPartners(p.data?.partners || []);
  };
  useEffect(() => {
    if (user.role !== 'admin' || !active) return;
    reload().catch(e => setReloadError(e.message));
    return () => { loadVersion.current++; };
  }, [user.role, active]);
  const action = async (fn, success) => {
    setBusy(true); setMessage(''); setMessageError(false); setReloadError('');
    try { await fn(); } catch (e) { setMessage(e.message); setMessageError(true); setBusy(false); return; }
    try { await reload(); setMessage(success); }
    catch (e) { setMessage(`${success}但门户列表刷新失败。`); setReloadError(e.message); }
    finally { setBusy(false); }
  };
  const retryReload = async () => {
    setBusy(true); setMessageError(false); setReloadError('');
    try { await reload(); setMessage('门户资料已刷新。'); }
    catch (e) { setReloadError(e.message); }
    finally { setBusy(false); }
  };
  if (user.role !== 'admin') return <div className="card">仅管理员可查看门户身份资料与审核申请。</div>;

  const pendingVehicles = requests.filter(r => r.status === 'pending').length;
  const approvedVehicles = requests.filter(r => r.status === 'approved').length;
  const enabledAccounts = accounts.filter(a => a.enabled).length;
  const visibleRequests = requestFilter === 'all' ? requests : requests.filter(r => r.status === requestFilter);
  const navItems = [
    ['accounts', '门户账号', accounts.length],
    ['vehicles', '车辆授权', pendingVehicles],
  ];
  const stats = [
    { tab: 'accounts', label: '门户账号', value: accounts.length, extra: `启用 ${enabledAccounts}`, tone: '' },
    { tab: 'accounts', label: '已停用账号', value: accounts.length - enabledAccounts, extra: '不可登录', tone: '' },
    { tab: 'vehicles', label: '待审核车辆授权', value: pendingVehicles, extra: '需处理', tone: pendingVehicles ? 'is-warn' : '' },
    { tab: 'vehicles', label: '已授权车辆', value: approvedVehicles, extra: '生效中', tone: 'is-on' },
  ];

  return <div className="padmin">
    <header className="padmin-head">
      <div>
        <h2>门户账号与车辆授权</h2>
        <p className="hint">核实车主、经销商与供应商身份后开通门户账号，并处理车辆授权申请。经销企业、订货对账与退货已迁至「客户与渠道 → 渠道与经销」，门户服务申请迁至「售后服务 → 门户服务申请」。</p>
      </div>
      <div className="padmin-head__tools">
        <a className="btn small" href="/my" target="_blank" rel="noreferrer">车主入口 ↗</a>
        <a className="btn small" href="/dealer" target="_blank" rel="noreferrer">经销商入口 ↗</a>
        <button type="button" className="btn small primary" disabled={busy} onClick={retryReload}>刷新数据</button>
      </div>
    </header>

    <div className="padmin-stats">
      {stats.map((item, index) => <button type="button" key={index} className="padmin-stat" onClick={() => setTab(item.tab)}>
        <span>{item.label}</span>
        <strong className={item.tone}>{item.value}<em>{item.extra}</em></strong>
      </button>)}
    </div>

    <nav className="padmin-nav" aria-label="门户管理分区">
      {navItems.map(([key, label, count]) => <button type="button" key={key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
        {label}{count > 0 && <b>{count}</b>}
      </button>)}
    </nav>

    {message && <p className={'padmin-flash' + (messageError ? ' is-error' : '')} role={messageError ? 'alert' : 'status'}>{message}</p>}
    {reloadError && <p className="padmin-flash is-error" role="alert">列表刷新失败：{reloadError} <button type="button" className="btn small" disabled={busy} onClick={retryReload}>重试刷新</button></p>}

    {tab === 'accounts' && <>
      {reset && <form className="padmin-review" onSubmit={e => {
        e.preventDefault();
        action(async () => {
          await portalRequest(`/api/portal-management/accounts/${encodeURIComponent(reset.id)}/password`, 'POST', { newPassword });
          setReset(null); setNewPassword('');
        }, '密码已重置，原有登录已失效。');
      }}>
        <div className="padmin-review__head"><h3>重置门户密码 · {reset.username}</h3><span>重置后该账号需要重新登录</span></div>
        <div className="field"><label htmlFor="portal-new-password">新的初始密码（8–20 个字符）</label><input id="portal-new-password" type="password" required minLength={8} maxLength={20} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
        <div className="padmin-review__actions"><button className="btn primary" disabled={busy}>确认重置</button><button className="btn" type="button" disabled={busy} onClick={() => { setReset(null); setNewPassword(''); }}>取消</button></div>
      </form>}

      <div className="padmin-split">
        <section className="padmin-panel">
          <div className="padmin-panel__head"><h3>开通门户账号</h3></div>
          <form className="padmin-panel__body padmin-form" onSubmit={e => {
            e.preventDefault();
            action(async () => {
              await portalRequest('/api/portal-management/accounts', 'POST', form);
              setForm(blankAccount);
            }, '门户账号已开通，请通过已核实的联系方式交付账号。');
          }}>
            <fieldset disabled={busy} className="padmin-form">
              <div className="field"><label htmlFor="portal-username">门户账号</label><input id="portal-username" value={form.username} autoComplete="off" onChange={e => setForm({ ...form, username: e.target.value })} required /></div>
              <div className="field"><label htmlFor="portal-password">初始密码（8–20 个字符）</label><input id="portal-password" type="password" minLength={8} maxLength={20} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></div>
              <div className="field"><label htmlFor="portal-role">门户角色</label><select id="portal-role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="owner">车主</option><option value="dealer">经销商</option><option value="supplier">供应商</option></select></div>
              {form.role === 'supplier' && <div className="field"><label htmlFor="portal-partner">绑定供应商</label><select id="portal-partner" required value={form.supplierPartnerId} onChange={e => setForm({ ...form, supplierPartnerId: e.target.value })}><option value="">请选择</option>{partners.map(p => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select></div>}
              <div className="field"><label htmlFor="portal-account-review">身份或合作资格核实记录</label><textarea id="portal-account-review" rows={5} maxLength={2000} placeholder="例如：已核验营业执照、车主行驶证与联系方式" value={form.reviewNote} onChange={e => setForm({ ...form, reviewNote: e.target.value })} required /></div>
              <button className="btn primary">确认已核实并开通</button>
            </fieldset>
          </form>
        </section>

        <section className="padmin-panel">
          <div className="padmin-panel__head">
            <h3>已开通账号</h3>
            <span>共 {accounts.length} 个 · 启用 {enabledAccounts} 个 · 停用 {accounts.length - enabledAccounts} 个</span>
          </div>
          <div className="padmin-panel__scroll">
            <table className="table">
              <thead><tr><th>账号</th><th>角色</th><th>核实记录</th><th>审核</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {accounts.map(a => <tr key={a.id}>
                  <td><div className="cell-stack"><span className="stack-main">{a.username}</span>{a.role === 'supplier' && <span className="stack-sub">{a.partnerName || '未关联供应商'}</span>}</div></td>
                  <td>{roleTag(a.role)}</td>
                  <td><div className="padmin-note" title={a.reviewNote}>{a.reviewNote || '—'}</div></td>
                  <td><div className="cell-stack"><span className="stack-main">{a.reviewedBy || '—'}</span><span className="stack-sub">{timeText(a.reviewedAt)}</span></div></td>
                  <td><span className={'tag ' + (a.enabled ? 'on' : 'off')}>{a.enabled ? '启用' : '停用'}</span></td>
                  <td><div className="padmin-ops">
                    <button className="btn small" disabled={busy} onClick={() => {
                      if (a.enabled && !window.confirm(`停用后“${a.username}”将无法登录门户，确定停用？`)) return;
                      action(() => portalRequest(`/api/portal-management/accounts/${encodeURIComponent(a.id)}`, 'PATCH', { enabled: !a.enabled }), '账号状态已更新。');
                    }}>{a.enabled ? '停用' : '启用'}</button>
                    <button className="btn small" disabled={busy} onClick={() => { setReset(a); setNewPassword(''); }}>重置密码</button>
                  </div></td>
                </tr>)}
                {!accounts.length && <tr><td colSpan={6}><div className="padmin-empty"><strong>暂无门户账号</strong>在左侧核实身份后开通第一个门户账号。</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>}

    {tab === 'vehicles' && <>
      {review && <section className="padmin-review">
        <div className="padmin-review__head">
          <h3>{review.status === 'pending' ? '审核' : '撤销'}车辆授权 · {review.vin}</h3>
          <span>申请人 {review.username} · {roleNames[review.role] || review.role} · 提交于 {timeText(review.createdAt)}</span>
        </div>
        <p className="padmin-review__quote">{review.note}</p>
        <div className="field"><label htmlFor="portal-decision">审核说明（批准或撤销都必须填写，将写入审计）</label><textarea id="portal-decision" rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></div>
        <div className="padmin-review__actions">
          {(review.status === 'pending' ? [['approve', '核实并批准'], ['reject', '不予批准']] : [['revoke', '确认撤销授权']]).map(([decision, label]) => <button className={'btn ' + (decision === 'approve' ? 'accent' : 'primary')} key={decision} disabled={busy || !note.trim()} onClick={() => action(async () => {
            await portalRequest(`/api/portal-management/vehicle-requests/${encodeURIComponent(review.id)}/review`, 'POST', { decision, note });
            setReview(null); setNote('');
          }, '审核结果已保存。')}>{label}</button>)}
          <button className="btn" disabled={busy} onClick={() => setReview(null)}>取消</button>
        </div>
      </section>}

      <section className="padmin-panel">
        <div className="padmin-panel__head">
          <h3>车辆授权申请</h3>
          <div className="padmin-filters">
            {requestFilters.map(([key, label]) => <button type="button" key={key} className={'padmin-chip' + (requestFilter === key ? ' is-active' : '')} onClick={() => setRequestFilter(key)}>{label}</button>)}
          </div>
        </div>
        <div className="padmin-panel__scroll">
          <table className="table">
            <thead><tr><th>VIN</th><th>申请人</th><th>角色</th><th>申请说明</th><th>提交时间</th><th>状态</th><th>审核记录</th><th>操作</th></tr></thead>
            <tbody>
              {visibleRequests.map(r => <tr key={r.id}>
                <td className="padmin-mono">{r.vin}</td>
                <td>{r.username}</td>
                <td>{roleTag(r.role)}</td>
                <td><div className="padmin-note" title={r.note}>{r.note || '—'}</div></td>
                <td className="padmin-time">{timeText(r.createdAt)}</td>
                <td><span className={'tag ' + (r.status === 'approved' ? 'on' : r.status === 'pending' ? 'plan' : 'off')}>{requestStatus[r.status] || r.status}</span></td>
                <td><div className="padmin-note" title={r.decisionNote}>{r.decisionNote || '—'}</div></td>
                <td><div className="padmin-ops">
                  {['pending', 'approved'].includes(r.status) && <button className="btn small" disabled={busy} onClick={() => { setReview(r); setNote(''); }}>{r.status === 'pending' ? '审核' : '撤销授权'}</button>}
                  {!['pending', 'approved'].includes(r.status) && <span className="muted">—</span>}
                </div></td>
              </tr>)}
              {!visibleRequests.length && <tr><td colSpan={8}><div className="padmin-empty"><strong>{requests.length ? '当前筛选下没有申请' : '暂无车辆授权申请'}</strong>{requests.length ? '切换上方状态筛选查看其它记录。' : '车主或经销商在门户提交车辆授权后会显示在这里。'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </div>;
}
