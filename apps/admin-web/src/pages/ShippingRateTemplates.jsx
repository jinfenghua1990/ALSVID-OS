import React,{useEffect,useState} from 'react';
import {api} from '../api.js';

const modes={fixed:'固定运费',per_item:'按件计费',weight:'按包装重量阶梯',amount:'按发货组商品金额阶梯'};
const initial=()=>({name:'',warehouseId:'',country:'DE',region:'',postalPrefix:'',method:'standard',currency:'EUR',enabled:false,priority:100,mode:'fixed',rate:'',freeAbove:'',freeSkus:'',bands:[{upTo:'',rate:''}]});
const decimal=value=>{if(!/^\d{1,9}(?:\.\d{1,2})?$/.test(String(value).trim()))throw Error('金额须为非负数且最多两位小数');const [whole,fraction='']=String(value).trim().split('.');return Number(whole)*100+Number((fraction+'00').slice(0,2))};
const money=value=>value==null?'':(value/100).toFixed(2);
function toForm(row){return {...row,rate:money(row.rateMinor),freeAbove:money(row.freeAboveMinor),freeSkus:row.freeSkus.join('\n'),bands:row.bands.length?row.bands.map(x=>({upTo:x.upTo==null?'':row.mode==='amount'?money(x.upTo):String(x.upTo),rate:money(x.rateMinor)})):[{upTo:'',rate:''}]}}

