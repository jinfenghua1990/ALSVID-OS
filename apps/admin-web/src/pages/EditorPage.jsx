import { resolveFitments, fitmentError, fitmentPayload } from '../fitments.js';
import { skuSpecOptions, buildVehicleSku } from '../sku.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal, { ColorDictDialog } from '../Dialogs.jsx';
import { CloudImage } from '../cloud.jsx';

const TABS_VEHICLE = ['基本信息', '版本管理', 'SKU 规格', '技术参数', '关联 BOM', '素材', '产品资料', '变更记录'];
const TABS_PART = ['基本信息', '技术参数', 'SKU 规格', '适配关系', '素材', '图片资料', '变更记录'];

/* 统一编辑器（规范第 3 章）：整车和零配件共用编辑器框架，
   根据产品类型显示不同 TAB；不显示与当前产品类型无关的字段和 TAB。 */
export function EditorPage({ id, meta, onBack, canEdit = true, workspaceKey, onWorkspaceDirtyChange, initialTab }) {
  const defaultTab = initialTab || '基本信息';
  const [p, setP] = useState(null);
  const [fields, setFields] = useState([]);
  const [colors, setColors] = useState([]);
  const [tab, setTab] = useState(defaultTab);
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([defaultTab]));
  const [dirtyTabs, setDirtyTabs] = useState({});
  const [toast, setToast] = useState(null);
  const [err, setErr] = useState('');
  const isVehicle = p?.kind === 'vehicle';
  const currentId = useRef(id);
  const refreshVersion = useRef(0);
  currentId.current = id;
  const reportTabDirty = useCallback((name, dirty) => setDirtyTabs(current => current[name] === dirty ? current : { ...current, [name]: dirty }), []);
  useEffect(() => { onWorkspaceDirtyChange?.(workspaceKey, Object.values(dirtyTabs).some(Boolean)); }, [dirtyTabs, onWorkspaceDirtyChange, workspaceKey]);

  const refresh = async () => {
    const requestedId = currentId.current;
    const version = ++refreshVersion.current;
    setErr('');
    try {
      const [product, nextFields, nextColors] = await Promise.all([api.product(requestedId), api.fields(), api.colors()]);
      if (version !== refreshVersion.current || requestedId !== currentId.current) return;
      setP(product);
      setFields(nextFields);
      setColors(nextColors);
      setErr('');
    } catch (error) {
      if (version === refreshVersion.current && requestedId === currentId.current) setErr(error.message);
    }
  };
  useEffect(() => {
    setP(null);
    setTab(defaultTab);
    setVisitedTabs(new Set([defaultTab]));
    setDirtyTabs({});
    refresh();
    return () => { refreshVersion.current++; };
  }, [id, defaultTab]);

  const notify = (msg, isErr) => {
    setToast({ msg, err: !!isErr });
    setTimeout(() => setToast(null), 2600);
  };

  if (!p || p.id !== id) return <div className="card">{err?<><p className="error-text" role="alert">产品资料读取失败：{err}</p><button type="button" className="btn" onClick={refresh}>重新加载产品资料</button></>:<span className="hint" />}</div>;

  const tabs = (isVehicle ? TABS_VEHICLE : TABS_PART).filter(t => canEdit || t !== '变更记录');
  const changeTab = next => {
    if (next === tab) return;
    setVisitedTabs(previous => new Set(previous).add(next));
    setTab(next);
  };

  return (
    <div>
      {toast && <div className={'toast' + (toast.err ? ' err' : '')} role={toast.err ? 'alert' : 'status'} aria-live="assertive">
        <span className="toast__mark" aria-hidden="true">{toast.err ? '!' : '✓'}</span>
        <span className="toast__msg">{toast.msg}</span>
      </div>}
      <div className="editor-head">
        <button className="btn small" onClick={onBack}>← 返回列表</button>
        <h2 />
        <span className="tag sku" style={{ fontFamily: 'Consolas, monospace' }}>{p.ownership}-{p.productType}-…</span>
        <span className="tag">{isVehicle ? '整车产品' : '零配件'}</span>
        <span className="tag">{(meta.templates.find(t => t.code === p.productType) || {}).name}</span>
        {!canEdit && <span className="hint" />}
      </div>
      {err && <div className="error-text mb12" role="alert">{err} <button type="button" className="btn small" onClick={refresh}>重新加载</button></div>}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => changeTab(t)}>{t}</button>
        ))}
      </div>

      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="editor-tab-content" key={id}>
      {visitedTabs.has('基本信息') && <div hidden={tab !== '基本信息'}><BasicTab p={p} meta={meta} onDirtyChange={value=>reportTabDirty('基本信息',value)} onSaved={() => { refresh(); notify('已保存'); }} notify={notify} /></div>}
      {isVehicle && visitedTabs.has('版本管理') && <div hidden={tab !== '版本管理'}><VersionTab p={p} notify={notify} hasUnsaved={Object.entries(dirtyTabs).some(([name,dirty])=>name!=='版本管理'&&dirty)} onDirtyChange={value=>reportTabDirty('版本管理',value)} /></div>}
      {visitedTabs.has('技术参数') && <div hidden={tab !== '技术参数'}><TechTab p={p} fields={fields} onDirtyChange={value=>reportTabDirty('技术参数',value)} onSaved={() => { refresh(); notify('技术参数已保存'); }} notify={notify} /></div>}
      {visitedTabs.has('SKU 规格') && <div hidden={tab !== 'SKU 规格'}><SkuTab p={p} meta={meta} colors={colors} fields={fields}
        onDirtyChange={value=>reportTabDirty('SKU 规格',value)} onChanged={refresh} notify={notify} /></div>}
      {isVehicle && visitedTabs.has('关联 BOM') && <div hidden={tab !== '关联 BOM'}><BomTab p={p} meta={meta} onDirtyChange={value=>reportTabDirty('关联 BOM',value)} onChanged={refresh} notify={notify} /></div>}
      {!isVehicle && visitedTabs.has('适配关系') && <div hidden={tab !== '适配关系'}><FitTab p={p} onDirtyChange={value=>reportTabDirty('适配关系',value)} onChanged={refresh} notify={notify} /></div>}
      {visitedTabs.has('素材') && <div hidden={tab !== '素材'}><AssetTab p={p} notify={notify} /></div>}
      {(visitedTabs.has('产品资料') || visitedTabs.has('图片资料')) && <div hidden={tab !== (isVehicle ? '产品资料' : '图片资料')}><ImagesTab p={p} onChanged={refresh} notify={notify} /></div>}
      {visitedTabs.has('变更记录') && <div hidden={tab !== '变更记录'}><HistoryTab id={p.id} /></div>}
      </div>
      </fieldset>
    </div>
  );
}

