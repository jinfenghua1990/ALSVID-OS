import RepairFinance from './RepairFinance.jsx';
import WarrantyAssessment from './WarrantyAssessment.jsx';
import WarrantyPanel from './WarrantyPanel.jsx';
import ServiceCentersPage from './ServiceCentersPage.jsx';
import { resolveFitments, fitmentError, fitmentPayload } from '../fitments.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {uuidv7} from '../uuidv7.js';
import { api } from '../api.js';

const blankVin = { vin: '', model: '', sku: '', orderNo: '', factory: '', batch: '', bomVersion: '', installed: '', serials: '', producedAt: '', status: '在用' };
const blankRepair = { vin: '', type: '质保维修', fault: '', sku: '', qty: 1, store: '', serviceCenterId: '', status: '待收货', oldPart: '' };
const blankSub = { originalSku: '', replacementSku: '', reason: '', effectiveAt: '', status: '启用', note: '' };

export function ServicePage({ active = true, section = 'vin', onSectionChange, user }) {
  const admin = user.role === 'admin';
  const filterKey=`alsvid-v2-service-filter:${user.username||user.role}:${section}`;
  const [vins, setVins] = useState([]); const [repairs, setRepairs] = useState([]); const [subs, setSubs] = useState([]); const [products, setProducts] = useState([]);
  const [serviceCenters, setServiceCenters] = useState([]);
  const [q, setQ] = useState(()=>{try{const saved=localStorage.getItem(filterKey);if(saved!==null)return saved}catch{}try{return sessionStorage.getItem(filterKey)||''}catch{return ''}}); const [form, setForm] = useState(null); const [err, setErr] = useState('');
  const [vinResults, setVinResults] = useState(null); const [vinSearchError,setVinSearchError]=useState(''); const [vinSearchAttempt,setVinSearchAttempt]=useState(0);
  const [listsReady,setListsReady]=useState(false);
  const reloadVersion = useRef(0);
  const submitBusy = useRef(false);
  useEffect(()=>{try{localStorage.setItem(filterKey,q)}catch{}try{sessionStorage.setItem(filterKey,q)}catch{}},[filterKey,q]);
  const reload = async () => {
    const version = ++reloadVersion.current;
    setListsReady(false);
    try {
      const [v, r, s, p, centers] = await Promise.all([api.vins(), api.repairs(), api.substitutes(), api.products(), api.serviceCenters()]);
      if (version !== reloadVersion.current) return;
      setVins(v); setRepairs(r); setSubs(s); setProducts(p); setServiceCenters(centers); setListsReady(true); return {repairs:r};
    } catch (error) {
      if (version === reloadVersion.current) throw error;
    }
  };
  const retryReload=async()=>{setErr('');try{await reload()}catch(error){setErr(error.message)}};
  const refreshFitments=async()=>{try{await reload()}catch(error){setErr(`适配关系保存后，产品资料刷新失败：${error.message}`)}};
  const reconcileFitments=async writeError=>{try{await reload();setErr(`适配保存请求返回错误：${writeError}。已重新读取产品资料，请核对当前状态。`)}catch(error){setErr(`${writeError}；产品资料读取失败：${error.message}`)}};
  useEffect(() => {
    if (!active || section === 'centers') return;
    let requestActive = true;
    reload().catch(error => { if (requestActive) setErr(error.message); });
    setErr('');
    return () => { requestActive = false; reloadVersion.current++; };
  }, [section, active]);
  useEffect(() => { let active=true; if(section!=='vin'||!q.trim()){setVinResults(null);setVinSearchError('');return ()=>{active=false};} setVinResults([]);setVinSearchError('');const timer=setTimeout(()=>api.vins(q.trim()).then(rows=>{if(active)setVinResults(rows)}).catch(e=>{if(active)setVinSearchError(e.message)}),250);return ()=>{active=false;clearTimeout(timer)}; }, [q,section,vinSearchAttempt]);
  const parts = useMemo(() => products.filter(p => p.kind === 'part'), [products]); const vehicles = useMemo(() => products.filter(p => p.kind === 'vehicle'), [products]);
  const skuOptions = parts.flatMap(p => p.skus.map(s => ({ sku: s.sku, name: p.name })));
  const list = section === 'vin' ? vins : section === 'repair' ? repairs : section === 'substitute' ? subs : parts;
  const visible = useMemo(() => { const term = q.trim().toLowerCase(); if (!term) return list; if(section==='vin')return vinResults||[]; return list.filter(x => JSON.stringify(x).toLowerCase().includes(term)); }, [list, q, section, vinResults]);
  if (section === 'centers') return <ServiceCentersPage active={active} user={user} onSectionChange={onSectionChange} />;
  const submit = async () => {
    if(!listsReady||submitBusy.current)return;
    submitBusy.current=true;
    setErr('');setListsReady(false);
    try {
      try {
        if (section === 'vin') await (form.id ? api.updateVin(form.id, form) : api.createVin(form));
        if (section === 'repair') await (form.id ? api.updateRepair(form.id, form) : api.createRepair(form));
        if (section === 'substitute') await api.createSubstitute(form);
      } catch (e) { setErr(e.message);try{await reload()}catch(refreshError){setErr(`${e.message}；列表读取失败：${refreshError.message}`)}return; }
      setForm(null);
      try { await reload(); }
      catch (e) { setErr(`资料已保存，但列表刷新失败，请重新加载页面：${e.message}`); }
    } finally { submitBusy.current=false; }
  };
  const updateStatus = async (kind, id, status) => {
    if(!listsReady)return;
    setErr('');setListsReady(false);
    try {
      if (kind === 'vin') await api.updateVin(id, { status });
      else if (kind === 'repair') await api.updateRepair(id, { status });
      else await api.updateSubstitute(id, { status });
    } catch (e) { setErr(e.message);try{await reload()}catch(refreshError){setErr(`${e.message}；列表读取失败：${refreshError.message}`)}return; }
    try { await reload(); }
    catch (e) { setErr(`状态已更新，但列表刷新失败，请重新加载页面：${e.message}`); }
  };
  const finishRepair = async () => {
    setErr('');setForm(null);
    try { await reload(); }
    catch (e) { setErr(`维修操作已完成，但资料刷新失败，请重新加载页面：${e.message}`); }
  };
  const reconcileRepair=async(id,writeError)=>{try{const current=await reload();const row=current?.repairs.find(item=>item.id===id);if(row)setForm(row);setErr(writeError)}catch(e){setErr(`${writeError}；维修工单读取失败：${e.message}`)}};
  const title = { vin: 'VIN 车辆档案', repair: '维修工单', fit: '配件适配', substitute: '配件替代' }[section];
  return <div className="service-page">
    <div className="page-title"><div><h2 /><span className="hint" /></div>{admin && section !== 'fit' && <button className="btn accent" disabled={!listsReady} onClick={() => setForm(section === 'vin' ? { ...blankVin } : section === 'repair' ? { ...blankRepair } : { ...blankSub })}>新增{section === 'vin' ? '车辆档案' : section === 'repair' ? '维修工单' : '替代关系'}</button>}</div>
    {!listsReady&&!err&&<p className="hint" />}<div className="tabs service-tabs">{[['vin','VIN 车辆档案'],['repair','维修工单'],['fit','配件适配'],['substitute','配件替代'],['centers','服务网点']].map(([k, label]) => <button key={k} className={'tab' + (section === k ? ' active' : '')} onClick={() => onSectionChange(k)}>{label}</button>)}</div>
    {admin && form && <FormPanel section={section} form={form} setForm={setForm} products={products} vins={vins} skuOptions={skuOptions} serviceCenters={serviceCenters} ready={listsReady} onReload={retryReload} onSubmit={submit} onClose={() => setForm(null)} error={err} />}
    {section === 'vin' && form?.id && <div className="card form-panel"><div className="section-title">关联维修记录</div>{repairs.filter(r => r.vin === form.vin).length ? <ul>{repairs.filter(r => r.vin === form.vin).map(r => <li key={r.id}>{r.no} · {r.fault} · {r.status} · {new Date(r.createdAt).toLocaleString('zh-CN')}</li>)}</ul> : <span className="hint" />}</div>}
    {listsReady && section === 'vin' && form?.id && <WarrantyPanel key={'warranty-'+form.id} vinId={form.id} canEdit={admin} />}
    {listsReady && admin && section === 'vin' && form?.id && <InstalledParts key={form.id} vinId={form.id} skuOptions={skuOptions} />}
    {section === 'vin' && form?.id && <ReplacementHistory key={'history-'+form.id} vinId={form.id} />}
    {listsReady && section === 'repair' && form?.id && vins.find(v=>v.vin===form.vin) && <WarrantyAssessment key={'assessment-'+form.id} repairId={form.id} vinId={vins.find(v=>v.vin===form.vin).id} canEdit={admin} />}
    {listsReady && admin && section === 'repair' && form?.id && <RepairStock key={form.id} repair={form} />}
    {listsReady && admin && section === 'repair' && form?.id && <RepairFinance key={'finance-'+form.id} repair={form} />}
    {listsReady && admin && section === 'repair' && form?.id && form.status==='维修中' && (form.sku ? <CompleteRepair key={'complete-'+form.id} repair={form} vin={vins.find(v=>v.vin===form.vin)} onDone={finishRepair} onReconcile={e=>reconcileRepair(form.id,e)} /> : <CompleteService key={'complete-service-'+form.id} repair={form} onDone={finishRepair} onReconcile={e=>reconcileRepair(form.id,e)} />)}
    {listsReady && admin && section === 'repair' && form?.id && form.sku && ['已完成','已关闭'].includes(form.status) && <OldPartRecovery key={'old-'+form.id} repairId={form.id} />}
    {!form && section !== 'fit' && <div className="toolbar"><input type="text" placeholder={section==='vin'?'搜索 VIN / 配件 SKU / 批次 / 序列号…':'搜索 VIN / 工单 / SKU / 状态…'} value={q} onChange={e => setQ(e.target.value)} style={{ width: 300 }} /><span className="hint" /></div>}
    {section==='vin'&&vinSearchError&&<p className="error-text">VIN 搜索失败：{vinSearchError} <button type="button" className="btn small" onClick={()=>setVinSearchAttempt(value=>value+1)}>重试搜索</button></p>}
    {section === 'vin' && <VinTable rows={visible} canEdit={admin&&listsReady} onEdit={row => { setErr(''); setForm({ ...row }); }} onUpdate={(id, status) => updateStatus('vin', id, status)} />}
    {section === 'repair' && <RepairTable rows={visible} canEdit={admin&&listsReady} onEdit={row => { setErr(''); setForm({ ...row }); }} onUpdate={(id, status) => updateStatus('repair', id, status)} />}
    {!form && err && <p className="error-text">{err} <button type="button" className="btn small" onClick={retryReload}>重新读取售后资料</button></p>}
    {section === 'substitute' && <SubTable rows={visible} canEdit={admin&&listsReady} onUpdate={(id, status) => updateStatus('substitute', id, status)} />}
    {section === 'fit' && (admin && listsReady ? <FitManager parts={parts} vehicles={vehicles} onSaved={refreshFitments} onReconcile={reconcileFitments} /> : <p className="hint" />)}
  </div>;
}

