import React,{useEffect,useState} from 'react';
import {api} from '../api.js';
import {shellValue,shellModule,DESIGN_LOCALES,DESIGN_DEVICES} from './design-module-registry.js';
import './unified-design.css';
function LinkFields({rows,onChange,disabled}){
 const patch=(i,value)=>onChange(rows.map((row,j)=>j===i?{...row,...value}:row));
 return <div className="udw-links">{rows.map((row,i)=><div className="udw-link-row" key={i}><input aria-label="链接名称" maxLength={80} value={row.label} onChange={e=>patch(i,{label:e.target.value})} placeholder="链接名称" disabled={disabled}/><input aria-label="链接地址" maxLength={500} value={row.href} onChange={e=>patch(i,{href:e.target.value})} placeholder="/de/e-bikes 或 https://..." disabled={disabled}/><button className="btn small" type="button" disabled={disabled} onClick={()=>onChange(rows.filter((_,j)=>j!==i))}>移除</button></div>)}<div><button className="btn small" type="button" disabled={disabled||rows.length>=12} onClick={()=>onChange([...rows,{label:'',href:''}])}>添加链接</button></div></div>
}
export default function UnifiedDesignEditor({moduleId,locale,user,workspaceKey,onWorkspaceDirtyChange,onBack}){
 const module=shellModule(moduleId),kind=module?.kind;
 const [page,setPage]=useState(null),[value,setValue]=useState(null),[baseline,setBaseline]=useState(''),[versions,setVersions]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState(false),[attempt,setAttempt]=useState(0);
 const dirty=value!==null&&JSON.stringify(value)!==baseline;
 const setDoc=doc=>{const v=shellValue(doc,kind);setPage(doc);setValue(v);setBaseline(JSON.stringify(v));setReview(false)};
 useEffect(()=>{if(!kind||user?.role!=='admin')return;let alive=true;setLoading(true);setError('');(async()=>{try{
   const rows=await api.cmsPages({type:'shared_module',locale,path:module.path});
   const row=rows.find(r=>r.path===module.path&&r.locale===locale);
   const doc=row?await api.cmsPage(row.id):null;const history=row?await api.cmsVersions(row.id):[];
   if(alive){setDoc(doc);setVersions(history)}
 }catch(e){if(alive){setError(e.message||'读取失败');setValue(null)}}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[kind,locale,user?.role,attempt]);
 useEffect(()=>{onWorkspaceDirtyChange?.(workspaceKey,dirty||busy);return()=>onWorkspaceDirtyChange?.(workspaceKey,false)},[dirty,busy,workspaceKey,onWorkspaceDirtyChange]);
 const patch=next=>{setValue(current=>({...current,...next}));setReview(false)};
 const save=async event=>{event?.preventDefault();if(!value||busy||loading)return;setBusy(true);setError('');setNotice('');try{
   const draft={...(page?.draft||page?.published||{blocks:[]}),siteShell:value};
   const updated=page?await api.saveCmsDraft(page.id,{revision:page.revision,draft,seo:page.draftSeo||page.publishedSeo||{}}):await api.createCmsPage({pageType:'shared_module',locale,path:module.path,name:module.name,draft,seo:{}});
   setDoc(updated);setNotice('草稿已保存，正式版本未改变。');
   setVersions(await api.cmsVersions(updated.id));
 }catch(e){setError(e.message||'保存失败')}finally{setBusy(false)}};
 const restore=async version=>{if(!page||busy||dirty)return;if(!window.confirm('载入历史版本为草稿？线上版本不变。'))return;setBusy(true);setError('');try{await api.restoreCmsVersionDraft(page.id,version,page.revision);setDoc(await api.cmsPage(page.id));setNotice('历史版本已恢复为草稿。')}catch(e){setError(e.message||'恢复失败')}finally{setBusy(false)}};
 if(user?.role!=='admin'||!module||!DESIGN_LOCALES.some(([code])=>code===locale))return <p role="alert">无有效编辑权限或模块。</p>;
 return <div className="udw-edit">
   <header className="udw-top"><div><h2>{module.name}</h2><small>{moduleId} · {DESIGN_LOCALES.find(([code])=>code===locale)?.[1]} · 全站共享</small></div><div className="udw-tabs"><button className="btn" onClick={onBack}>返回工作台</button><button className="btn" disabled={!value||busy||loading||(!dirty&&!!page)} onClick={save}>保存草稿</button><button className="btn primary" disabled={!page||dirty||busy||loading} onClick={()=>setReview(true)}>发布前检查</button></div></header>
   <div className="hint">{page?.publishedVersion?'正式 v'+page.publishedVersion:'尚未发布'}{dirty?' · 有未保存修改':''} · 当前编辑器仅开放草稿与历史恢复，正式发布将在真实预览与服务端校验接通后启用。</div>
   {error&&<p role="alert" className="error-text">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {loading?<p>正在读取…</p>:!value?<button className="btn" onClick={()=>setAttempt(n=>n+1)}>重新读取</button>:<>
   <form onSubmit={save}><fieldset disabled={busy} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
   {kind==='announcement'?<><label><input type="checkbox" checked={value.enabled} onChange={e=>patch({enabled:e.target.checked})}/> 启用营销公告栏</label><label className="udw-field">公告内容<input maxLength={300} value={value.text} onChange={e=>patch({text:e.target.value})}/></label><label className="udw-field">跳转链接<input maxLength={500} value={value.href} onChange={e=>patch({href:e.target.value})}/></label></>:<>
   <label className="udw-field">品牌文字（留空沿用系统默认）<input maxLength={kind==='header'?40:120} value={value.brand} onChange={e=>patch({brand:e.target.value})}/></label>
   {kind==='header'?<><p className="hint">购物车、账户、语言和系统导航为固定业务组件，不在此重复定义。</p><LinkFields rows={value.links} onChange={links=>patch({links})}/></>:<>
   <p className="hint">法定链接由系统保留；此处仅维护额外导航分组。</p>{value.groups.map((group,i)=><section className="udw-group" key={i}><label className="udw-field">分组名称<input maxLength={80} value={group.title} onChange={e=>patch({groups:value.groups.map((g,j)=>i===j?{...g,title:e.target.value}:g)})}/></label><LinkFields rows={group.links} onChange={links=>patch({groups:value.groups.map((g,j)=>i===j?{...g,links}:g)})}/><div><button className="btn small" type="button" onClick={()=>patch({groups:value.groups.filter((_,j)=>j!==i)})}>移除分组</button></div></section>)}<div><button className="btn small" type="button" disabled={value.groups.length>=6} onClick={()=>patch({groups:[...value.groups,{title:'',links:[]}]})}>新增分组</button></div></>}
   </>}
   </fieldset></form>
   <section className="udw-review"><h3>历史版本</h3>{versions.length?versions.map(v=><div className="udw-top" key={v.version}><span>v{v.version} · {v.label||'发布版本'} · {v.createdAt||''}</span><button className="btn small" disabled={busy||dirty} onClick={()=>void restore(v.version)}>载入为草稿</button></div>):<p className="hint">暂无历史发布版本</p>}</section>
   {review&&<section className="udw-review"><div className="udw-top"><h3>发布前检查 · 六项预览</h3><button className="btn primary" disabled title="真实草稿渲染及服务端确认未接通">确认发布</button></div><p role="status">草稿已保存。以下六项尚未执行真实页面预览，不允许标记为通过。</p><div className="udw-review-grid">{DESIGN_LOCALES.flatMap(([code,label])=>DESIGN_DEVICES.map(([device,name])=><div key={code+device}>{label} {name} · 待接入</div>))}</div></section>}
   </>}
 </div>
}