export function VersionTab({ p, notify, onDirtyChange, hasUnsaved }) {
  const [rows,setRows]=useState([]),[label,setLabel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{try{setRows(await api.productVersions(p.id));setError('')}catch(e){setError(e.message)}},[p.id]);
  useEffect(()=>{load()},[load]);
  useEffect(()=>{onDirtyChange?.(Boolean(label.trim()))},[label,onDirtyChange]);
  const create=async()=>{setBusy(true);try{await api.createProductVersion(p.id,{label:label.trim(),version:p.version});setLabel('');await load();notify('产品版本已保存')}catch(e){notify(e.message,true)}finally{setBusy(false)}};
  return <div className="card"><div className="row"><label>版本名称 <input maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} placeholder="例如 V1.0" /></label><button type="button" className="btn primary" disabled={busy||hasUnsaved||!label.trim()} onClick={create}>保存当前产品版本</button></div><p className="hint" />{error&&<p className="error-text">{error}</p>}<table className="table mt16"><thead><tr><th>版本</th><th>创建时间</th><th>创建人</th><th>内容</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.label}</td><td>{new Date(row.createdAt).toLocaleString('zh-CN')}</td><td>{row.createdBy}</td><td><details><summary>查看快照</summary><pre style={{whiteSpace:'pre-wrap',maxHeight:360,overflow:'auto'}}>{JSON.stringify(row.snapshot,null,2)}</pre></details></td></tr>)}</tbody></table></div>;
}

function HistoryTab({ id }) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [hasMore,setHasMore]=useState(false);
  const [cursor,setCursor]=useState('');
  const load=async(append=false)=>{setLoading(true);try{const page=await api.productHistory(id,append?cursor:'');setRows(current=>append?[...current,...page.items]:page.items);setHasMore(page.hasMore);setCursor(page.items.at(-1)?.id||'');setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[id]);
  const labels={'product.create':'创建产品','product.update':'更新产品资料','product.media.add':'添加图片资料','sku.create':'生成 SKU','sku.attributes.update':'更新 SKU 参数','sku.delete':'删除 SKU','bom.version.create':'创建 BOM 草稿','bom.version.update':'更新 BOM 草稿','bom.version.publish':'发布 BOM','fitments.update':'更新适配关系'};
  return <div className="card">
    <div className="row mb12"><h3 style={{margin:0}}>产品变更记录</h3><button type="button" className="btn small" disabled={loading} onClick={()=>load(false)}>重新加载</button><span className="hint" /></div>
    {loading&&!rows.length?<p className="hint" />:error?<p className="error-text" role="alert">读取变更记录失败：{error} <button type="button" className="btn small" disabled={loading} onClick={()=>load(rows.length>0)}>重新加载</button></p>:!rows.length?<p className="hint" />:<><div>{rows.map(row=><details key={row.id} className="card mt8">
      <summary>{labels[row.action]||row.action} · {row.actor} · {new Date(row.at).toLocaleString('zh-CN')}</summary>
      <p className="hint" />
      <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
        <div><strong>变更前</strong><pre style={{maxHeight:320,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.before==null?'（无）':JSON.stringify(row.before,null,2)}</pre></div>
        <div><strong>变更后</strong><pre style={{maxHeight:320,overflow:'auto',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.after==null?'（无）':JSON.stringify(row.after,null,2)}</pre></div>
      </div>
    </details>)}</div>{hasMore&&<button type="button" className="btn mt8" disabled={loading} onClick={()=>load(true)}>{loading?'正在加载…':'加载更多记录'}</button>}{loading&&<p className="hint" />}</>}
  </div>;
}

/* ---------------- 基本信息 ---------------- */
function BasicTab({ p, meta, onSaved, notify, onDirtyChange }) {
  const [form, setForm] = useState({ name: p.name, model: p.model, status: p.status, ownership: p.ownership, uses: p.uses || [] });
  const [version, setVersion] = useState(p.version);
  const isVehicle = p.kind === 'vehicle';
  const hasSku = p.skus.length > 0;
  const lockCode = hasSku || (isVehicle && p.modelLocked);
  const dirty=form.name!==p.name||form.model!==p.model||form.status!==p.status||form.ownership!==p.ownership||JSON.stringify([...form.uses].sort())!==JSON.stringify([...(p.uses||[])].sort());
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);

  const save = async () => {
    try { const updated = await api.updateProduct(p.id, form, version); setVersion(updated.version); onSaved(); notify('基础信息保存成功'); }
    catch (e) { notify(e.message, true); }
  };

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="field"><label>名称</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        {isVehicle ? (
          <div className="field"><label>型号（SKU 第一段）</label>
            <input value={form.model} disabled={lockCode}
              onChange={e => setForm({ ...form, model: e.target.value.toUpperCase(), ownership: e.target.value.toUpperCase() })} /></div>
        ) : (
          <div className="field"><label>归属（SKU 第一段）</label>
            <select value={form.ownership} disabled={lockCode}
              onChange={e => setForm({ ...form, ownership: e.target.value })}>
              {meta.ownership.map(o => <option key={o.code} value={o.code}>{o.code} - {o.label}</option>)}
            </select></div>
        )}
        <div className="field"><label>{isVehicle ? '产品类型（SKU 第二段品类编码）' : '品类编码'}</label>
          <input value={p.productType} disabled title="品类编码创建后不变更" /></div>
        <div className="field"><label>状态</label>
          <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            <option>启用</option><option>停用</option><option>规划</option>
          </select></div>
        {!isVehicle && (
          <div className="field fg-span"><label>用途（可多选，非互斥）</label>
            <div className="checkbox-row">
              {['生产使用', '售后维修', '单独销售'].map(u => (
                <label key={u}><input type="checkbox" checked={form.uses.includes(u)}
                  onChange={() => setForm(f => ({ ...f, uses: f.uses.includes(u) ? f.uses.filter(x => x !== u) : [...f.uses, u] }))} />{u}</label>
              ))}
            </div></div>
        )}
      </div>
      {lockCode && <div className="warn mt8">该产品已生成 SKU 或建立业务关联，车型和归属编码不可直接修改。</div>}
      <div className="row mt16"><button className="btn primary" onClick={save}>保存</button></div>
    </div>
  );
}

