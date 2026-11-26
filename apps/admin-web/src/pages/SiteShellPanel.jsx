import React,{useEffect,useState} from 'react';
import {api} from '../api.js';
const names={announcement:'营销公告栏',header:'顶部导航栏',footer:'底部页脚'};
const ids={announcement:'ALSVID-G01',header:'ALSVID-G02',footer:'ALSVID-G04'};
const locales=[['zh','中文'],['de','Deutsch'],['en','English']];
const empty=kind=>kind==='announcement'?{kind,enabled:false,text:'',href:''}:kind==='header'?{kind,brand:'',links:[]}:{kind,brand:'',groups:[]};
function LinkEditor({value=[],onChange,disabled}){
 const patch=(i,next)=>onChange(value.map((v,j)=>i===j?{...v,...next}:v));
 return <div>{value.map((v,i)=><div key={i} style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap'}}>
 <input aria-label="链接名称" placeholder="链接名称" value={v.label} maxLength={80} onChange={e=>patch(i,{label:e.target.value})} disabled={disabled}/>
 <input aria-label="链接地址" placeholder="/de/e-bikes 或 https://..." value={v.href} maxLength={500} onChange={e=>patch(i,{href:e.target.value})} disabled={disabled}/>
 <button type="button" className="btn small" disabled={disabled} onClick={()=>onChange(value.filter((_,j)=>i!==j))}>删除</button>
 </div>)}<button type="button" className="btn small" disabled={disabled||value.length>=12} onClick={()=>onChange([...value,{label:'',href:''}])}>＋ 添加链接</button></div>;
}
export default function SiteShellPanel({kind,onDirtyChange}){
 const [locale,setLocale]=useState('zh');
 return <ShellEditor key={kind+':'+locale} kind={kind} locale={locale} onLocale={setLocale} onDirtyChange={onDirtyChange}/>;
}
function ShellEditor({kind,locale,onLocale,onDirtyChange}){
 const path='/site-shell/'+kind;
 const [page,setPage]=useState(null),[value,setValue]=useState(empty(kind)),[baseline,setBaseline]=useState(JSON.stringify(empty(kind))),[versions,setVersions]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [loadFailed,setLoadFailed]=useState(false);
 const dirty=JSON.stringify(value)!==baseline;
 const patch=next=>setValue(v=>({...v,...next}));
 useEffect(()=>{onDirtyChange?.(dirty||busy);return()=>onDirtyChange?.(false);},[dirty,busy,onDirtyChange]);
 useEffect(()=>{let alive=true;(async()=>{
 try{
 const rows=await api.cmsPages({type:'shared_module',path,locale});
 if(!alive)return;
 const row=(Array.isArray(rows)?rows:[]).find(r=>r.path===path&&r.locale===locale);
 if(!row)return;
 const loaded=await api.cmsPage(row.id);
 if(!alive)return;
 const v=loaded.draft?.siteShell||loaded.published?.siteShell||empty(kind);
 setPage(loaded);setValue(v);setBaseline(JSON.stringify(v));
 const history=await api.cmsVersions(row.id);if(alive)setVersions(Array.isArray(history)?history:[]);
 }catch(e){if(alive){setError(e.message||'读取失败');setLoadFailed(true);}}finally{if(alive)setLoading(false);}
 })();return()=>{alive=false;};},[kind,locale,path]);
 async function save(){
 setBusy(true);setError('');setNotice('');
 try{
 const draft={blocks:[],siteShell:value};
 const updated=page?await api.saveCmsDraft(page.id,{revision:page.revision,draft,seo:page.draftSeo||page.publishedSeo||{}}):await api.createCmsPage({pageType:'shared_module',locale,path,name:names[kind],draft,seo:{}});
 const saved=updated.draft?.siteShell||value;
 setPage(updated);setValue(saved);setBaseline(JSON.stringify(saved));setNotice('草稿已保存，正式网站尚未改变。');
 }catch(e){setError(e.message||'保存失败');}finally{setBusy(false);}
 }
 async function publish(){
 if(!page||dirty||!window.confirm('发布后，当前语言所有官网页面的这个公共区域都会更新。继续？'))return;
 setBusy(true);setError('');setNotice('');
 try{const updated=await api.publishCmsPage(page.id,page.revision);setPage(updated);setNotice('发布接口已返回成功，请核验正式官网。');const rows=await api.cmsVersions(page.id);setVersions(Array.isArray(rows)?rows:[]);}catch(e){setError(e.message||'发布或读取版本失败');}finally{setBusy(false);}
 }
 async function restore(version){
 if(!page||!window.confirm('载入此历史版本为草稿？正式网站不会立即改变。'))return;
 setBusy(true);setError('');setNotice('');
 try{await api.restoreCmsVersionDraft(page.id,version,page.revision);const updated=await api.cmsPage(page.id);const v=updated.draft?.siteShell||empty(kind);setPage(updated);setValue(v);setBaseline(JSON.stringify(v));setNotice('历史版本已载入草稿。');}catch(e){setError(e.message||'恢复失败');}finally{setBusy(false);}
 }
 return <section className="sdw__panel" style={{padding:24,maxWidth:980}}>
 <h3>{names[kind]} · 全站共享</h3>
 <p className="hint">模块 ID：<code>{ids[kind]}</code> <button type="button" className="btn small" onClick={()=>navigator.clipboard.writeText(ids[kind]).then(()=>setNotice('模块 ID 已复制')).catch(()=>setError('复制失败，请手动选择编号'))}>复制 ID</button></p>
 <p className="hint">各语言独立发布；当前语言所有官网页面共用同一份配置。</p>
 <div className="sdw__locales">{locales.map(([code,label])=><button type="button" key={code} disabled={busy} className={'sdw__ltab'+(locale===code?' is-active':'')} onClick={()=>{if(code!==locale&&(!dirty||window.confirm('有未保存修改，仍要切换语言？')))onLocale(code);}}>{label}</button>)}</div>
 {loading?<p>正在读取配置…</p>:loadFailed?<p>无法读取配置，请重新打开此区域。</p>:<>
 <fieldset disabled={busy} style={{border:0,padding:0,margin:'20px 0'}}>
 {kind==='announcement'?<>
 <label className="sdp__check"><input type="checkbox" checked={value.enabled} onChange={e=>patch({enabled:e.target.checked})}/> 启用顶部营销公告栏（关闭后不占位置）</label>
 <label className="sdp__field">公告内容<input value={value.text} maxLength={300} onChange={e=>patch({text:e.target.value})}/></label>
 <label className="sdp__field">跳转链接<input value={value.href} maxLength={500} onChange={e=>patch({href:e.target.value})}/></label>
 </>:<>
 <label className="sdp__field">品牌文字（留空沿用系统默认）<input value={value.brand} maxLength={kind==='header'?40:120} onChange={e=>patch({brand:e.target.value})}/></label>
 {kind==='header'?<><p className="hint">保留系统的商品、试骑、购物车、账户和语言功能；可添加其他导航链接。</p><LinkEditor value={value.links} onChange={links=>patch({links})}/></>:<>
 <p className="hint">法定链接固定保留，不因装修被删除。</p>
 {value.groups.map((group,i)=><section key={i} className="sdp__module">
 <label className="sdp__field">导航组名称<input value={group.title} maxLength={80} onChange={e=>patch({groups:value.groups.map((g,j)=>i===j?{...g,title:e.target.value}:g)})}/></label>
 <LinkEditor value={group.links} onChange={links=>patch({groups:value.groups.map((g,j)=>i===j?{...g,links}:g)})}/>
 <button type="button" className="btn small" onClick={()=>patch({groups:value.groups.filter((_,j)=>j!==i)})}>删除导航组</button>
 </section>)}
 <button type="button" className="btn small" disabled={value.groups.length>=6} onClick={()=>patch({groups:[...value.groups,{title:'',links:[]}]})}>＋ 添加导航组</button>
 </>}
 </>}
 </fieldset>
 <div aria-label="当前配置示意" style={{border:'1px solid #ddd',padding:16,marginBottom:16}}>
 <p className="hint">配置示意（非真实前台预览）</p>
 {kind==='announcement'?value.enabled&&value.text?<div style={{background:'#202020',color:'#fff',textAlign:'center',padding:8}}>{value.text}</div>:<p>已隐藏 · 不占页面空间</p>:kind==='header'?<div><strong>{value.brand||'ALSVID'}</strong>　{value.links.map((v,i)=><span key={i}>{v.label}　</span>)}</div>:<div><strong>{value.brand||'ALSVID'}</strong><div style={{display:'flex',gap:24,flexWrap:'wrap'}}>{value.groups.map((g,i)=><div key={i}><b>{g.title}</b>{g.links.map((v,j)=><p key={j}>{v.label}</p>)}</div>)}</div></div>}
 </div>
 <div className="sdp__bar"><span>{page?.publishedVersion?'线上 v'+page.publishedVersion:'尚未发布'}{dirty?' · 有未保存修改':''}</span><button type="button" className="btn small" disabled={busy||(!dirty&&!!page)} onClick={save}>保存草稿</button><button type="button" className="btn small primary" disabled={busy||dirty||!page} onClick={publish}>发布</button></div>
 {!!versions.length&&<details><summary>发布历史</summary>{versions.map(v=><p key={v.version}>v{v.version}　{v.label||''}　<button type="button" className="btn small" disabled={busy} onClick={()=>restore(v.version)}>载入为草稿</button></p>)}</details>}
 </>}
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error-text">{error}</p>}
 </section>;
}