function InstalledParts({vinId,skuOptions}) {
  const [items,setItems]=useState([]),[message,setMessage]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[ready,setReady]=useState(false),[needsRefresh,setNeedsRefresh]=useState(true),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const loadSequence=useRef(0);
  const reload=async()=>{const sequence=++loadSequence.current;setNeedsRefresh(true);setLoading(true);setLoadError('');try{const trace=await api.vinTrace(vinId);if(sequence!==loadSequence.current)return;setItems(trace.installed||[]);setReady(true);setNeedsRefresh(false)}catch(e){if(sequence===loadSequence.current)setLoadError(e.message);throw e}finally{if(sequence===loadSequence.current)setLoading(false)}};
  useEffect(()=>{reload().catch(()=>{});return()=>{loadSequence.current++}},[vinId]);
  const update=(i,key,value)=>setItems(xs=>xs.map((x,j)=>i===j?{...x,[key]:value}:x));
  const save=async()=>{if(busy||needsRefresh||!ready)return;setBusy(true);setNeedsRefresh(true);setError('');setMessage('');try{await api.replaceInstalled(vinId,items)}catch(e){setError(e.message);try{await reload()}catch(refreshError){setError(`${e.message}；装车明细读取失败：${refreshError.message}`)}finally{setBusy(false)}return}try{await reload();setMessage('实际装车明细已保存')}catch(e){setError(`实际装车明细已保存，但读取结果失败：${e.message}`)}finally{setBusy(false)}};
  const retry=()=>{setError('');reload().catch(e=>setLoadError(e.message))};
  return <div className="card form-panel"><div className="section-title">实际装车明细</div><p className="hint" />{loading&&<p className="hint" />}{loadError&&<p className="error-text" role="alert">读取实际装车明细失败：{loadError} <button type="button" className="btn small" disabled={loading||busy} onClick={retry}>重试读取</button></p>}{ready&&<><table className="table"><thead><tr><th>配件 SKU</th><th>数量</th><th>批次</th><th>序列号</th><th>偏差原因</th><th>批准人</th><th></th></tr></thead><tbody>{items.map((it,i)=><tr key={i}><td><select disabled={busy||needsRefresh} value={it.sku||''} onChange={e=>update(i,'sku',e.target.value)}><option value="">选择配件</option>{skuOptions.map(x=><option key={x.sku} value={x.sku}>{x.sku} · {x.name}</option>)}</select></td><td><input disabled={busy||needsRefresh} type="number" min="0.01" step="any" value={it.qty??1} onChange={e=>update(i,'qty',e.target.value)} style={{width:70}} /></td><td><input disabled={busy||needsRefresh} value={it.batch||''} onChange={e=>update(i,'batch',e.target.value)} /></td><td><input disabled={busy||needsRefresh} value={it.serial||''} onChange={e=>update(i,'serial',e.target.value)} /></td><td><input disabled={busy||needsRefresh} value={it.deviationReason||''} onChange={e=>update(i,'deviationReason',e.target.value)} /></td><td><input disabled={busy||needsRefresh} value={it.approvedBy||''} onChange={e=>update(i,'approvedBy',e.target.value)} /></td><td><button type="button" className="btn small danger" disabled={busy||needsRefresh} onClick={()=>setItems(xs=>xs.filter((_,j)=>j!==i))}>删除</button></td></tr>)}</tbody></table><div className="row mt16"><button type="button" className="btn" disabled={busy||needsRefresh} onClick={()=>setItems(xs=>[...xs,{sku:'',qty:1,batch:'',serial:'',deviationReason:'',approvedBy:''}])}>添加配件</button><button type="button" className="btn primary" disabled={busy||needsRefresh} onClick={save}>保存实际装车明细</button>{needsRefresh&&<button type="button" className="btn small" disabled={loading||busy} onClick={retry}>重新读取</button>}</div></>}{message&&<p className="hint" role="status" />}{error&&<p className="error-text" role="alert">{error}</p>}</div>;
}