/* ---------------- 技术参数（模板字段自动加载，产品级） ---------------- */
function TechTab({ p, fields, onSaved, notify, onDirtyChange }) {
  const [specs, setSpecs] = useState({ ...p.specs });
  const [version, setVersion] = useState(p.version);
  const dirty=JSON.stringify(specs)!==JSON.stringify(p.specs||{});
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);
  const tplFields = useMemo(() => fields.filter(
    f => f.enabled && f.level === 'product' && (f.templates || []).includes(p.productType)), [fields, p.productType]);
  const others = useMemo(() => fields.filter(
    f => f.enabled && f.level === 'product' && !(f.templates || []).includes(p.productType)
      && p.specs[f.code] !== undefined), [fields, p.productType, p.specs]);

  const save = async () => {
    const missing=tplFields.find(field=>field.required&&!String(specs[field.code]??'').trim());
    if(missing){notify(`请填写${missing.nameZh}`,true);return;}
    try { const updated = await api.updateProduct(p.id, { specs }, version); setVersion(updated.version); onSaved(); }
    catch (e) { notify(e.message, true); }
  };

  const renderField = (f) => (
    <div className="field" key={f.code}>
      <label>{f.nameZh}{f.unit ? `（${f.unit}）` : ''}{f.required && <span className="req">*</span>}</label>
      {f.type === 'enum' ? (
        <select value={specs[f.code] || ''} onChange={e => setSpecs({ ...specs, [f.code]: e.target.value })}>
          <option value="">— 选择 —</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={f.type === 'number' ? 'number' : 'text'} value={specs[f.code] || ''}
          onChange={e => setSpecs({ ...specs, [f.code]: e.target.value })} />
      )}
    </div>
  );

  return (
    <div className="card" style={{ maxWidth: 980 }}>
      <div className="hint mb12" />
      {tplFields.length ? (
        <div className="form-grid">{tplFields.map(renderField)}</div>
      ) : <div className="hint" />}
      {!!others.length && (
        <>
          <div className="section-title">本产品单独启用的字段</div>
          <div className="form-grid">{others.map(renderField)}</div>
        </>
      )}
      <div className="row mt16"><button className="btn primary" onClick={save}>保存技术参数</button></div>
    </div>
  );
}

