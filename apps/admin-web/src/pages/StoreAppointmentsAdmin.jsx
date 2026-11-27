import React,{useState} from 'react';
import {api,adminFetch} from '../api.js';
async function call(path,body){const r=await adminFetch('/api/store-appointments'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const j=await r.json();if(!r.ok)throw Error(j.error||'预约操作失败');return j.data}
const empty={locationId:'',startsAt:'',endsAt:'',capacity:1};
const labels={pending:'待确认',confirmed:'已确认',cancelled:'已取消',completed:'已完成'};
const fmt=v=>new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(v));
export default function StoreAppointmentsAdmin(){
 const [data,setData]=useState(null),[locations,setLocations]=useState([]),[form,setForm]=useState(empty),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{const [d,l]=await Promise.all([call(''),api.testRideLocations()]);setData(d);setLocations(l.data.filter(x=>x.approvedForPublication&&x.authorizationActive&&x.partnerActive&&x.dealerAuthorized&&x.testRideAuthorized))};
 const run=async fn=>{if(busy)return;setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <details><summary>门店预约与时段管理</summary><button className="btn small" type="button" disabled={busy} onClick={()=>void run(async()=>{})}>读取 / 刷新</button>{error&&<p role="alert">{error}</p>}{data&&<>
 <h4>开放预约时段</h4><p>德国、奥地利当地时间。填写含时区偏移的 ISO 时间，例如 2026-12-01T10:00+01:00；夏令时为 +02:00。</p>
 <form onSubmit={e=>{e.preventDefault();void run(async()=>{await call('/slots',{...form,capacity:Number(form.capacity)});setForm(empty)})}}>
 <label>授权网点 <select required value={form.locationId} onChange={e=>setForm({...form,locationId:e.target.value})}><option value="">请选择</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name} · {l.city}</option>)}</select></label>
 {['startsAt','endsAt'].map((k,i)=><label key={k}>{i?'结束时间':'开始时间'} <input required placeholder="YYYY-MM-DDTHH:mm+01:00" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
 <label>容量 <input type="number" min="1" max="20" required value={form.capacity} onChange={e=>setForm({...form,capacity:e.target.value})}/></label><button disabled={busy} className="btn small">开放时段</button></form>
 <table className="table"><thead><tr><th>网点</th><th>时段（欧洲当地）</th><th>容量</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.slots.map(s=><tr key={s.id}><td>{s.locationName}</td><td>{fmt(s.startsAt)} – {fmt(s.endsAt)}</td><td>{s.capacity}</td><td>{s.active&&s.eligible?'开放':'关闭 / 授权失效'}</td><td>{s.active&&<button type="button" disabled={busy} onClick={()=>void run(()=>call('/slots/'+s.id+'/close',{}))}>停止新预约</button>}</td></tr>)}</tbody></table>
 <h4>预约记录</h4><p>关闭时段不自动取消已有预约；请联系客户后处理。确认结果可通过客户凭证查询。</p>
 <table className="table"><thead><tr><th>状态</th><th>客户</th><th>类型</th><th>门店 / 时间</th><th>车型</th><th>操作</th></tr></thead><tbody>{data.bookings.map(b=><tr key={b.id}><td>{labels[b.status]}</td><td>{b.name}<div>{b.email}</div></td><td>{b.purpose==='test_ride'?'试骑':'到店咨询'}</td><td>{b.locationName} · {fmt(b.startsAt)}</td><td>{b.model||'—'}</td><td>{(b.status==='pending'?['confirmed','cancelled']:b.status==='confirmed'?['completed','cancelled']:[]).map(status=><button key={status} type="button" disabled={busy} onClick={()=>{if(status==='cancelled'&&!window.confirm('确定取消预约？'))return;void run(()=>call('/'+b.id+'/status',{status,version:b.version}))}}>{labels[status]}</button>)}</td></tr>)}</tbody></table></>}</details>
}
