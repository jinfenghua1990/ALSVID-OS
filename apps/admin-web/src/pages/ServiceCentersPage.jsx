import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const empty = { code:'',name:'',country:'',region:'',city:'',address:'',contactName:'',phone:'',email:'',status:'待审核',note:'' };
const fields = [['code','网点编号 *'],['name','网点名称 *'],['country','国家或地区'],['region','州 / 省'],['city','城市'],['address','地址'],['contactName','联系人'],['phone','电话'],['email','邮箱'],['note','备注']];
const statusLabel = { '待审核':'待管理员审核','启用':'已开通','停用':'已停用' };

export default function ServiceCentersPage({ active = true, user, onSectionChange }) {
  const [rows,setRows]=useState([]),[form,setForm]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const admin=user?.role==='admin';
  const loadVersion=useRef(0);
  const reload=async()=>{const version=++loadVersion.current;setLoading(true);setError('');try{const next=await api.serviceCenters();if(version===loadVersion.current)setRows(next)}catch(e){if(version===loadVersion.current)setError(e.message);throw e}finally{if(version===loadVersion.current)setLoading(false)}};
  useEffect(()=>{if(!active)return;reload().catch(()=>{});return()=>{loadVersion.current++}},[active]);
  const save=async e=>{e.preventDefault();setBusy(true);setError('');setMessage('');let saved;try{saved=form.id?await api.updateServiceCenter(form.id,form):await api.createServiceCenter(form)}catch(e){setError(e.message);setBusy(false);return}setRows(current=>form.id?current.map(row=>row.id===saved.id?saved:row):[...current,saved]);setForm(null);setMessage('服务网点资料已保存');try{await reload()}catch(e){setMessage('服务网点资料已保存，但列表刷新失败。')}finally{setBusy(false)}};
  return <div className="service-page">
    <div className="page-title"><div><h2 /><span className="hint" /></div>{admin&&<button className="btn accent" onClick={()=>setForm({...empty})}>新增服务网点</button>}</div>
    <div className="tabs service-tabs">{[['vin','VIN 车辆档案'],['repair','维修工单'],['fit','配件适配'],['substitute','配件替代'],['centers','服务网点']].map(([k,label])=><button key={k} className={'tab'+(k==='centers'?' active':'')} onClick={()=>onSectionChange(k)}>{label}</button>)}</div>
    {form&&<form className="card form-panel" onSubmit={save}><h3>{form.id?'编辑服务网点':'新增服务网点'}</h3><fieldset className="form-grid" disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>{fields.map(([key,label])=><label key={key}>{label}{key==='note'?<textarea maxLength={2000} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<input required={key==='code'||key==='name'} type={key==='email'?'email':'text'} maxLength={key==='address'?500:key==='email'?254:200} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}<label>开通状态<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="待审核">待管理员审核</option><option value="启用">已开通</option><option value="停用">已停用</option></select></label><div className="row mt16"><button type="button" className="btn" onClick={()=>setForm(null)}>取消</button><button className="btn primary">{busy?'保存中…':'保存网点'}</button></div></fieldset></form>}
    {error&&<p className="error-text" role="alert">{error} <button type="button" className="btn small" disabled={loading} onClick={()=>reload().catch(()=>{})}>重试</button></p>}{message&&<p className="hint" role="status" />}
    <table className="table"><thead><tr><th>编号</th><th>网点</th><th>地区</th><th>联系人</th><th>联系方式</th><th>状态</th>{admin&&<th>操作</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.code}</td><td>{row.name}<br/><small>{row.address}</small></td><td>{[row.country,row.region,row.city].filter(Boolean).join(' · ')||'—'}</td><td>{row.contactName||'—'}</td><td>{[row.phone,row.email].filter(Boolean).join(' · ')||'—'}</td><td>{statusLabel[row.status]||row.status}</td>{admin&&<td><button className="btn small" disabled={busy} onClick={()=>{setError('');setForm({...row})}}>编辑 / 审核</button></td>}</tr>)}{loading&&!rows.length&&<tr><td colSpan={admin?7:6} className="hint empty-cell" /></tr>}{!loading&&!error&&!rows.length&&<tr><td colSpan={admin?7:6} className="hint empty-cell" /></tr>}</tbody></table>
  </div>;
}