function ReplacementHistory({vinId}) {
  const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');api.vinTrace(vinId).then(x=>{if(active)setRows(x.replacements||[])}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[vinId,attempt]);
  return <div className="card form-panel"><h3>配件更换履历</h3>{loading?<p className="hint" role="status" />:error?<p className="error-text" role="alert">读取配件更换履历失败：{error} <button type="button" className="btn small" onClick={()=>setAttempt(value=>value+1)}>重试读取</button></p>:rows.length?<table className="table"><thead><tr><th>原 SKU</th><th>原序列号 / 批次</th><th>新 SKU</th><th>新序列号 / 批次</th><th>数量</th><th>操作人</th><th>时间</th></tr></thead><tbody>{rows.map(x=><tr key={x.repairId}><td>{x.oldSku}</td><td>{x.oldSerial||'—'} / {x.oldBatch||'—'}</td><td>{x.newSku}</td><td>{x.newSerial||'—'} / {x.newBatch||'—'}</td><td>{x.quantity}</td><td>{x.actor}</td><td>{new Date(x.createdAt).toLocaleString('zh-CN')}</td></tr>)}</tbody></table>:<span className="hint" />}</div>;
}

function OldPartRecovery({repairId}) {
  const [record,setRecord]=useState(null),[warehouses,setWarehouses]=useState([]),[status,setStatus]=useState(''),[warehouseId,setWarehouseId]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[needsRefresh,setNeedsRefresh]=useState(true);
  const reloadSequence=useRef(0);
  const reload=async()=>{const sequence=++reloadSequence.current;setNeedsRefresh(true);setLoading(true);try{const [r,w]=await Promise.all([api.oldPart(repairId),api.warehouses()]);if(sequence!==reloadSequence.current)return;setRecord(r);setWarehouses(w);setNeedsRefresh(false);setError('')}catch(e){if(sequence===reloadSequence.current)setError(e.message);throw e}finally{if(sequence===reloadSequence.current)setLoading(false)}};
  useEffect(()=>{reload().catch(()=>{});return()=>{reloadSequence.current++}},[repairId]);
  const choices={'待回收':['已退回'],'已退回':['检测中','返修中','已报废'],'检测中':['返修中','已报废'],'返修中':['检测中','已报废'],'已报废':[]}[record?.status]||[];
  const submit=async e=>{e.preventDefault();if(busy||needsRefresh)return;setError('');setBusy(true);setNeedsRefresh(true);try{try{await api.updateOldPart(repairId,{status,warehouseId,note})}catch(e){try{await reload();setError(e.message)}catch(refreshError){setError(`${e.message}；旧件资料读取失败：${refreshError.message}`)}return}setStatus('');setWarehouseId('');setNote('');try{await reload()}catch(e){setError(`旧件状态已保存，但资料刷新失败：${e.message}`)}}finally{setBusy(false)}};
  const retry=()=>{setError('');reload().catch(e=>setError(e.message))};
  return <div className="card form-panel"><h3>旧件回收</h3>{loading&&<p className="hint" />}{error&&<p className="error-text" role="alert">{error}</p>}{needsRefresh&&<button type="button" className="btn small" disabled={loading||busy} onClick={retry}>重新读取旧件记录</button>}{record&&<><p>旧 SKU：{record.oldSku} · 序列号：{record.oldSerial||'—'} · 批次：{record.oldBatch||'—'} · 数量：{record.quantity}</p><p>状态：{record.status} · 所在仓：{record.warehouse||'—'}</p><p className="hint" />{!record.restock&&choices.length>0&&<form className="row" onSubmit={submit}><select disabled={busy||needsRefresh} value={status} required onChange={e=>setStatus(e.target.value)}><option value="">选择下一状态</option>{choices.map(x=><option key={x}>{x}</option>)}</select>{status==='已退回'&&<select disabled={busy||needsRefresh} required value={warehouseId} onChange={e=>setWarehouseId(e.target.value)}><option value="">选择退回仓库</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}<input disabled={busy||needsRefresh} value={note} onChange={e=>setNote(e.target.value)} required placeholder="处理说明"/><button disabled={busy||needsRefresh} className="btn primary">记录状态</button></form>}<RestockOldPart repairId={repairId} record={record} disabled={busy||needsRefresh} onDone={reload} />{record.events?.length>0&&<ul>{record.events.map((x,i)=><li key={i}>{x.fromStatus} → {x.toStatus} · {x.note} · {x.actor} · {new Date(x.createdAt).toLocaleString('zh-CN')}</li>)}</ul>}</>}</div>;
}

