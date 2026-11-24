import React,{useEffect,useState} from 'react';
import {api} from '../api.js';
const labels={baseline:'历史基线',publish:'发布',unpublish:'下架',rollback:'回滚'};
export default function ListingVersions({listing,disabled,onRolledBack}){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[a,setA]=useState(''),[b,setB]=useState(''),[details,setDetails]=useState(null),[epoch,setEpoch]=useState(0);
 useEffect(()=>{let alive=true;setRows([]);setDetails(null);setA('');setB('');setError('');api.listingVersions(listing.id).then(data=>{if(alive)setRows(data)}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false}},[listing.id,listing.revision,epoch]);
 const compare=async()=>{setBusy(true);setError('');try{setDetails(await Promise.all([api.listingVersion(listing.id,a),api.listingVersion(listing.id,b)]))}catch(e){setError(e.message)}finally{setBusy(false)}};
 const rollback=async row=>{if(!window.confirm('恢复该版本的商品详情并立即发布？草稿、SKU、价格及商品主档均不变。'))return;setBusy(true);setError('');setNotice('');try{const result=await api.rollbackListing(listing.id,listing.revision,row.revision);setNotice(result.storefrontRevalidate?.ok?'内容已恢复，缓存回调已确认；真实页面待验收。':'内容已恢复，但前台缓存刷新未确认。');await onRolledBack?.(result);setEpoch(v=>v+1)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <details className="card mt16"><summary>商品详情版本历史（线上 {listing.publishedRevision?'v'+listing.publishedRevision:'未发布'}）</summary>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <table className="table"><thead><tr><th>版本</th><th>操作</th><th>操作人</th><th>时间</th><th>对比 / 恢复</th></tr></thead><tbody>{rows.map(row=><tr key={row.revision}><td>v{row.revision}{listing.publishedRevision===row.revision?' · 线上':''}</td><td>{labels[row.action]||row.action}{row.sourceRevision?' ← v'+row.sourceRevision:''}</td><td>{row.actor}</td><td>{new Date(row.createdAt).toLocaleString()}</td><td><button type="button" disabled={busy} onClick={()=>setA(String(row.revision))}>A</button> <button type="button" disabled={busy} onClick={()=>setB(String(row.revision))}>B</button> <button type="button" disabled={busy||disabled||row.action==='unpublish'||listing.publishedRevision===row.revision} onClick={()=>rollback(row)}>恢复并发布</button></td></tr>)}</tbody></table>
 {!rows.length&&!error&&<p className="hint">暂无记录。</p>}
 <button type="button" disabled={busy||!a||!b||a===b} onClick={compare}>对比 v{a||'—'} / v{b||'—'}</button>
 {details&&<div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>{details.map((v,i)=><div key={i}><strong>v{v.revision} · {labels[v.action]}</strong><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:440,overflow:'auto'}}>{JSON.stringify(v.document,null,2)}</pre></div>)}</div>}
 <p className="hint">仅恢复详情内容，SKU 与价格按当前商品配置保留。历史下架记录不可直接恢复。</p></details>
}
