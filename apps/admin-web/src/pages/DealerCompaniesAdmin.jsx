import DealerPricesAdmin from './DealerPricesAdmin.jsx';
import DealerApplicationsAdmin from './DealerApplicationsAdmin.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { portalRequest } from './PortalPage.jsx';

const businessRoles={legacy:'原有权限',pending:'待授权',company_admin:'企业管理员',procurement:'采购',finance:'财务',store_manager:'店长',store_staff:'店员',service:'售后'};
const blank = { name: '', country: '德国', taxId: '', address: '', contactName: '', contactPhone: '', contactEmail: '', note: '' };
const labels = { name: '企业名称', country: '国家或地区', taxId: 'VAT ID / 税号', address: '地址', contactName: '联系人', contactPhone: '联系电话', contactEmail: '联系邮箱' };

function CompanyDialog({ value, busy, error, onClose, onSave, onChange }) {
  return <div className="padmin-modal" role="dialog" aria-modal="true" aria-label={value.id ? '编辑经销商企业' : '新增经销商企业'} onClick={onClose}>
    <form className="padmin-modal__body" onSubmit={onSave} onClick={event => event.stopPropagation()}>
      <header className="padmin-modal__head"><div><span>B2B 分销</span><h3>{value.id ? '编辑经销商企业' : '新增经销商企业'}</h3></div><button type="button" className="padmin-modal__close" onClick={onClose}>×</button></header>
      <div className="padmin-modal__form"><div className="padmin-modal__grid">
        {Object.entries(labels).map(([key, label]) => <label className={key === 'address' ? 'padmin-modal__wide' : ''} key={key}><span>{label}{key === 'name' ? ' *' : ''}</span><input required={key === 'name'} type={key === 'contactEmail' ? 'email' : 'text'} value={value[key] || ''} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>)}
        <label className="padmin-modal__wide"><span>备注</span><textarea rows="3" maxLength="2000" value={value.note || ''} onChange={event => onChange({ ...value, note: event.target.value })} /></label>
      </div>{error && <p className="error-text">{error}</p>}</div>
      <footer className="padmin-modal__foot"><button type="button" className="btn" disabled={busy} onClick={onClose}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : value.id ? '保存修改' : '保存企业'}</button></footer>
    </form>
  </div>;
}