function RestockOldPart({repairId,record,disabled,onDone}) {
  const [note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const action=async name=>{if(busy||disabled)return;setBusy(true);setError('');try{try{await api.oldPartRestock(repairId,name,{note})}catch(e){try{await onDone();setError(e.message)}catch(refreshError){setError(`${e.message}；旧件资料读取失败：${refreshError.message}`)}return}setNote('');try{await onDone()}catch(e){setError(`翻新件操作已保存，但记录刷新失败：${e.message}`)}}finally{setBusy(false)}};
  if(!record.restock&&!['检测中','返修中'].includes(record.status))return null;
  return <div className="card mt16"><h4>翻新件入库</h4>{record.restock?<><p>{record.restock.approvedAt?'已批准入库':'等待管理员批准'} · 申请人：{record.restock.requestedBy} · {record.restock.note}</p>{record.restock.approvedAt?<p>批准人：{record.restock.approvedBy}</p>:<div className="row"><button className="btn primary" disabled={busy||disabled} onClick={()=>action('approve')}>批准入库</button><button className="btn" disabled={busy||disabled} onClick={()=>action('cancel')}>撤销申请</button></div>}</>:<div className="row"><input disabled={busy||disabled} value={note} onChange={e=>setNote(e.target.value)} placeholder="翻新与检测说明"/><button className="btn" disabled={busy||disabled||!note.trim()} onClick={()=>action('request')}>申请入库</button></div>}{error&&<p className="error-text" role="alert">{error}</p>}</div>;
}

function CompleteService({repair,onDone,onReconcile}) {
  const [note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async e=>{e.preventDefault();setBusy(true);setError('');try{await api.completeRepairService(repair.id,{note});await onDone()}catch(e){setError(e.message);await onReconcile(e.message)}finally{setBusy(false)}};
  return <div className="card form-panel"><h3>完成售后服务</h3><p className="hint" /><form onSubmit={submit}><label>服务完成说明 *<textarea required maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} /></label><button disabled={busy||!note.trim()} className="btn primary">完成服务</button></form>{error&&<p className="error-text">{error}</p>}</div>;
}

function CompleteRepair({repair,vin,onDone,onReconcile}) {
  const [items,setItems]=useState([]),[installedId,setInstalledId]=useState(''),[serial,setSerial]=useState(''),[batch,setBatch]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadedVinId,setLoadedVinId]=useState('');
  const traceSequence=useRef(0);
  const reload=async()=>{const sequence=++traceSequence.current;setLoading(true);setLoadError('');try{if(!vin)throw new Error('未找到车辆档案，无法读取已装配配件。');const trace=await api.vinTrace(vin.id);if(sequence===traceSequence.current){setItems(trace.installed||[]);setLoadedVinId(vin.id)}}catch(e){if(sequence===traceSequence.current)setLoadError(e.message)}finally{if(sequence===traceSequence.current)setLoading(false)}};
  useEffect(()=>{reload();return()=>{traceSequence.current++}},[vin?.id]);
  const stale=loadedVinId!==vin?.id;
  const submit=async e=>{e.preventDefault();if(busy||loading||stale||loadError)return;setBusy(true);setError('');try{await api.completeRepair(repair.id,{installedId,serial,batch});await onDone()}catch(e){setError(e.message);await onReconcile(e.message)}finally{setBusy(false)}};
  const locked=busy||loading||stale||Boolean(loadError);
  return <div className="card form-panel"><h3>完成更换</h3><p className="hint" />{loading&&<p className="hint" role="status" />}{loadError&&<p className="error-text" role="alert">已装配配件读取失败：{loadError} <button type="button" className="btn small" disabled={loading||busy} onClick={reload}>重试读取</button></p>}<form onSubmit={submit} className="row"><fieldset disabled={locked} className="row" style={{border:0,padding:0,margin:0,minWidth:0,flex:1}}><select required value={installedId} onChange={e=>setInstalledId(e.target.value)}><option value="">选择原装配件</option>{items.map(x=><option key={x.id} value={x.id}>{x.sku} · 数量 {x.qty} · 序列号 {x.serial||'—'} · 批次 {x.batch||'—'}</option>)}</select><input value={batch} onChange={e=>setBatch(e.target.value)} placeholder="新件批次"/><input value={serial} onChange={e=>setSerial(e.target.value)} placeholder="新件序列号"/><button disabled={locked} className="btn primary">完成并记录更换</button></fieldset></form>{error&&<p className="error-text" role="alert">{error}</p>}</div>;
}