/* ---------------- SKU 规格（四段式：车型/归属-品类-机动规格-颜色） ---------------- */
function SkuTab({ p, meta, colors, fields, onChanged, notify, onDirtyChange }) {
  const isVehicle = p.kind === 'vehicle';
  const trimField = (meta?.fields || []).find(f => f.code === 'trim_code' && f.enabled !== false);
  const regionField = (meta?.fields || []).find(f => f.code === 'region_code' && f.enabled !== false);
  const trimOptions = isVehicle ? ((trimField?.options || []).filter(v => /^[A-Z0-9]{3}$/.test(v)).length ? trimField.options.filter(v => /^[A-Z0-9]{3}$/.test(v)) : ['ULT','PRO','STD']) : [];
  const regionOptions = isVehicle ? ((regionField?.options || []).filter(v => /^[A-Z0-9]{3}$/.test(v)).length ? regionField.options.filter(v => /^[A-Z0-9]{3}$/.test(v)) : ['EUR','GBR','USA']) : [];
  const specOptions = isVehicle ? trimOptions : skuSpecOptions(fields, p.productType);
  const [skuRegion, setSkuRegion] = useState('EUR');
  const trimNames = { ULT: 'Ultra 旗舰配置', PRO: 'Pro 性能配置', STD: 'Standard 标准配置' };
  const batteryCodeField = (meta?.fields || []).find(f => f.code === 'battery_code');
  const batteryNameField = (meta?.fields || []).find(f => f.code === 'battery_capacity');
  const specText = code => {
    if (isVehicle) return trimNames[code] || code;
    if (!batteryCodeField || !(batteryCodeField.options || []).includes(code)) return code;
    return (batteryNameField?.options || []).find(name => String(name).startsWith(code)) || `${code}Wh 电池`;
  };
  const enabledColors = colors.filter(c => c.enabled);
  const [sel, setSel] = useState({}); // "spec|color" -> price
  const [showColor, setShowColor] = useState(false);
  const [skuDrafts, setSkuDrafts] = useState(() => Object.fromEntries(p.skus.map(s => [s.sku, { ...(s.attributes || {}) }])));
  const [savingSku, setSavingSku] = useState('');
  const attributesDirty=p.skus.some(sku=>{const current=skuDrafts[sku.sku]||{},original=sku.attributes||{};return [...new Set([...Object.keys(current),...Object.keys(original)])].some(code=>String(current[code]??'')!==String(original[code]??''))});
  const dirty=Object.keys(sel).length>0||attributesDirty;
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);

  const skuFields = useMemo(() => fields.filter(
    f => f.enabled && f.level === 'sku' && (f.templates || []).includes(p.productType) && !f.skuGen), [fields, p.productType]);

  const toggle = (spec, color) => setSel(s => {
    const k = `${spec}|${color}${isVehicle?`|${skuRegion}`:''}`;
    const n = { ...s };
    if (k in n) delete n[k]; else n[k] = '';
    return n;
  });

  const generate = async () => {
    const items = Object.entries(sel).map(([k, price]) => {
      const [spec, color, region] = k.split('|');
      return isVehicle ? { spec, color, region: region || skuRegion } : { spec, color, price };
    });
    if (!items.length) { notify('请先在矩阵中勾选要生成的有效组合', true); return; }
    try {
      const r = await api.addSkus(p.id, items);
      setSel({});
      onChanged();
      notify(`已组合生成 ${r.added.length} 个物理物料${r.skipped.length ? `，跳过 ${r.skipped.length} 个重复编码` : ''}${r.skipped.length ? '：' + r.skipped.map(s => s.sku).join('、') : ''}`, r.skipped.length > 0);
    } catch (e) { notify(e.message, true); }
  };

  const removeSku = async (sku) => {
    if (!window.confirm(`确认删除 SKU「${sku}」？已下架或未在售的 SKU 也只有在没有历史业务引用时才能删除。`)) return;
    try { await api.deleteSku(p.id, sku); onChanged(); notify('已删除'); }
    catch (e) {
      if (e.code === 'ENTITY_REFERENCED') {
        const details = (e.references || []).map(ref => `• ${ref.type}：${ref.documentNo}${ref.detail ? `（${ref.detail}）` : ''}`).join('\n');
        notify(`${e.message}${details ? `\n关联记录：\n${details}` : ''}`, true);
      } else notify(e.message, true);
    }
  };

  const saveSkuAttributes = async sku => {
    const attributes=skuDrafts[sku.sku]||{};
    const missing=skuFields.find(field=>field.required&&!String(attributes[field.code]??'').trim());
    if(missing){notify(`请填写${missing.nameZh}`,true);return;}
    setSavingSku(sku.sku);
    try { const result=await api.updateSkuAttributes(p.id,sku.sku,attributes); setSkuDrafts(current=>({...current,[sku.sku]:result.attributes})); await onChanged(); notify('SKU 参数已保存'); }
    catch(e) { notify(e.message,true); }
    finally { setSavingSku(''); }
  };

  return (
    <div>
      <div className="card mb12">
        <div className="row mb12">
          <div className="section-title grow" style={{ margin: 0 }}>生成新 SKU</div>
          <span className="hint" />
          <button className="btn" onClick={() => setShowColor(true)}>新增颜色</button>
        </div>
        <div className="hint mb12" />
        {isVehicle&&<div className="row mb12" style={{alignItems:'center',gap:8}}>
          <span className="hint" />
          <select value={skuRegion} onChange={e=>{setSkuRegion(e.target.value);setSel({})}} style={{width:160}}>
            {regionOptions.map(region=><option key={region} value={region}>{region}</option>)}
          </select>
          <span className="hint" />
        </div>}
        <div className="sku-matrix">
          <table className="table matrix-table" style={{ width: 'auto' }}>
            <thead><tr><th>{isVehicle?'配置版本 \\ 颜色':'规格 \\ 颜色'}</th>
              {enabledColors.map(c => <th key={c.code}><span className="color-dot" style={{ background: c.hex }} />{c.code}<div className="hint" /></th>)}
            </tr></thead>
            <tbody>
              {specOptions.map(spec => (
                <tr key={spec}>
                  <td style={{ fontFamily: 'Consolas, monospace', fontWeight: 600 }}>{spec}</td>
                  {enabledColors.map(c => {
                    const k = `${spec}|${c.code}${isVehicle?`|${skuRegion}`:''}`;
                    const on = k in sel;
                    return (
                      <td key={c.code} onClick={() => toggle(spec, c.code)}
                        style={{ cursor: 'pointer', background: on ? 'var(--accent-soft)' : undefined }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(spec, c.code)} />
                        <div className="sku-preview mt8">{isVehicle?buildVehicleSku(p.model,spec,c.code,skuRegion):`${p.ownership}-${p.productType}-${spec}-${c.code}`}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <div className="hint mb12" />
            <div style={{ maxHeight: 180, overflow: 'auto' }}>
              {Object.entries(sel).map(([k, price]) => {
                const [spec, color, region] = k.split('|');
                return (
                  <div className="row mb12" key={k}>
                    <span className="sku-preview">{isVehicle?buildVehicleSku(p.model,spec,color,region||skuRegion):`${p.ownership}-${p.productType}-${spec}-${color}`}</span>
                    {!isVehicle && <input type="text" placeholder="价格（可选）" value={price} style={{ width: 110, height: 26 }}
                      onChange={e => setSel(s => ({ ...s, [k]: e.target.value }))} />}
                  </div>
                );
              })}
            </div>
            <button className="btn accent mt8" onClick={generate} disabled={!Object.keys(sel).length}>生成所选 SKU</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>已建立的 SKU（{p.skus.length}）</div>
        {p.skus.length ? (
          <table className="table">
            <thead><tr><th>SKU 编码</th><th>{isVehicle?'机动规格':'规格'}</th><th>颜色</th>{!isVehicle&&<th>价格</th>}<th>备注</th>{skuFields.map(field=><th key={field.code}>{field.nameZh}{field.unit?`（${field.unit}）`:''}{field.required?' *':''}</th>)}{skuFields.length>0&&<th>参数操作</th>}<th style={{ width: 90 }}>操作</th></tr></thead>
            <tbody>
              {p.skus.map(s => (
                <tr key={s.sku}>
                  <td style={{ fontFamily: 'Consolas, monospace' }}>{s.sku}</td>
                  <td>{specText(s.spec)}</td>
                  <td>
                    <span className="color-dot" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: (colors.find(c => c.code === s.color) || {}).hex || '#ccc', border: '1px solid rgba(0,0,0,.15)', marginRight: 6 }} />
                    {s.color}
                  </td>
                  {!isVehicle&&<td>{s.price || '—'}</td>}
                  <td className="hint" />
                  {skuFields.map(field=>{const value=skuDrafts[s.sku]?.[field.code]??'';return <td key={field.code}>{field.type==='enum'?<select disabled={!!savingSku} value={value} onChange={e=>setSkuDrafts(current=>({...current,[s.sku]:{...(current[s.sku]||{}),[field.code]:e.target.value}}))}><option value="">—</option>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input disabled={!!savingSku} type={field.type==='number'?'number':'text'} value={value} onChange={e=>setSkuDrafts(current=>({...current,[s.sku]:{...(current[s.sku]||{}),[field.code]:e.target.value}}))}/>}</td>})}
                  {skuFields.length>0&&<td><button className="btn small" disabled={!!savingSku} onClick={()=>saveSkuAttributes(s)}>{savingSku===s.sku?'保存中…':'保存参数'}</button></td>}
                  <td><button className="btn small danger" onClick={() => removeSku(s.sku)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="hint" />}
      </div>

      {showColor && <ColorDictDialog quickMode onClose={() => setShowColor(false)} onChanged={onChanged} />}
    </div>
  );
}

/* ---------------- BOM（第一阶段：物料行 + 版本；引用零配件库 SKU，不重复建档） ---------------- */
export function BomTab({ p, meta, onChanged, notify, onDirtyChange }) {
  const [parts, setParts] = useState([]);
  const defaultBomVersion = `BOM-${p.model || p.ownership || 'MODEL'}-V1.0`;
  const [bom, setBom] = useState({ version: p.bom.version || defaultBomVersion, items: (p.bom.items || []).map(x => ({ ...x })) });
  const [bomBaseline,setBomBaseline]=useState(()=>JSON.stringify({version:p.bom.version||defaultBomVersion,items:(p.bom.items||[]).map(x=>({...x}))}));
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [savedDraft, setSavedDraft] = useState('');
  const [drawingId, setDrawingId] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const versionLoadRef = useRef(0);
  const dirty=JSON.stringify(bom)!==(savedDraft||bomBaseline);
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);

  useEffect(() => { api.products('part').then(setParts); }, []);
  useEffect(() => { api.bomVersions(p.id).then(setVersions).catch(e => notify(e.message, true)); }, [p.id]);
  const loadVersion = async (version) => { const request=++versionLoadRef.current;setSelectedVersion(version);setSavedDraft('');if(!version)return;try{const historical=await api.bomVersion(p.id,version);if(request!==versionLoadRef.current)return;const loaded={version:historical.status==='draft'?historical.version:'',draftRevision:historical.status==='draft'?historical.draftRevision:undefined,changeReason:historical.changeReason,effectiveAt:historical.effectiveAt,items:historical.items.map(x=>({...x}))};const snapshot=JSON.stringify(loaded);setBom(loaded);setBomBaseline(snapshot);if(historical.status==='draft')setSavedDraft(snapshot);notify(historical.status==='draft'?'已载入草稿，可直接修改':'已载入历史版本，请填写新的版本号后保存');}catch(e){if(request===versionLoadRef.current)notify(e.message,true);} };
  const publish = async () => {
    if(!savedDraft || bom.version!==selectedVersion){notify('请先载入草稿',true);return;}
    if(JSON.stringify(bom)!==savedDraft){notify('请先保存草稿后再发布',true);return;}
    try { await api.publishBom(p.id,selectedVersion,bom.draftRevision); }
    catch(e) { notify(e.message,true); return; }
    setVersions(current=>current.map(version=>version.version===selectedVersion?{...version,status:'published'}:version));
    setSelectedVersion('');
    setSavedDraft('');
    setBom(current=>({...current,version:'',draftRevision:undefined}));
    try { setVersions(await api.bomVersions(p.id)); notify('BOM 已发布'); }
    catch(e) { notify(`BOM 已发布，但版本列表刷新失败：${e.message}`,true); }
  };

  const partSkuOptions = useMemo(() => parts.flatMap(x => x.skus.map(s => ({ sku: s.sku, name: x.name }))), [parts]);

  const addItem = () => setBom(b => ({ ...b, items: [...b.items, {
    id: 'b-' + Date.now() + '-' + b.items.length, section: meta.bomSections[0],
    drawingNo: '', sku: '', qty: 1, unit: '件', position: '', supplier: '', specRequirement: '', keyControl: false,
  }] }));
  const upd = (i, k, v) => setBom(b => ({ ...b, items: b.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const del = (i) => { if(bom.items.some(x=>String(x.parentItemId||'')===String(bom.items[i].id))) { notify('请先删除或调整下级物料',true); return; } setBom(b => ({ ...b, items: b.items.filter((_, j) => j !== i) })); };

  const save = async () => {
    if (!bom.version.trim()) { notify('请填写新的 BOM 版本号', true); return; }
    const missing = bom.items.filter(it => !it.sku || !it.drawingNo);
    if (missing.length) { notify('每个 BOM 项目必须填写图纸编号并引用零配件库 SKU', true); return; }
    let saved;
    try { saved=await api.saveBom(p.id, bom); }
    catch (e) { notify(e.message, true); return; }
    const nextBom=saved;
    const snapshot=JSON.stringify(nextBom);
    setBom(nextBom);
    setBomBaseline(snapshot);
    setSavedDraft(snapshot);
    setSelectedVersion(saved.version);
    setVersions(current=>current.some(version=>version.version===saved.version)
      ?current.map(version=>version.version===saved.version?{...version,status:'draft',draftRevision:nextBom.draftRevision}:version)
      :[{version:saved.version,status:'draft',draftRevision:nextBom.draftRevision},...current]);
    onChanged();
    try { setVersions(await api.bomVersions(p.id)); notify('BOM 已保存（版本 ' + saved.version + '）'); }
    catch (e) { notify(`BOM 已保存（版本 ${saved.version}），但版本列表刷新失败：${e.message}`,true); }
  };

  return (
    <div className="card">
      <div className="row mb12"><label htmlFor={`bom-history-${p.id}`}>历史版本</label><select id={`bom-history-${p.id}`} value={selectedVersion} onChange={e=>{const value=e.target.value;if(dirty&&value!==selectedVersion&&!window.confirm('BOM 有未保存修改，载入历史版本会丢失当前内容。确定继续吗？'))return;loadVersion(value)}}><option value="">选择历史版本</option>{versions.map(v=><option key={v.version} value={v.version}>{v.version} · {v.status}</option>)}</select><span className="hint" /></div>
      {versions.find(v=>v.version===selectedVersion)?.status==='draft' && <button type="button" className="btn primary mb12" onClick={publish}>发布所选版本</button>}
      <div className="row mb12">
        <div className="field" style={{ width: 220 }}>
          <label>BOM 版本号</label>
          <input value={bom.version} disabled={bom.draftRevision != null} onChange={e => setBom({ ...bom, version: e.target.value })} />
        </div>
        <span className="hint grow" style={{ alignSelf: 'flex-end' }} />
        {bom.draftRevision != null && <button type="button" className="btn" onClick={()=>{setBom({...bom,version:'',draftRevision:undefined});setSelectedVersion('');setSavedDraft('')}}>复制为新版本</button>}
        <button className="btn" onClick={addItem}>添加物料行</button>
        <button className="btn accent" onClick={save}>保存 BOM</button>
      </div>
      {bom.items.length ? (
        <table className="table">
          <thead><tr>
            <th>上级物料</th><th>系统模块</th><th>零部件号</th><th>物料 SKU（引用零配件库）</th><th>物料名称</th><th>规格要求</th><th>用量</th><th>单位</th><th>安装位置</th><th>供应商</th><th>关键管控件</th><th></th>
          </tr></thead>
          <tbody>
            {bom.items.map((it, i) => {
              const info = partSkuOptions.find(o => o.sku === it.sku);
              return (
                <tr key={it.id || i} id={'bom-row-'+it.id} onClick={()=>{setSelectedItem(String(it.id));if(it.drawingMediaId)setDrawingId(it.drawingMediaId)}} style={String(it.id)===selectedItem?{background:'var(--acc-soft)'}:undefined}>
                  <td><select value={it.parentItemId||''} onChange={e=>upd(i,'parentItemId',e.target.value||null)} style={{height:28,maxWidth:150}}><option value="">整车顶层</option>{bom.items.filter(x=>String(x.id)!==String(it.id)).map(x=><option key={x.id} value={x.id}>{x.drawingNo||'未填写图号'} · {x.sku||'未选 SKU'}</option>)}</select></td>
                  <td>
                    <select value={it.section} onChange={e => upd(i, 'section', e.target.value)} style={{ height: 28 }}>
                      {meta.bomSections.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input value={it.drawingNo} placeholder="如 D-001" style={{ width: 90, height: 28 }}
                    onChange={e => upd(i, 'drawingNo', e.target.value.toUpperCase())} /></td>
                  <td>
                    <select value={it.sku} onChange={e => upd(i, 'sku', e.target.value)} style={{ width: 200, height: 28, fontFamily: 'Consolas, monospace' }}>
                      <option value="">— 选择零配件 SKU —</option>
                      {partSkuOptions.map(o => <option key={o.sku} value={o.sku}>{o.sku}</option>)}
                    </select>
                  </td>
                  <td className="hint" />
                  <td><input value={it.specRequirement||''} placeholder="如 T700 碳布 / 36V 10Ah" style={{ width: 150, height: 28 }} onChange={e => upd(i, 'specRequirement', e.target.value)} /></td>
                  <td><input type="number" min="0.01" step="any" value={it.qty} style={{ width: 60, height: 28 }} onChange={e => upd(i, 'qty', Number(e.target.value))} /></td>
                  <td><input value={it.unit} style={{ width: 60, height: 28 }} onChange={e => upd(i, 'unit', e.target.value)} /></td>
                  <td><input value={it.position} placeholder="如 座管内" style={{ width: 120, height: 28 }} onChange={e => upd(i, 'position', e.target.value)} /></td>
                  <td><input value={it.supplier||''} placeholder="供应商" style={{ width: 110, height: 28 }} onChange={e => upd(i, 'supplier', e.target.value)} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={Boolean(it.keyControl)} onChange={e => upd(i, 'keyControl', e.target.checked)} aria-label="关键管控件" /></td>
                  <td><button className="btn small danger" onClick={() => del(i)}>删除</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="hint" />
      )}
      <div className="card mt16"><h3>图纸位置</h3><p className="hint" /><div className="row"><select value={drawingId} onChange={e=>setDrawingId(e.target.value)}><option value="">选择整车图纸</option>{(p.images||[]).map(x=><option key={x.id} value={x.id}>{x.label||'未命名图纸'}</option>)}</select>{selectedItem&&<button className="btn small" type="button" onClick={()=>setBom(b=>({...b,items:b.items.map(x=>String(x.id)===selectedItem?{...x,drawingMediaId:null,drawingX:null,drawingY:null}:x)}))}>清除所选物料标记</button>}</div>{drawingId&&<div style={{position:'relative',display:'inline-block',maxWidth:'100%',marginTop:12,lineHeight:0}} onClick={e=>{if(!selectedItem){notify('请先选择物料行',true);return}const box=e.currentTarget.getBoundingClientRect();const x=Math.max(0,Math.min(1,(e.clientX-box.left)/box.width)),y=Math.max(0,Math.min(1,(e.clientY-box.top)/box.height));setBom(b=>({...b,items:b.items.map(it=>String(it.id)===selectedItem?{...it,drawingMediaId:drawingId,drawingX:x,drawingY:y}:it)}))}}><CloudImage src={`/api/products/${encodeURIComponent(p.id)}/media/${encodeURIComponent(drawingId)}`} alt="整车工程图" height={600} />{bom.items.filter(x=>x.drawingMediaId===drawingId&&x.drawingX!=null&&x.drawingY!=null).map(x=><button type="button" key={x.id} title={x.sku||x.drawingNo} onClick={e=>{e.stopPropagation();setSelectedItem(String(x.id));document.getElementById('bom-row-'+x.id)?.scrollIntoView({block:'center',behavior:'smooth'})}} className={'bom-drawing-marker' + (String(x.id)===selectedItem?' is-selected':'')} style={{position:'absolute',left:`${Number(x.drawingX)*100}%`,top:`${Number(x.drawingY)*100}%`,transform:'translate(-50%,-50%)',minWidth:28,height:28,lineHeight:'20px',cursor:'pointer'}}>{x.drawingNo||'•'}</button>)}</div>}</div>
    </div>
  );
}

/* ---------------- 适配关系（独立于 SKU 编码维护，规范第 8 章） ---------------- */
function FitTab({ p, onChanged, notify, onDirtyChange }) {
  const [vehicles, setVehicles] = useState([]);
  const [fits, setFits] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(p.version);
  const normalize=fits=>fits.map(f=>{const vehicle=vehicles.find(v=>v.id===f.vehicleId);return{vehicleId:f.vehicleId||'',vehicleUuid:f.vehicleUuid||vehicle?.entityUuid||'',vehicleModel:f.vehicleModel||vehicle?.model||'',note:f.note||''}});
  const dirty=loaded&&JSON.stringify(normalize(fits))!==JSON.stringify(normalize(resolveFitments(p.fitments||[],vehicles)));
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);
  useEffect(() => { let active = true; api.products('vehicle').then(rows => { if (active) { setVehicles(rows); setFits(resolveFitments(p.fitments || [], rows)); setLoaded(true); } }).catch(e => notify(e.message, true)); return () => { active = false; }; }, [p.id]);
  const has = id => fits.some(f => f.vehicleId === id);
  const toggle = v => setFits(fs => fs.some(f => f.vehicleId === v.id) ? fs.filter(f => f.vehicleId !== v.id) : [...fs, { vehicleId: v.id, note: '' }]);
  const update = (index, patch) => setFits(fs => fs.map((f, i) => i === index ? { ...f, ...patch } : f));
  const save = async () => {
    if (!loaded) return;
    const error = fitmentError(fits, vehicles); if (error) { notify(error, true); return; }
    try { const updated = await api.updateProduct(p.id, { fitments: fitmentPayload(fits, vehicles) }, version); setVersion(updated.version); onChanged(); notify('适配关系已保存'); } catch (e) { notify(e.message, true); }
  };
  return <div className="card" style={{ maxWidth: 760 }}><p className="hint" />
    {vehicles.length ? <table className="table"><thead><tr><th>适配</th><th>车型</th><th>整车产品</th><th>适配说明</th></tr></thead><tbody>{vehicles.map(v => {
      const index = fits.findIndex(f => f.vehicleId === v.id);
      return <tr key={v.id}><td><input type="checkbox" checked={has(v.id)} onChange={() => toggle(v)} /></td><td>{v.model}</td><td>{v.name}</td><td>{index >= 0 ? <input value={fits[index].note || ''} onChange={e => update(index, { note: e.target.value })} /> : '—'}</td></tr>;
    })}</tbody></table> : <div className="hint" />}
    {fits.map((f, i) => !f.vehicleId && <div className="row mt16" key={i}><span>待确认：{f.vehicleModel || '未知车型'}</span><select value="" onChange={e => update(i, { vehicleId: e.target.value })}><option value="">选择实际整车</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.model} · {v.name}</option>)}</select><button className="btn small" onClick={() => setFits(fs => fs.filter((_, n) => n !== i))}>移除</button></div>)}
    <div className="row mt16"><button className="btn primary" disabled={!loaded} onClick={save}>保存适配关系</button></div></div>;
}

/* ---------------- 素材（统一素材库：产品 / 配件 ↔ 素材关联） ---------------- */
function AssetTab({ p, notify }) {
  const isVehicle = p.kind === 'vehicle';
  const targetType = isVehicle ? 'product' : 'part';
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.assets({ targetType, targetId: p.id, channel: 'product', pageSize: 100 });
      const items = data.items || [];
      const detailed = await Promise.all(items.map(item => api.asset(item.id).catch(() => ({ ...item, links: [] }))));
      setRows(detailed); setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [targetType, p.id]);
  useEffect(() => { load(); }, [load]);

  const upload = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {
      const isImage = /^image\//.test(file.type);
      const asset = await api.uploadAsset(file, {
        category: 'product',
        folder: `${p.name || p.model || '未命名'}/其他`,
        label: file.name.replace(/\.[^.]+$/, '').slice(0, 200),
        visibility: isImage ? 'public' : 'internal',
        status: 'draft',
      });
      // 相同文件重复上传时服务端返回已有素材（reused），再关联可能因已存在而返回 409；
      // 这两种情况都属于幂等成功，不应当作错误提示。
      let alreadyLinked = false;
      try {
        await api.addAssetLink(asset.id, { targetType, targetId: p.id, role: 'gallery', channel: 'product', sortOrder: rows.length });
      } catch (error) {
        if (error.status !== 409) throw error;
        alreadyLinked = true;
      }
      if (alreadyLinked) notify(asset.reused ? '该素材已存在，且已在当前产品下，无需重复上传' : '素材已上传，且已在当前产品下');
      else notify(asset.reused ? '素材已存在，已复用并关联到当前产品' : '素材已上传并关联');
      await load();
    } catch (e) {
      if (e.status === 409) notify('相同文件已存在，请直接在下方列表中选用', true);
      else { setError(e.message); notify(e.message, true); }
    }
    finally { setBusy(false); }
  };

  const productLinkOf = asset => (asset.links || []).find(link => link.targetType === targetType && link.targetId === p.id && link.channel === 'product');
  const unlinkProduct = async asset => {
    const link = productLinkOf(asset);
    if (!link) { setError('未找到关联记录'); return; }
    if (!window.confirm('解除该素材与当前产品的关联？素材本身仍保留在素材库。')) return;
    try { await api.removeAssetLink(link.id); notify('已解除关联'); await load(); }
    catch (e) { setError(e.message); }
  };
  const linkSku = async (asset, code) => {
    if (!code) return;
    try { await api.addAssetLink(asset.id, { targetType: 'sku', targetId: code, role: 'hero', channel: 'product' }); notify(`已关联到 SKU ${code}`); await load(); }
    catch (e) { if (e.status === 409) notify('该素材已关联到该 SKU，无需重复关联'); else setError(e.message); }
  };
  const unlinkSku = async linkId => {
    try { await api.removeAssetLink(linkId); notify('已解除 SKU 关联'); await load(); }
    catch (e) { setError(e.message); }
  };

  return <div className="card">
    <div className="row mb12" style={{ alignItems: 'center', gap: 8 }}>
      <div className="grow">
        <h3 style={{ margin: 0 }}>产品素材</h3>
        <p className="hint" />
      </div>
      <button type="button" className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? '上传中…' : '上传素材'}</button>
      <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,application/pdf" onChange={upload} />
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {loading && !rows.length ? <p className="hint" /> : !rows.length ? <p className="hint" /> : <div className="shop-pickgrid">
      {rows.map(asset => {
        const skuLinks = (asset.links || []).filter(link => link.targetType === 'sku');
        return <div key={asset.id} className="shop-pickgrid__item" style={{ cursor: 'default' }}>
          {asset.kind === 'image'
            ? <img className="shop-pickgrid__thumb" src={api.assetUrl(asset.id)} alt={asset.label || asset.fileName || '素材'} loading="lazy" />
            : <div className="shop-pickgrid__thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-sub)' }}>{asset.kind === 'video' ? '视频' : '文档'}</div>}
          <div className="shop-pickgrid__name" title={asset.fileName}>{asset.label || asset.fileName || '未命名素材'}</div>
          {skuLinks.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
            {skuLinks.map(link => <span key={link.id} className="tag">{link.targetId}<button type="button" className="btn small" style={{ padding: '0 4px', marginLeft: 4 }} onClick={() => unlinkSku(link.id)}>×</button></span>)}
          </div>}
          <select value="" onChange={e => { const code = e.target.value; e.target.value = ''; linkSku(asset, code); }}>
            <option value="">关联到 SKU…</option>
            {(p.skus || []).map(sku => <option key={sku.sku} value={sku.sku}>{sku.sku}</option>)}
          </select>
          <button type="button" className="btn small" onClick={() => unlinkProduct(asset)}>解除产品关联</button>
        </div>;
      })}
    </div>}
  </div>;
}

/* ---------------- 图片资料 ---------------- */
export function ImagesTab({ p, onChanged, notify }) {
  const [busy,setBusy]=useState(false);
  const upload=async e=>{const input=e.currentTarget;const file=input.files?.[0];if(!file)return;setBusy(true);try{await api.uploadMedia(p.id,file);await onChanged();notify('图片已上传');}catch(err){notify(err.message,true);}finally{setBusy(false);input.value='';}};
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <div className="row"><div className="hint grow" /><label className="btn primary">{busy?'上传中…':'上传图片'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload} disabled={busy} hidden /></label></div>
      <div className="grid mt16">{(p.images||[]).filter(image=>/^image\//.test(image.contentType||'')).map(image=><div key={image.id||image.key} className="card"><CloudImage src={`/api/products/${encodeURIComponent(p.id)}/media/${encodeURIComponent(image.id)}`} alt={image.label||'产品图片'} height={220} /><div className="mono">{image.label||'产品图片'}</div></div>)}</div>
    </div>
  );
}

export default EditorPage;