export default function ShippingRateTemplates({active=true,user}){
 const [rows,setRows]=useState([]),[warehouses,setWarehouses]=useState([]),[form,setForm]=useState(null),[history,setHistory]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=async()=>{setBusy(true);setError('');try{const [data,wh]=await Promise.all([api.shippingRateTemplates(),api.warehouses()]);setRows(data);setWarehouses(wh)}catch(e){setError(e.message)}finally{setBusy(false)}};
 useEffect(()=>{if(active&&user?.role==='admin')void load()},[active,user?.role]);
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 const bandChange=(index,key,value)=>setForm(f=>({...f,bands:f.bands.map((x,i)=>i===index?{...x,[key]:value}:x)}));
 const save=async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{
   const {id,revision=0,name,warehouseId,country,region,postalPrefix,method,currency,enabled,priority,mode,rate,freeAbove,freeSkus,bands}=form;
   const body={revision,name,warehouseId,country,region,postalPrefix,method,currency,enabled,priority:Number(priority),mode,rateMinor:['fixed','per_item'].includes(mode)?decimal(rate):null,freeAboveMinor:freeAbove.trim()?decimal(freeAbove):null,freeSkus:freeSkus.split(/[\n,，]/).map(s=>s.trim()).filter(Boolean),bands:['amount','weight'].includes(mode)?bands.map((x,i)=>({upTo:i===bands.length-1?null:mode==='amount'?decimal(x.upTo):(/^\d+$/.test(x.upTo)?Number(x.upTo):NaN),rateMinor:decimal(x.rate)})):[]};
   await api.saveShippingRateTemplate(id,body);setForm(null);setHistory(null);await load();
 }catch(e){setError(e.message)}finally{setBusy(false)}};
 if(user?.role!=='admin')return <p className="hint">仅管理员可维护运费模板。</p>;
 return <div className="prod">
   <div className="prod-head"><div><div className="prod-head__eyebrow">SHIPPING RATES</div><h2>运费模板</h2><p className="hint">按发货仓库、配送地址和配送方式独立计费。当前为模板管理及计费规则，尚未接入正式结算。</p></div><div className="prod-head__actions"><button className="btn" onClick={load} disabled={busy}>刷新</button><button className="btn primary" onClick={()=>{setForm(initial());setHistory(null);setError('')}} disabled={busy}>新增模板</button></div></div>
   {error&&<p role="alert" className="error-text">{error}</p>}
   {form&&<form onSubmit={save} className="card" style={{padding:20}}>
     <h3>{form.id?'编辑模板 · 当前版本 '+form.revision:'新增运费模板'}</h3>
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
       <label>模板名称<input required value={form.name} onChange={e=>change('name',e.target.value)}/></label>
       <label>发货仓库<select required value={form.warehouseId} onChange={e=>change('warehouseId',e.target.value)}><option value="">选择仓库</option>{warehouses.filter(x=>x.businessTypes?.includes('B2C')||x.id===form.warehouseId).map(x=><option key={x.id} value={x.id}>{x.name} · {x.code}</option>)}</select></label>
       <label>配送国家（ISO）<input required maxLength={2} value={form.country} onChange={e=>change('country',e.target.value.toUpperCase())}/></label>
       <label>地区（可空）<input value={form.region} onChange={e=>change('region',e.target.value)}/></label>
       <label>邮编前缀（可空）<input value={form.postalPrefix} onChange={e=>change('postalPrefix',e.target.value)}/></label>
       <label>配送方式代码<input required value={form.method} onChange={e=>change('method',e.target.value)}/></label>
       <label>币种<select value={form.currency} onChange={e=>change('currency',e.target.value)}><option>EUR</option><option>CNY</option></select></label>
       <label>优先级（数字越小越优先）<input type="number" min={1} max={9999} required value={form.priority} onChange={e=>change('priority',e.target.value)}/></label>
       <label>计费方式<select value={form.mode} onChange={e=>change('mode',e.target.value)}>{Object.entries(modes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
       {['fixed','per_item'].includes(form.mode)&&<label>{form.mode==='per_item'?'每件运费':'固定运费'}（{form.currency}）<input required type="number" min={0} step="0.01" value={form.rate} onChange={e=>change('rate',e.target.value)}/></label>}
       <label>发货组满额包邮（{form.currency}，可空）<input type="number" min="0.01" step="0.01" value={form.freeAbove} onChange={e=>change('freeAbove',e.target.value)}/></label>
       <label>指定包邮 SKU（逗号或换行分隔）<textarea value={form.freeSkus} onChange={e=>change('freeSkus',e.target.value)}/></label>
     </div>
     {['weight','amount'].includes(form.mode)&&<div className="table-scroll"><table className="table"><thead><tr><th>计费上限（{form.mode==='weight'?'克':form.currency}）</th><th>运费（{form.currency}）</th><th>操作</th></tr></thead><tbody>{form.bands.map((band,i)=><tr key={i}><td>{i===form.bands.length-1?'不限上限':<input required type="number" min={0} step={form.mode==='weight'?1:'0.01'} value={band.upTo} onChange={e=>bandChange(i,'upTo',e.target.value)}/>}</td><td><input required type="number" min={0} step="0.01" value={band.rate} onChange={e=>bandChange(i,'rate',e.target.value)}/></td><td>{form.bands.length>1&&<button className="btn small" type="button" onClick={()=>change('bands',form.bands.filter((_,j)=>j!==i))}>移除</button>}</td></tr>)}</tbody></table><button className="btn" type="button" onClick={()=>change('bands',[...form.bands.slice(0,-1),{upTo:'',rate:''},...form.bands.slice(-1)])}>添加阶梯</button></div>}
     <label style={{display:'block',margin:'18px 0'}}><input type="checkbox" checked={form.enabled} onChange={e=>change('enabled',e.target.checked)}/> 启用规则</label>
     <div className="prod-head__actions"><button type="button" className="btn" onClick={()=>setForm(null)} disabled={busy}>取消</button><button className="btn primary" disabled={busy}>保存新版本</button></div>
   </form>}
   <div className="card table-scroll"><table className="table"><thead><tr><th>模板</th><th>发货仓</th><th>配送范围</th><th>方式</th><th>计费方式</th><th>币种</th><th>优先级</th><th>版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.name}</td><td>{warehouses.find(x=>x.id===row.warehouseId)?.name||row.warehouseId}</td><td>{[row.country,row.region,row.postalPrefix].filter(Boolean).join(' / ')}</td><td>{row.method}</td><td>{modes[row.mode]}</td><td>{row.currency}</td><td>{row.priority}</td><td>{row.revision}</td><td>{row.enabled?'启用':'停用'}</td><td><button className="btn small" onClick={()=>{setForm(toForm(row));setHistory(null)}}>编辑</button><button className="btn small" onClick={async()=>{try{setHistory({name:row.name,rows:await api.shippingRateTemplateHistory(row.id)});setForm(null)}catch(e){setError(e.message)}}}>历史</button></td></tr>)}{!rows.length&&<tr><td colSpan={10} className="empty-cell">{busy?'加载中…':'暂无运费模板'}</td></tr>}</tbody></table></div>
   {history&&<div className="card table-scroll"><h3>{history.name} · 历史版本</h3><table className="table"><thead><tr><th>版本</th><th>时间</th><th>状态</th><th>计费规则</th></tr></thead><tbody>{history.rows.map(row=><tr key={row.revision}><td>{row.revision}</td><td>{new Date(row.createdAt).toLocaleString('zh-CN')}</td><td>{row.enabled?'启用':'停用'}</td><td>{modes[row.mode]} · {row.rateMinor==null?row.bands.map(x=>(x.upTo??'不限')+' : '+money(x.rateMinor)).join(' / '):money(row.rateMinor)} {row.currency}</td></tr>)}</tbody></table><button className="btn" onClick={()=>setHistory(null)}>关闭历史</button></div>}
 </div>
}