function RepairStock({repair}) {
  const [warehouses,setWarehouses]=useState([]),[events,setEvents]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[needsRefresh,setNeedsRefresh]=useState(true),[loading,setLoading]=useState(true),[form,setForm]=useState({id:uuidv7(),kind:'领用',warehouseId:'',quantity:1});
  const reloadSequence=useRef(0);
  const reload=async()=>{const sequence=++reloadSequence.current;setNeedsRefresh(true);setLoading(true);try{const [w,e]=await Promise.all([api.warehouses(),api.repairStock(repair.id)]);if(sequence!==reloadSequence.current)return;setWarehouses(w.filter(x=>x.kind==='维修店仓'));setEvents(e);setNeedsRefresh(false)}catch(e){if(sequence===reloadSequence.current)throw e}finally{if(sequence===reloadSequence.current)setLoading(false)}};
  useEffect(()=>{reload().catch(e=>setError(e.message));return()=>{reloadSequence.current++}},[repair.id]);
  const submit=async e=>{e.preventDefault();if(busy||needsRefresh)return;setBusy(true);setNeedsRefresh(true);setError('');try{try{await api.repairStockMove(repair.id,form)}catch(e){setError(e.message);try{await reload()}catch(refreshError){setError(`${e.message}；记录列表读取失败：${refreshError.message}`)}return}setForm({id:uuidv7(),kind:'领用',warehouseId:'',quantity:1});try{await reload()}catch(e){setError(`领退料已记录，但记录刷新失败：${e.message}`)}}finally{setBusy(false)}};
  return <div className="card form-panel"><h3>维修工单领退料</h3><p className="hint" /><form className="row mb12" onSubmit={submit}><select disabled={busy||needsRefresh} value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option>领用</option><option>退回</option></select><select disabled={busy||needsRefresh} required value={form.warehouseId} onChange={e=>setForm({...form,warehouseId:e.target.value})}><option value="">选择维修店仓</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><input disabled={busy||needsRefresh} type="number" min="1" step="1" required value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/><button className="btn primary" disabled={busy||needsRefresh||!repair.sku}>记录领退料</button></form>{error&&<p className="error-text">{error}</p>}{needsRefresh&&<button type="button" className="btn small" disabled={busy||loading} onClick={()=>{setError('');reload().catch(e=>setError(e.message))}}>重新读取领退料记录</button>}<table className="table"><thead><tr><th>类型</th><th>配件 SKU</th><th>仓库</th><th>数量</th><th>操作人</th><th>时间</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{e.kind}</td><td>{e.sku}</td><td>{e.warehouse}</td><td>{e.quantity}</td><td>{e.actor}</td><td>{new Date(e.createdAt).toLocaleString('zh-CN')}</td></tr>)}</tbody></table></div>;
}