export default function DealerCompaniesAdmin({ accounts, active = true }) {
  const [companies, setCompanies] = useState([]), [links, setLinks] = useState([]), [form, setForm] = useState(blank), [showEditor, setShowEditor] = useState(false), [userId, setUserId] = useState(''), [companyId, setCompanyId] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const load = async () => { const version = ++loadVersion.current; const [c, l] = await Promise.all([portalRequest('/api/portal-management/dealer-companies'), portalRequest('/api/portal-management/dealer-company-memberships')]); if (version !== loadVersion.current) return; setCompanies(c); setLinks(l); };
  useEffect(() => { if (!active) return; load().catch(e => setMessage(e.message)); return () => { loadVersion.current++; }; }, [active]);
  const openEditor = value => { setForm(value ? { ...blank, ...value } : blank); setError(''); setShowEditor(true); };
  const closeEditor = () => { if (busy) return; setShowEditor(false); setForm(blank); setError(''); };
  const save = async event => { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const result = await portalRequest('/api/portal-management/dealer-companies' + (form.id ? '/' + encodeURIComponent(form.id) : ''), form.id ? 'PUT' : 'POST', form); setCompanies(current => form.id ? current.map(row => row.id === result.after.id ? result.after : row) : [...current, result.after]); setShowEditor(false); setForm(blank); setMessage('企业资料已保存'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const assign = async event => { event.preventDefault(); setBusy(true); setMessage(''); try { await portalRequest('/api/portal-management/dealer-accounts/' + encodeURIComponent(userId) + '/company', 'POST', { companyId, expectedCompanyId: links.find(x => x.userId === userId && !x.endedAt)?.companyId || null, reason }); setReason(''); setMessage('账号关联已保存'); await load(); } catch (e) { setMessage(e.message); } finally { setBusy(false); } };

  const changeRole=async(link,role)=>{if(role===link.businessRole)return;const reason=window.prompt('请输入角色调整原因');if(!reason?.trim())return;setBusy(true);setMessage('');try{await portalRequest('/api/portal-management/dealer-company-memberships/'+link.id+'/role','POST',{businessRole:role,revision:link.roleRevision,reason});setMessage('权限已调整，员工需要重新登录');await load()}catch(e){setMessage(e.message)}finally{setBusy(false)}};
  return <div className="padmin-stack">
    <DealerApplicationsAdmin active={active} onPrefill={application => openEditor({ ...blank, ...application })} />
    {message && <p className="padmin-flash" role="status">{message}</p>}
    <section className="padmin-panel"><div className="padmin-panel__head"><div><h3>经销商企业档案</h3><span>共 {companies.length} 家</span></div><button className="btn primary" onClick={() => openEditor()}>＋ 新增企业</button></div><div className="padmin-panel__scroll"><table className="table"><thead><tr><th>企业</th><th>国家或地区</th><th>VAT ID / 税号</th><th>联系人</th><th>联系方式</th><th>操作</th></tr></thead><tbody>{companies.map(company => <tr key={company.id}><td><strong>{company.name}</strong></td><td>{company.country || '—'}</td><td>{company.taxId || '—'}</td><td>{company.contactName || '—'}</td><td>{company.contactPhone || company.contactEmail || '—'}</td><td><button className="btn small" disabled={busy} onClick={() => openEditor(company)}>编辑</button></td></tr>)}{!companies.length && <tr><td colSpan="6"><div className="padmin-empty"><strong>暂无企业档案</strong>点击右上角新增企业。</div></td></tr>}</tbody></table></div></section>
    <section className="padmin-panel"><div className="padmin-panel__head"><h3>账号与企业关联</h3><span>经销商账号只能查看已关联企业的订单与专属价格</span></div><div className="padmin-panel__body"><form className="padmin-form__grid" onSubmit={assign}><div className="field"><label>经销商账号</label><select required value={userId} onChange={event => setUserId(event.target.value)}><option value="">选择账号</option>{accounts.filter(account => account.role === 'dealer' && account.enabled).map(account => <option key={account.id} value={account.id}>{account.username}</option>)}</select></div><div className="field"><label>企业</label><select required value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">选择企业</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div><div className="field"><label>变更说明</label><input required maxLength="2000" placeholder="例如：已核验经销协议" value={reason} onChange={event => setReason(event.target.value)} /></div><div className="padmin-form__actions"><button className="btn primary" disabled={busy}>保存关联</button></div></form><div className="padmin-panel__scroll mt16"><table className="table"><thead><tr><th>账号</th><th>企业</th><th>开始</th><th>结束</th><th>业务角色</th><th>说明</th></tr></thead><tbody>{links.map(link => <tr key={link.id}><td>{link.username}</td><td>{link.companyName}</td><td>{new Date(link.startedAt).toLocaleString('zh-CN')}</td><td>{link.endedAt ? new Date(link.endedAt).toLocaleString('zh-CN') : '当前'}</td><td>{link.endedAt?businessRoles[link.businessRole]||'—':<select disabled={busy} value={link.businessRole} onChange={e=>void changeRole(link,e.target.value)}>{Object.entries(businessRoles).map(([key,label])=><option key={key} value={key} disabled={key==='legacy'}>{label}</option>)}</select>}</td><td>{link.reason || '—'}</td></tr>)}{!links.length && <tr><td colSpan="6" className="empty-cell">暂无关联记录</td></tr>}</tbody></table></div></div></section>
    <DealerPricesAdmin active={active} companies={companies} />
    {showEditor && <CompanyDialog value={form} busy={busy} error={error} onClose={closeEditor} onSave={save} onChange={setForm} />}
  </div>;
}
