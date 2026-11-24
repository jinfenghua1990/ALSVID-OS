import React, { useEffect, useRef, useState } from 'react';
import { portalRequest } from './PortalPage.jsx';

const blank = { companyId: '', sku: '', currency: 'EUR', unitPrice: '', enabled: true };

function PriceDialog({ value, companies, skus, busy, error, onClose, onSave, onChange }) {
  return <div className="padmin-modal" role="dialog" aria-modal="true" aria-label={value.id ? '编辑经销商价格' : '新增经销商价格'} onClick={onClose}>
    <form className="padmin-modal__body padmin-modal__body--compact" onSubmit={onSave} onClick={event => event.stopPropagation()}>
      <header className="padmin-modal__head"><div><span>B2B 分销</span><h3>{value.id ? '编辑专属价格' : '新增专属价格'}</h3></div><button type="button" className="padmin-modal__close" onClick={onClose}>×</button></header>
      <div className="padmin-modal__form"><div className="padmin-modal__grid">
        <label><span>经销商企业</span><select required disabled={!!value.id} value={value.companyId} onChange={event => onChange({ ...value, companyId: event.target.value })}><option value="">选择企业</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span>商品 SKU</span><select required disabled={!!value.id} value={value.sku} onChange={event => onChange({ ...value, sku: event.target.value })}><option value="">选择 SKU</option>{skus.map(item => <option key={item.sku} value={item.sku}>{item.sku} · {item.name}</option>)}</select></label>
        <label><span>币种</span><select disabled={!!value.id} value={value.currency} onChange={event => onChange({ ...value, currency: event.target.value })}><option>EUR</option><option>CNY</option></select></label>
        <label><span>单价</span><input type="number" min="0" max="100000000" step="0.01" required value={value.unitPrice} onChange={event => onChange({ ...value, unitPrice: event.target.value })} /></label>
        <label><span>状态</span><select value={String(value.enabled)} onChange={event => onChange({ ...value, enabled: event.target.value === 'true' })}><option value="true">启用</option><option value="false">停用</option></select></label>
      </div>{error && <p className="error-text">{error}</p>}</div>
      <footer className="padmin-modal__foot"><button type="button" className="btn" disabled={busy} onClick={onClose}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : value.id ? '保存修改' : '保存价格'}</button></footer>
    </form>
  </div>;
}

export default function DealerPricesAdmin({ companies, active = true }) {
  const [prices, setPrices] = useState([]), [skus, setSkus] = useState([]), [form, setForm] = useState(blank), [showEditor, setShowEditor] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const loadVersion = useRef(0);
  const load = async () => { const version = ++loadVersion.current; const [p, products] = await Promise.all([portalRequest('/api/portal-management/dealer-company-prices'), portalRequest('/api/products')]); if (version !== loadVersion.current) return; setPrices(p); setSkus(products.flatMap(product => product.skus.map(sku => ({ sku: sku.sku, name: product.name })))); };
  useEffect(() => { if (!active) return; load().catch(e => setMessage(e.message)); return () => { loadVersion.current++; }; }, [active]);
  const openEditor = value => { setForm(value ? { ...blank, ...value } : blank); setError(''); setShowEditor(true); };
  const closeEditor = () => { if (busy) return; setShowEditor(false); setForm(blank); setError(''); };
  const save = async event => { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const result = await portalRequest('/api/portal-management/dealer-company-prices' + (form.id ? '/' + encodeURIComponent(form.id) : ''), form.id ? 'PUT' : 'POST', form); setPrices(current => form.id ? current.map(row => row.id === result.after.id ? result.after : row) : [...current, result.after]); setShowEditor(false); setForm(blank); setMessage('企业价格已保存'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <section className="padmin-panel"><div className="padmin-panel__head"><div><h3>经销商专属价格</h3><span>共 {prices.length} 条</span></div><button className="btn primary" onClick={() => openEditor()}>＋ 新增价格</button></div><div className="padmin-panel__scroll"><table className="table"><thead><tr><th>企业</th><th>SKU</th><th>价格</th><th>状态</th><th>操作</th></tr></thead><tbody>{prices.map(price => <tr key={price.id}><td>{price.companyName || companies.find(company => company.id === price.companyId)?.name || '—'}</td><td>{price.sku}</td><td><strong>{price.currency} {price.unitPrice}</strong></td><td><span className={'tag ' + (price.enabled ? 'on' : 'off')}>{price.enabled ? '启用' : '停用'}</span></td><td><button className="btn small" disabled={busy} onClick={() => openEditor(price)}>编辑</button></td></tr>)}{!prices.length && <tr><td colSpan="5"><div className="padmin-empty"><strong>暂无专属价格</strong>点击右上角新增价格。</div></td></tr>}</tbody></table></div>{message && <p className="padmin-flash" role="status">{message}</p>}{showEditor && <PriceDialog value={form} companies={companies} skus={skus} busy={busy} error={error} onClose={closeEditor} onSave={save} onChange={setForm} />}</section>;
}