function FormPanel({ section, form, setForm, products, vins, skuOptions, serviceCenters, onSubmit, onClose, error, ready, onReload }) {
  const [bomVersions,setBomVersions]=useState([]);
  const [orders,setOrders]=useState([]),[ordersLoading,setOrdersLoading]=useState(false),[ordersError,setOrdersError]=useState(''),[ordersReady,setOrdersReady]=useState(false),[ordersAttempt,setOrdersAttempt]=useState(0);
  const [bomLoading,setBomLoading]=useState(false),[bomError,setBomError]=useState(''),[bomVehicleId,setBomVehicleId]=useState(''),[bomAttempt,setBomAttempt]=useState(0);
  useEffect(()=>{let active=true;if(section==='vin'){setOrdersLoading(true);setOrdersError('');api.productionOrders().then(o=>{if(active){setOrders(o);setOrdersReady(true)}}).catch(e=>{if(active)setOrdersError(e.message)}).finally(()=>{if(active)setOrdersLoading(false)})}return()=>{active=false}},[section,ordersAttempt]);
  const selectedVehicle=products.find(p=>p.kind==='vehicle'&&p.skus.some(s=>s.sku===form.sku));
  useEffect(()=>{let active=true;setBomVersions([]);setBomVehicleId('');setBomError('');if(section==='vin'&&selectedVehicle){setBomLoading(true);api.bomVersions(selectedVehicle.id).then(v=>{if(active){setBomVersions(v);setBomVehicleId(selectedVehicle.id)}}).catch(e=>{if(active)setBomError(e.message)}).finally(()=>{if(active)setBomLoading(false)})}else setBomLoading(false);return()=>{active=false}},[section,selectedVehicle?.id,bomAttempt]);
  const f = (key, label, opts = {}) => <div className="field"><label>{label}{opts.required && <span className="req">*</span>}</label>{opts.select ? <select disabled={opts.disabled} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value, ...(section==='vin'&&key==='sku'&&e.target.value!==form.sku?{bomVersion:''}:{}) })}><option value="">— 选择 —</option>{opts.select.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}</select> : <input type={opts.type || 'text'} value={form[key] || ''} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={opts.placeholder} />}</div>;
  const isVin = section === 'vin'; const isRepair = section === 'repair';
  const bomStale=isVin&&Boolean(selectedVehicle)&&bomVehicleId!==selectedVehicle.id;
  const formReady=ready&&(!isVin||(ordersReady&&!ordersLoading&&!ordersError&&(!selectedVehicle||(!bomLoading&&!bomError&&!bomStale))));
  const sku = skuOptions.map(x => ({ value: x.sku, label: `${x.sku} · ${x.name}` }));
  const vehicleSku = products.filter(p => p.kind === 'vehicle').flatMap(p => p.skus.map(s => ({ value: s.sku, label: `${s.sku} · ${p.name}` })));
  return <div className="card form-panel"><div className="section-title" style={{ marginTop: 0 }}>填写{isVin ? '车辆档案' : isRepair ? '维修工单' : '替代关系'}</div><div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))' }}>
    {isVin && <>{f('vin','VIN 编码',{required:true,placeholder:'11–20 位 VIN'} )}{f('model','车型')}{f('sku','整车 SKU',{select: vehicleSku})}<div className="field"><label>生产订单</label><select disabled={ordersLoading||Boolean(ordersError)} value={form.orderNo||''} onChange={e=>{const o=orders.find(x=>x.orderNo===e.target.value);setForm({...form,orderNo:e.target.value,...(o?{sku:o.sku,bomVersion:o.bomVersion,factory:o.factory,batch:o.batch}:{})})}}><option value="">— 无订单 —</option>{orders.map(o=><option key={o.id} value={o.orderNo}>{o.orderNo} · {o.sku}</option>)}</select></div>{f('factory','生产工厂')}{f('batch','生产批次')}{f('bomVersion','BOM 版本',{select:bomVersions.map(x=>({value:x.version,label:`${x.version} · ${x.status}`})),disabled:bomLoading||Boolean(bomError)||bomStale})}{f('producedAt','生产日期',{type:'date'})}{f('status','状态',{select:['在用','停用','待交付']})}<div className="field fg-span">{f('installed','已装配件（简述）')}{f('serials','序列号记录')}</div></>}
    {isRepair && <>{f('vin','VIN 编码',{required:true,select:vins.map(v=>({value:v.vin,label:`${v.vin} · ${v.model || '未标车型'}`}))})}{f('type','工单类型',{select:['质保维修','付费维修','返厂检测','售后服务']})}{f('fault','故障描述',{required:true})}{f('sku','更换配件',{select:sku})}{f('qty','数量',{type:'number'})}{f('serviceCenterId','服务网点',{select:[...serviceCenters.filter(c=>c.status==='启用'||c.id===form.serviceCenterId).map(c=>({value:c.id,label:`${c.name} · ${c.city||c.country||c.code}`}))]})}{f('store','维修店名称（未关联网点时使用）')}{f('status','状态',{select:form.id?['待收货','维修中','待配件','已完成','已关闭']:['待收货','维修中','待配件']})}{f('oldPart','旧件处理')}</>}
    {!isVin && !isRepair && <>{f('originalSku','原 SKU',{required:true,select:sku})}{f('replacementSku','替代 SKU',{required:true,select:sku})}{f('reason','变更原因',{required:true})}{f('effectiveAt','生效日期',{type:'date'})}{f('status','状态',{select:['启用','停用']})}{f('note','备注')}</>}
  </div>{isVin&&ordersLoading&&<p className="hint" role="status" />}{isVin&&ordersError&&<p className="error-text" role="alert">生产订单读取失败：{ordersError} <button type="button" className="btn small" onClick={()=>{setOrdersReady(false);setOrdersAttempt(value=>value+1)}}>重试读取</button></p>}{isVin&&selectedVehicle&&bomLoading&&<p className="hint" role="status" />}{isVin&&selectedVehicle&&bomError&&<p className="error-text" role="alert">BOM 版本读取失败：{bomError} <button type="button" className="btn small" onClick={()=>setBomAttempt(value=>value+1)}>重试读取</button></p>}<div className="row mt16">{error && <span className="error-text grow">{error} <button type="button" className="btn small" onClick={onReload}>重新读取</button></span>}<button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={!formReady} onClick={onSubmit}>保存</button></div></div>;
}

