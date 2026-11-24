import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export function TestRideLocationAuthorizations() {
  const [locations,setLocations]=useState(null),[companies,setCompanies]=useState([]),[selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{setError('');try{const [a,b]=await Promise.all([api.testRideLocations(),api.dealerCompanies()]);setLocations(a.data);setCompanies(b)}catch(e){setError(e.message)}};
  const edit=row=>setSelected({id:row.id,dealerCompanyId:row.dealerCompanyId||'',partnerActive:!!row.partnerActive,dealerAuthorized:!!row.dealerAuthorized,testRideAuthorized:!!row.testRideAuthorized,revision:row.revision||0});
  const save=async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{await api.testRideLocationAuthorization(selected.id,selected);setSelected(null);await load()}catch(f){setError(f.message)}finally{setBusy(false)}};
  return <details><summary>网点试骑授权管理</summary><p>授权必须关联已核实的经销商；取消授权或更换企业会解除未关闭意向的分配。</p><button className="btn small" type="button" onClick={load}>读取网点和企业</button>{error&&<p role="alert">{error}</p>}
    {locations&&(!locations.length?<p>暂无网点。</p>:<ul>{locations.map(row=><li key={row.id}>{row.name} · {row.country} {row.city} · {row.testRideAuthorized?'已授权试骑':'未授权试骑'} <button type="button" onClick={()=>edit(row)}>设置</button></li>)}</ul>)}
    {selected&&<form onSubmit={save}><label>经销商企业 <select required value={selected.dealerCompanyId} onChange={e=>setSelected({...selected,dealerCompanyId:e.target.value})}><option value="">请选择</option>{companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      {[['partnerActive','合作伙伴有效'],['dealerAuthorized','经销商资格有效'],['testRideAuthorized','允许试骑']].map(([key,label])=><label key={key} style={{display:'block'}}><input type="checkbox" checked={selected[key]} onChange={e=>setSelected({...selected,[key]:e.target.checked})}/>{label}</label>)}
      <button className="btn small" disabled={busy}>保存授权</button> <button type="button" onClick={()=>setSelected(null)}>取消</button></form>}
  </details>;
}

export function TestRideAssignment({ id, onChanged }) {
  const [ride,setRide]=useState(null),[locations,setLocations]=useState(null),[choice,setChoice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let current=true;setRide(null);setLocations(null);setError('');Promise.all([api.testRideAssignment(id),api.testRideLocations()]).then(([a,b])=>{if(current){setRide(a.data);setChoice(a.data.locationId||'');setLocations(b.data)}}).catch(e=>{if(current)setError(e.message)});return()=>{current=false}},[id]);
  const eligible=locations?.filter(row=>row.country===ride?.country&&row.approvedForPublication&&row.authorizationActive&&row.partnerActive&&row.dealerAuthorized&&row.testRideAuthorized)||[];
  const save=async()=>{if(!ride||busy)return;setBusy(true);setError('');try{const result=await api.assignTestRide(id,{locationId:choice||null,version:ride.version});setRide({...ride,locationId:choice||null,version:result.data.version});onChanged(result.data.version)}catch(f){setError(f.status===409?'记录或网点授权已变化，请重新打开后核对。':f.message)}finally{setBusy(false)}};
  return <section><h4>分配试骑网点</h4>{error&&<p role="alert">{error}</p>}{ride&&locations&&<div><label>已授权网点 <select value={choice} onChange={e=>setChoice(e.target.value)} disabled={busy||ride.status==='CLOSED'}><option value="">未分配</option>{ride.locationId&&!eligible.some(row=>row.id===ride.locationId)&&<option value={ride.locationId}>现有网点（不再符合授权）</option>}{eligible.map(row=><option key={row.id} value={row.id}>{row.name} · {row.city}</option>)}</select></label> <button type="button" onClick={save} className="btn small" disabled={busy||ride.status==='CLOSED'||choice===(ride.locationId||'')}>保存分配</button></div>}</section>;
}