function VinTable({ rows, onUpdate, onEdit, canEdit }) { return <table className="table"><thead><tr><th>VIN</th><th>车型</th><th>整车 SKU</th><th>批次</th><th>生产日期</th><th>状态</th>{canEdit&&<th>操作</th>}</tr></thead><tbody>{rows.map(v => <tr key={v.id}><td className="mono">{v.vin}</td><td>{v.model || '—'}</td><td className="mono">{v.sku || '—'}</td><td>{v.batch || '—'}</td><td>{v.producedAt || '—'}</td><td><span className="tag on">{v.status}</span></td>{canEdit&&<td><button className="btn small" onClick={() => onEdit(v)}>编辑</button> <button className="btn small" onClick={() => onUpdate(v.id, v.status === '在用' ? '停用' : '在用')}>{v.status === '在用' ? '停用' : '启用'}</button></td>}</tr>)}{!rows.length && <Empty colSpan={canEdit?7:6} text="尚无 VIN 档案。先建立车辆档案，再关联维修工单。" />}</tbody></table>; }
function RepairTable({ rows, onUpdate, onEdit, canEdit }) { return <table className="table"><thead><tr><th>工单号</th><th>VIN</th><th>类型</th><th>故障</th><th>更换 SKU</th><th>维修店</th><th>状态</th>{canEdit&&<th>操作</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="mono">{r.no}</td><td className="mono">{r.vin}</td><td>{r.type}</td><td>{r.fault}</td><td className="mono">{r.sku || '—'}</td><td>{r.store || '—'}</td><td><span className={'tag ' + (r.status === '已完成' || r.status === '已关闭' ? 'on' : 'plan')}>{r.status}</span></td>{canEdit&&<td><button className="btn small" onClick={() => onEdit(r)}>编辑</button> {r.status === '维修中' ? <button className="btn small" onClick={() => onEdit(r)}>{r.sku?'记录更换':'处理服务'}</button> : !['已完成','已关闭'].includes(r.status) && <button className="btn small" onClick={() => onUpdate(r.id, '维修中')}>开始维修</button>}</td>}</tr>)}{!rows.length && <Empty colSpan={canEdit?8:7} text="尚无维修工单。" />}</tbody></table>; }
function SubTable({ rows, onUpdate, canEdit }) { return <table className="table"><thead><tr><th>原 SKU</th><th>替代 SKU</th><th>变更原因</th><th>生效日期</th><th>状态</th><th>备注</th>{canEdit&&<th>操作</th>}</tr></thead><tbody>{rows.map(s => <tr key={s.id}><td className="mono">{s.originalSku}</td><td className="mono">{s.replacementSku}</td><td>{s.reason}</td><td>{s.effectiveAt}</td><td><span className="tag on">{s.status}</span></td><td>{s.note || '—'}</td>{canEdit&&<td><button className="btn small" onClick={() => onUpdate(s.id, s.status === '启用' ? '停用' : '启用')}>{s.status === '启用' ? '停用' : '启用'}</button></td>}</tr>)}{!rows.length && <Empty colSpan={canEdit?7:6} text="尚无替代关系。" />}</tbody></table>; }
function Empty({ colSpan, text }) { return <tr><td colSpan={colSpan} className="hint empty-cell" /></tr>; }

function FitManager({ parts, vehicles, onSaved, onReconcile }) {
  const [partId, setPartId] = useState(parts[0]?.id || '');
  const [fits, setFits] = useState([]);
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const part = parts.find(p => p.id === partId);
  useEffect(() => { if (parts[0] && !partId) setPartId(parts[0].id); }, [parts, partId]);
  useEffect(() => { setFits(resolveFitments(part?.fitments || [], vehicles)); }, [partId, part?.version, vehicles]);
  const toggle = vehicle => setFits(fs => fs.some(f => f.vehicleId === vehicle.id) ? fs.filter(f => f.vehicleId !== vehicle.id) : [...fs, { vehicleId: vehicle.id, note: '' }]);
  const update = (index, patch) => setFits(fs => fs.map((f, i) => i === index ? { ...f, ...patch } : f));
  const save = async () => {
    if (!part || busy) return;
    const error = fitmentError(fits, vehicles); if (error) { setMsg(error); return; }
    setBusy(true);
    try { await api.updateProduct(part.id, { fitments: fitmentPayload(fits, vehicles) }, part.version); }
    catch (e) { await onReconcile(e.message); setBusy(false); return; }
    setMsg('适配关系已保存');
    try { await onSaved(); }
    catch (e) { setMsg(`适配关系已保存，但产品列表刷新失败，请重新加载页面：${e.message}`); }
    finally { setBusy(false); }
  };
  return <div className="card"><div className="row mb12"><label>选择零配件 <select disabled={busy} value={partId} onChange={e => setPartId(e.target.value)}>{parts.map(p => <option key={p.id} value={p.id}>{p.name} · {p.productType}</option>)}</select></label>{msg && <span className="hint" />}</div>
    {part ? <table className="table"><thead><tr><th>适配</th><th>车型</th><th>整车产品</th><th>适配说明</th></tr></thead><tbody>{vehicles.map(v => {
      const index = fits.findIndex(f => f.vehicleId === v.id);
      return <tr key={v.id}><td><input type="checkbox" disabled={busy} checked={index >= 0} onChange={() => toggle(v)} /></td><td>{v.model}</td><td>{v.name}</td><td>{index >= 0 ? <input disabled={busy} value={fits[index].note || ''} onChange={e => update(index, { note: e.target.value })} /> : '—'}</td></tr>;
    })}</tbody></table> : <div className="hint" />}
    {fits.map((f, i) => !f.vehicleId && <div className="row mt16" key={i}><span>待确认：{f.vehicleModel || '未知车型'}</span><select disabled={busy} value="" onChange={e => update(i, { vehicleId: e.target.value })}><option value="">选择实际整车</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.model} · {v.name}</option>)}</select><button className="btn small" disabled={busy} onClick={() => setFits(fs => fs.filter((_, n) => n !== i))}>移除</button></div>)}
    <div className="row mt16"><button className="btn primary" onClick={save} disabled={!part || busy}>{busy?'保存中…':'保存适配关系'}</button></div></div>;
}
