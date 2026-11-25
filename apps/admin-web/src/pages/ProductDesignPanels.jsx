import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { createBlock } from './cms-blocks.jsx';

// 产品装修面板：
// - CatalogLayoutPanel：「全部产品」列表页版式（分类导航 + 按销量自动展示），存 product_template 页草稿，走 CMS 发布流。
// - StandardDetailPanel：「商品详情页（图文）」按商品维护 ① 主图 + P04 图文详情，走商品发布流。
// - GlobalModulesPanel：「商品详情页（公共模块）」②营销 ③④预留 ⑥评价 ⑦退换货 ⑧其他，存 product_template 页草稿，更新 1 处全部商品生效。

// 营销/预留模块默认值：三种标准样式共用一套内容 + 显示样式字段，与 server 端保持一致
const BANNER_DEFAULT = {
  enabled: false, style: 'banner', imageId: '', title: '', description: '', buttonText: '', href: '', text: '',
  theme: { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' },
};
const DEFAULT_MODULES = {
  marketing: { ...BANNER_DEFAULT },
  reserved3: { ...BANNER_DEFAULT, theme: { ...BANNER_DEFAULT.theme } },
  reserved4: { ...BANNER_DEFAULT, theme: { ...BANNER_DEFAULT.theme } },
  reviews: { enabled: true, limit: 20, style: 'list' },
  returns: { enabled: false, title: '', body: '' },
  other: { enabled: false, title: '', body: '' },
};

// 读取 product_template 页面草稿并维护本地副本 + 乐观锁 revision。
// 公共模块把它提升到工作区层调用：保存/发布/发布记录要统一放在顶部动作条，
// 状态留在面板里的话，父级拿不到 dirty，按钮就没法点亮。
export function useCmsDocument(row, enabled = true) {
  const [page, setPage] = useState(null);
  const [doc, setDoc] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!row || !enabled) return undefined;
    let alive = true;
    setDoc(null); setError('');
    api.cmsPage(row.id).then(p => {
      if (!alive) return;
      const document = p.draft || p.published || { blocks: [], productLayout: {}, modules: {}, catalogLayout: null };
      const clone = JSON.parse(JSON.stringify(document));
      setPage(p); setDoc(clone); setBaseline(JSON.stringify(clone)); setRevision(p.revision);
    }).catch(e => { if (alive) setError(e.message || '读取页面草稿失败'); });
    return () => { alive = false; };
  }, [row && row.id, enabled]);
  useEffect(load, [load]);
  const dirty = Boolean(doc) && JSON.stringify(doc) !== baseline;
  const save = async () => {
    if (!row || busy || !doc) return null;
    setBusy(true); setError('');
    try {
      const seo = page?.draftSeo && (page.draftSeo.title || page.draftSeo.description) ? page.draftSeo : page?.publishedSeo || {};
      const updated = await api.saveCmsDraft(row.id, { draft: doc, seo, revision });
      setRevision(updated.revision); setPage(updated);
      const saved = updated.draft || doc;
      setDoc(current => JSON.stringify(current) === JSON.stringify(doc) ? saved : current);
      setBaseline(JSON.stringify(saved));
      return updated;
    } catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
    return null;
  };
  const publish = async () => {
    if (!row || busy || !doc || dirty) { if (dirty) setError('请先保存草稿，再发布'); return null; }
    setBusy(true); setError('');
    try { const updated = await api.publishCmsPage(row.id, revision); setPage(updated); setRevision(updated.revision); return updated; }
    catch (e) { setError(e.message || '发布失败'); } finally { setBusy(false); }
    return null;
  };
  return { page, doc, setDoc, dirty, busy, error, save, publish, reload: load };
}

function SaveBar({ dirty, busy, error, onSave, onPublish, publishedVersion, hint }) {
  return <div className="sdp__bar">
    <span className="sdp__status">{publishedVersion ? `线上版本 v${publishedVersion}` : '尚未发布'}{dirty ? ' · 有未保存修改' : ''}</span>
    <button type="button" className="btn small" disabled={!dirty || busy} onClick={onSave}>{busy ? '处理中…' : '保存草稿'}</button>
    <button type="button" className="btn small primary" disabled={busy || dirty} onClick={onPublish}>发布</button>
    {hint && <span className="hint">{hint}</span>}
    {error && <span className="error-text">{error}</span>}
  </div>;
}

// 素材库图片选择（营销横幅 / 预留位 / 图文详情共用）
function AssetImageSelect({ assets, value, onChange, placeholder = '从素材库选择图片' }) {
  return <label className="sdp__field">图片
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.label || asset.fileName || asset.id}</option>)}
    </select>
  </label>;
}

// 营销组件：三种标准样式（不做自由拖拽），内容 + 显示样式统一
const MARKET_STYLES = [
  ['banner', '横幅广告', '整图铺满，文案在下方'],
  ['imageText', '图片 + 文案', '左图右文，带按钮'],
  ['promoBar', '促销信息条', '细横条，文字 + 按钮'],
];
const THEME_OPTIONS = {
  background: [['none', '透明'], ['soft', '浅色底'], ['dark', '深色底']],
  spacing: [['compact', '紧凑'], ['normal', '标准'], ['loose', '宽松']],
  imageRatio: [['wide', '宽图 16:9'], ['square', '方图 1:1'], ['auto', '原图比例']],
  buttonStyle: [['solid', '实心按钮'], ['outline', '描边按钮'], ['text', '文字链接']],
};
// 多语言：营销内容按语言分别落库（每个语言一条 product_template 记录），
// 这里只负责在编辑区就地切换，省得用户来回跑去顶部工具条。
const LOCALE_TABS = [['zh', '中文'], ['de', 'Deutsch'], ['en', 'English']];

// 样式缩略：直接用当前模块的真实图片与文案渲染三种版式，
// 选之前就能看到「选完长什么样」，比灰色占位条有说服力。
function StyleThumb({ styleKey, module }) {
  const src = module.imageId ? api.assetUrl(module.imageId) : '';
  const title = module.title || module.text || '标题预览';
  const desc = module.description || '';
  const button = module.buttonText || '';
  const media = <span className="sdpv__media">{src ? <img src={src} alt=""/> : <i className="sdpv__ph" aria-hidden="true"/>}</span>;
  if (styleKey === 'promoBar') return <div className="sdpv sdpv--bar">
    <b>{title}</b>{desc && <i>{desc}</i>}{button && <em>{button}</em>}
  </div>;
  if (styleKey === 'imageText') return <div className="sdpv sdpv--split">
    {media}
    <span className="sdpv__copy"><b>{title}</b>{desc && <i>{desc}</i>}{button && <em>{button}</em>}</span>
  </div>;
  return <div className="sdpv sdpv--banner">
    {media}
    <span className="sdpv__copy"><b>{title}</b>{desc && <i>{desc}</i>}{button && <em>{button}</em>}</span>
  </div>;
}

function MarketingEditor({ title, note, value, assets, locale, onChange, onSwitchLocale }) {
  const module = { ...BANNER_DEFAULT, ...(value || {}) };
  const theme = { ...BANNER_DEFAULT.theme, ...(module.theme || {}) };
  const patch = next => onChange({ ...module, ...next });
  const patchTheme = next => patch({ theme: { ...theme, ...next } });
  return <section className="sdp__module">
    <header><strong>{title}</strong>{note && <span className="hint">{note}</span>}</header>
    <label className="sdp__check"><input type="checkbox" checked={module.enabled} onChange={e => patch({ enabled: e.target.checked })}/> 启用</label>
    {module.enabled && <>
      <div className="sdp__group">选择模块样式</div>
      <div className="sdp__styles">
        {MARKET_STYLES.map(([key, label, desc]) => <button type="button" key={key} className={'sdp__style' + (module.style === key ? ' is-active' : '')} onClick={() => patch({ style: key })}>
          <StyleThumb styleKey={key} module={module}/>
          <span className="sdp__style-label"><b>{label}</b><small>{desc}</small></span>
        </button>)}
      </div>
      <div className="sdp__group">营销内容</div>
      <AssetImageSelect assets={assets} value={module.imageId} onChange={imageId => patch({ imageId })}/>
      {module.imageId && <img className="sdp__thumb" src={api.assetUrl(module.imageId)} alt=""/>}
      <label className="sdp__field">标题<input value={module.title} maxLength={120} placeholder="如 Discover Your Freedom" onChange={e => patch({ title: e.target.value })}/></label>
      <label className="sdp__field">描述<textarea rows={2} maxLength={400} value={module.description} placeholder="一句话说明，可留空" onChange={e => patch({ description: e.target.value })}/></label>
      <label className="sdp__field">按钮文字<input value={module.buttonText} maxLength={40} placeholder="如 了解详情，留空则不显示" onChange={e => patch({ buttonText: e.target.value })}/></label>
      <label className="sdp__field">跳转链接<input value={module.href} maxLength={500} placeholder="/www/zh/products/… 或 https://…" onChange={e => patch({ href: e.target.value })}/></label>
      <div className="sdp__group">显示样式</div>
      <div className="sdp__grid2">
        <label className="sdp__field">背景<select value={theme.background} onChange={e => patchTheme({ background: e.target.value })}>{THEME_OPTIONS.background.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sdp__field">间距<select value={theme.spacing} onChange={e => patchTheme({ spacing: e.target.value })}>{THEME_OPTIONS.spacing.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sdp__field">图片比例<select value={theme.imageRatio} onChange={e => patchTheme({ imageRatio: e.target.value })}>{THEME_OPTIONS.imageRatio.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sdp__field">按钮<select value={theme.buttonStyle} onChange={e => patchTheme({ buttonStyle: e.target.value })}>{THEME_OPTIONS.buttonStyle.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="sdp__group">多语言</div>
      <div className="sdp__locales">
        {LOCALE_TABS.map(([code, label]) => <button type="button" key={code}
          className={'sdp__locale' + (code === locale ? ' is-active' : '')}
          onClick={() => onSwitchLocale?.(code)}>
          {label}{code === locale && <small>当前</small>}
        </button>)}
      </div>
      <p className="hint">每个语言各自保存一份营销内容，切换后编辑的就是该语言的草稿；当前为 {locale}。</p>
    </>}
  </section>;
}

const P03_DEFAULTS = ["@weight","@range","@frame","@folded"];
const P03_LABELS = {'@weight':'整车重量','@range':'续航里程','@frame':'车架材质','@folded':'折叠尺寸'};
function PerformanceEditor({value, fields, fieldError, assets, onChange}) {
  const config = {showParameters:true,fieldCodes:P03_DEFAULTS,mediaType:'image',imageId:'',videoId:'',headline:'',alignment:'center',...(value||{})};
  const [videos,setVideos] = useState([]);
  const [videoError,setVideoError] = useState('');
  useEffect(()=>{let alive=true;api.assetsAll({category:'page',kind:'video'}).then(rows=>{if(alive)setVideos(Array.isArray(rows)?rows:[])}).catch(e=>{if(alive)setVideoError(e.message||'读取视频素材失败')});return()=>{alive=false}},[]);
  const patch = next => onChange({...config,...next});
  const options = [...P03_DEFAULTS.map(code=>({code,nameZh:P03_LABELS[code]+'（默认匹配）'})), ...fields];
  return <section className="sdp__module"><header><strong>P01-02 四项核心参数</strong><span className="hint">固定四项 · 可替换字段</span></header>
    <label className="sdp__field">媒体类型<select value={config.mediaType} onChange={e=>patch({mediaType:e.target.value})}><option value="image">图片</option><option value="video">视频</option></select></label>
    {config.mediaType==='image'?<AssetImageSelect assets={assets} value={config.imageId} onChange={imageId=>patch({imageId})}/>:<label className="sdp__field">视频<select value={config.videoId} onChange={e=>patch({videoId:e.target.value})}><option value="">从素材库选择视频</option>{videos.map(v=><option key={v.id} value={v.id}>{v.label||v.fileName||v.id}</option>)}</select>{videoError&&<span className="error-text">{videoError}</span>}</label>}
    <label className="sdp__field">主文案<input maxLength={180} value={config.headline} onChange={e=>patch({headline:e.target.value})}/></label>
    <label className="sdp__field">文字位置<select value={config.alignment} onChange={e=>patch({alignment:e.target.value})}><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label>
    <label className="sdp__check"><input type="checkbox" checked={config.showParameters} onChange={e=>patch({showParameters:e.target.checked})}/> 显示核心参数</label>
    {config.showParameters&&<>{config.fieldCodes.map((code,i)=><label key={i} className="sdp__field">参数 {i+1}<select value={code} onChange={e=>patch({fieldCodes:config.fieldCodes.map((x,j)=>j===i?e.target.value:x)})}>{!options.some(f=>f.code===code)&&<option value={code}>{code}（字段不可用）</option>}{options.map(f=><option key={f.code} value={f.code} disabled={config.fieldCodes.some((x,j)=>j!==i&&x===f.code)}>{f.nameZh||f.code}{f.unit?' · '+f.unit:''}</option>)}</select></label>)}<button type="button" className="btn small" onClick={()=>patch({fieldCodes:P03_DEFAULTS})}>恢复默认四项</button>{fieldError&&<p className="error-text">{fieldError}</p>}<p className="hint">仅引用已公开的整车参数，数值和单位来自主档；默认字段无法唯一匹配或未填写时，官网不显示该项。可以选实际字段明确绑定。</p></>}
  </section>;
}
function CopyEditor({ title, value, onChange, defaultTitle }) {
  const module = { enabled: false, title: '', body: '', ...(value || {}) };
  const patch = next => onChange({ ...module, ...next });
  return <section className="sdp__module">
    <header><strong>{title}</strong></header>
    <label className="sdp__check"><input type="checkbox" checked={module.enabled} onChange={e => patch({ enabled: e.target.checked })}/> 启用</label>
    {module.enabled && <>
      <label className="sdp__field">栏目标题<input value={module.title} maxLength={180} placeholder={defaultTitle} onChange={e => patch({ title: e.target.value })}/></label>
      <label className="sdp__field">正文<textarea rows={4} maxLength={4000} value={module.body} onChange={e => patch({ body: e.target.value })}/></label>
    </>}
  </section>;
}

export function CatalogLayoutPanel({ row, locale, products, publishedMap, onPublished, notify }) {
  const { doc, setDoc, dirty, busy, error, save, publish } = useCmsDocument(row);
  if (!doc) return <p className="sdw__tip">{error || '正在读取版式配置…'}</p>;
  const enabled = doc.catalogLayout != null;
  const layout = doc.catalogLayout || { sort: 'sales', categories: [] };
  const patch = next => setDoc({ ...doc, catalogLayout: next });
  const publishedVehicles = products.filter(p => p.kind === 'vehicle' && p.status === '启用' && publishedMap.has(p.id));
  const doSave = async () => { if (await save()) notify('列表页版式草稿已保存'); };
  const doPublish = async () => { if (await publish()) { notify('列表页版式已发布'); onPublished?.(); } };
  return <div className="sdp">
    <SaveBar dirty={dirty} busy={busy} error={error} onSave={doSave} onPublish={doPublish} publishedVersion={row.publishedVersion}/>
    <section className="sdp__module">
      <header><strong>启用装修版式</strong></header>
      <label className="sdp__check"><input type="checkbox" checked={enabled} onChange={e => patch(e.target.checked ? { sort: 'sales', categories: [] } : null)}/> 分类导航 + 产品自动展示</label>
      <label className="sdp__field">展示顺序
        <select value={layout.sort} disabled={!enabled} onChange={e => patch({ ...layout, sort: e.target.value })}>
          <option value="sales">按销量</option>
          <option value="default">默认顺序</option>
        </select>
      </label>
    </section>
    {enabled && <section className="sdp__module">
      <header><strong>分类导航</strong><span className="hint">最多 20 个</span></header>
      {layout.categories.map((category, index) => <div className="sdp__category" key={index}>
        <div className="sdp__category-head">
          <input value={category.name} maxLength={80} placeholder="分类名称" onChange={e => patch({ ...layout, categories: layout.categories.map((row, i) => i === index ? { ...row, name: e.target.value } : row) })}/>
          <button type="button" className="btn small" disabled={busy} onClick={() => patch({ ...layout, categories: layout.categories.filter((_, i) => i !== index) })}>删除</button>
        </div>
        <select multiple size={6} value={category.productIds} onChange={e => patch({ ...layout, categories: layout.categories.map((row, i) => i === index ? { ...row, productIds: [...e.target.selectedOptions].map(o => o.value) } : row) })}>
          {publishedVehicles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!publishedVehicles.length && <p className="hint">当前语言（{locale}）暂无已发布整车，先去「商品列表」发布商品。</p>}
      </div>)}
      <button type="button" className="btn small" disabled={layout.categories.length >= 20} onClick={() => patch({ ...layout, categories: [...layout.categories, { name: '', productIds: [] }] })}>＋ 添加分类</button>
    </section>}
  </div>;
}

function SceneFields({row,onChange,images,videos,visual=false}) {
 const patch=next=>onChange({...row,...next});
 const select=(key,label,options,fallback)=> <label className="sdp__field">{label}<select value={row[key]??fallback} onChange={e=>patch({[key]:e.target.value})}>{options.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>;
 const asset=(key,label,rows)=> <label className="sdp__field">{label}<select value={row[key]||''} onChange={e=>patch({[key]:e.target.value})}><option value="">请选择素材</option>{rows.map(x=><option key={x.id} value={x.id}>{x.label||x.fileName||x.id}</option>)}</select></label>;
 const number=(key,label,min,max,fallback)=> <label className="sdp__field">{label}<input type="number" min={min} max={max} value={row[key]??fallback} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>;
 return <div className="sdp__grid2">
 {visual&&select('mediaType','媒体类型',[['image','图片'],['video','视频']],'image')}
 {(visual?row.mediaType||'image':row.type)==='image'&&asset('imageId','图片素材',images)}
 {(visual?row.mediaType:row.type)==='video'&&asset('videoId','视频素材',videos)}
 <label className="sdp__field">标题<input value={row.title||''} onChange={e=>patch({title:e.target.value})}/></label><label className="sdp__field">副标题<input value={row.subtitle||''} onChange={e=>patch({subtitle:e.target.value})}/></label>
 <label className="sdp__field">介绍文字<textarea value={row.type==='text'?row.text||'':row.caption||''} onChange={e=>patch(row.type==='text'?{text:e.target.value}:{caption:e.target.value})}/></label>
 {select('background','背景',[['inherit','继承'],['solid','纯色'],['gradient','渐变'],['image','背景图片']],'inherit')}
 {['solid','gradient'].includes(row.background)&&<label className="sdp__field">背景颜色<input type="color" value={row.backgroundColor||'#171717'} onChange={e=>patch({backgroundColor:e.target.value})}/></label>}
 {row.background==='gradient'&&<label className="sdp__field">渐变颜色<input type="color" value={row.backgroundEnd||'#303030'} onChange={e=>patch({backgroundEnd:e.target.value})}/></label>}
 {row.background==='image'&&asset('backgroundImageId','背景图片',images)}
 <label className="sdp__field">文字颜色<input type="color" value={row.textColor||'#ffffff'} onChange={e=>patch({textColor:e.target.value})}/></label>
 {number('fontSize','字号',20,100,48)}
 {select('textPosition','文字位置',[['top-left','左上'],['top-center','中上'],['top-right','右上'],['center-left','左中'],['center','居中'],['center-right','右中'],['bottom-left','左下'],['bottom-center','中下'],['bottom-right','右下']],'bottom-center')}
 {select('mediaPosition','素材位置',[['left','左'],['center','中'],['right','右'],['top','上'],['bottom','下']],'center')}
 {select('fit','素材比例',[['cover','全屏铺满'],['contain','完整显示透明图']],'cover')}
 {number('scale','素材缩放 %',50,150,100)}
 {select('animation','滚动动画',[['fade','渐入'],['zoom-in','放大'],['zoom-out','缩小'],['slide','平移'],['focus','聚焦'],['sticky','滚动固定'],['none','无']],'fade')}
 {number('trigger','触发位置 %',0,80,20)}{number('duration','动画时间 ms',100,2000,600)}{number('hold','滚动停留距离 vh',0,200,0)}
 <label className="sdp__check"><input type="checkbox" checked={!!row.scrollLinked} onChange={e=>patch({scrollLinked:e.target.checked})}/> 与滚动进度联动</label>
 </div>;
}

export function StandardDetailPanel({ locale, products, publishedMap, productId }) {
  const [listing, setListing] = useState(null);
  const [doc, setDoc] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assets, setAssets] = useState([]);
  const [videos,setVideos]=useState([]);
  useEffect(()=>{let alive=true;api.assetsAll({category:'page',kind:'video'}).then(rows=>{if(alive)setVideos(Array.isArray(rows)?rows:[])}).catch(()=>{});return()=>{alive=false}},[]);
  const product = products.find(p => p.id === productId);
  useEffect(() => { api.assetsAll({ category: 'page', kind: 'image' }).then(rows => setAssets(Array.isArray(rows) ? rows : [])).catch(() => setAssets([])); }, []);
  useEffect(() => {
    if (!productId) { setListing(null); setDoc(null); return undefined; }
    let alive = true;
    setLoading(true); setError(''); setListing(null); setDoc(null);
    api.productListings(productId).then(rows => {
      if (!alive) return;
      const website = (rows || []).find(row => row.channel === 'website') || null;
      setListing(website);
      const document = website ? (website.draft || website.published) : null;
      if (document) { const clone = JSON.parse(JSON.stringify(document)); setDoc(clone); setBaseline(JSON.stringify(clone)); setRevision(website.revision); }
    }).catch(e => { if (alive) setError(e.message || '读取商品失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId]);
  if (!productId) return <p className="sdw__tip">先在左侧选择要装修的商品。</p>;
  if (loading) return <p className="sdw__tip">正在读取商品发布内容…</p>;
  if (error) return <p className="error-text" role="alert">{error}</p>;
  if (!listing) return <p className="sdw__tip">该商品还没有官网发布记录，请先在「商品列表」发布。</p>;
  if (!doc) return <p className="sdw__tip">该商品还没有内容草稿，请先在「商品列表」完善。</p>;
  const dirty = JSON.stringify(doc) !== baseline;
  const localeDoc = doc.languages?.[locale];
  const mediaIds = doc.mediaIds || [];
  const patchMedia = next => setDoc({ ...doc, mediaIds: next });
  const patchDetail = next => setDoc({ ...doc, languages: { ...doc.languages, [locale]: { ...localeDoc, detailBlocks: next } } });
  const design={purchaseVisible:true,coreVisible:true,background:'#eaeae6',visibility:{},faq:[],...(localeDoc?.design||{})};
  const patchDesign=next=>setDoc({...doc,languages:{...doc.languages,[locale]:{...localeDoc,design:{...design,...next}}}});
  const toggleVisibility=(id,checked)=>patchDesign({visibility:{...design.visibility,[id]:checked}});
  const doSave = async () => {
    setBusy(true); setError('');
    try { const updated = await api.saveListing(listing.id, { channel: listing.channel, slug: listing.slug, document: doc, skus: listing.skus, revision }); setRevision(updated.revision); setBaseline(JSON.stringify(doc)); }
    catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
  };
  const doPublish = async () => {
    setBusy(true); setError('');
    try {
      if (dirty) { const updated = await api.saveListing(listing.id, { channel: listing.channel, slug: listing.slug, document: doc, skus: listing.skus, revision }); setRevision(updated.revision); setBaseline(JSON.stringify(doc)); await api.publishListing(listing.id, updated.revision); }
      else await api.publishListing(listing.id, revision);
      const rows = await api.productListings(productId);
      const website = (rows || []).find(row => row.channel === 'website');
      if (website) { setListing(website); setRevision(website.revision); const clone = JSON.parse(JSON.stringify(website.draft || website.published || {})); setDoc(clone); setBaseline(JSON.stringify(clone)); }
    } catch (e) { setError(e.message || '发布失败'); } finally { setBusy(false); }
  };
  const detailBlocks = localeDoc?.detailBlocks || [];
  const productImages = product?.images || [];
  // 主图与图文详情共用同一份商品素材库，但顺序各管各的：
  // mediaIds 决定主图顺序（第一张是封面），detailBlocks 里的 imageId 只决定详情段落顺序。
  const poolImages = productImages.filter(image => !mediaIds.includes(image.id));
  const imageLabel = id => {
    const found = productImages.find(image => image.id === id);
    return found?.label || '未命名图片';
  };
  const setCover = index => {
    if (index <= 0) return;
    const next = [...mediaIds];
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    patchMedia(next);
  };
  const moveMedia = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= mediaIds.length) return;
    const next = [...mediaIds];
    [next[index], next[target]] = [next[target], next[index]];
    patchMedia(next);
  };
  const blockImageOptions = [...productImages.map((image, index) => ({ id: image.id, label: `商品图 ${index + 1}${image.label ? ` · ${image.label}` : ''}` })), ...assets.map(asset => ({ id: asset.id, label: `素材库 · ${asset.label || asset.fileName || asset.id}` }))];
  const imagePreview = id => productImages.some(image => image.id === id) ? `/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(id)}` : api.assetUrl(id);
  return <div className="sdp">
    <SaveBar dirty={dirty} busy={busy} error={error} onSave={doSave} onPublish={doPublish} publishedVersion={listing.published ? 1 : null}/>
    <section className="sdp__module sdp__gallery">
      <header className="sdg__head">
        <div className="sdg__head-main">
          <strong>① 商品主图 / 图片图库</strong>
          <p className="hint">固定位置，第一张作为商品封面，PC 与移动端共用</p>
        </div>
        <span className="sdg__count">{mediaIds.length} 张已选</span>
      </header>

      {!mediaIds.length && <div className="sdg__empty">
        <strong>当前商品还没有选择主图</strong>
        <p>图片在「产品研发 → 素材」维护；这里只保存引用和展示顺序，不重复上传原图。</p>
      </div>}

      {mediaIds.length > 0 && <div className="sdg__grid">
        {mediaIds.map((id, index) => <article className="sdg__card" key={id}>
          <div className="sdg__thumb">
            <img src={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(id)}`} alt={imageLabel(id)} loading="lazy"/>
            {index === 0 && <span className="sdg__cover">商品封面</span>}
            <span className="sdg__no">{String(index + 1).padStart(2, '0')}</span>
          </div>
          <div className="sdg__meta" title={imageLabel(id)}>{imageLabel(id)}</div>
          <div className="sdg__ops">
            {index !== 0 && <button type="button" onClick={() => setCover(index)}>设为封面</button>}
            <button type="button" aria-label="前移" disabled={index === 0} onClick={() => moveMedia(index, -1)}>↑</button>
            <button type="button" aria-label="后移" disabled={index === mediaIds.length - 1} onClick={() => moveMedia(index, 1)}>↓</button>
            <button type="button" className="sdg__remove" onClick={() => patchMedia(mediaIds.filter(item => item !== id))}>移除</button>
          </div>
        </article>)}
      </div>}

      <div className="sdg__pool">
        <div className="sdg__pool-head">
          <strong>从商品素材库添加</strong>
          <span className="hint">{poolImages.length ? `还有 ${poolImages.length} 张未使用` : '商品图片已全部加入'}</span>
        </div>
        {poolImages.length > 0 && <div className="sdg__pool-grid">
          {poolImages.map(image => <button type="button" key={image.id} className="sdg__pool-item" onClick={() => patchMedia([...mediaIds, image.id])} title={`加入主图：${image.label || '未命名图片'}`}>
            <img src={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(image.id)}`} alt="" loading="lazy"/>
            <span aria-hidden="true">＋</span>
          </button>)}
        </div>}
        {!poolImages.length && !productImages.length && <p className="hint">该商品在产品研发里还没有图片，先去「产品研发 → 素材」上传。</p>}
      </div>

      <p className="sdg__tip">只保存素材引用与展示顺序，不会删除原始素材，也不影响 SKU 与库存。</p>
    </section>
    {localeDoc&&<>
      <section className="sdp__module"><header><strong>P01-01 车型选配</strong><span className="hint">产品取数</span></header><label className="sdp__check"><input type="checkbox" checked={design.purchaseVisible} onChange={e=>patchDesign({purchaseVisible:e.target.checked})}/>详情页显示车型选配</label><label className="sdp__check"><input type="checkbox" checked={design.coreVisible} onChange={e=>patchDesign({coreVisible:e.target.checked})}/>P01-02 显示四项参数</label><label className="sdp__field">选配与核心参数背景<input type="color" value={design.background} onChange={e=>patchDesign({background:e.target.value})}/></label></section>
      <section className="sdp__module"><header><strong>P02 商品主视觉与营销</strong><span className="hint">车型独立装修</span></header><label className="sdp__check"><input type="checkbox" checked={design.visibility.P02!==false} onChange={e=>toggleVisibility('P02',e.target.checked)}/> 显示</label><SceneFields visual row={design.visual||{mediaType:'image',imageId:mediaIds[0]||'',title:localeDoc.title}} images={blockImageOptions} videos={videos} onChange={visual=>patchDesign({visual})}/><label className="sdp__check"><input type="checkbox" checked={!!design.visual?.marketingEnabled} onChange={e=>patchDesign({visual:{mediaType:'image',imageId:mediaIds[0]||'',...design.visual,marketingEnabled:e.target.checked}})}/> 启用营销</label>{design.visual?.marketingEnabled&&<><label className="sdp__field">营销文案<input value={design.visual.marketingText||''} onChange={e=>patchDesign({visual:{...design.visual,marketingText:e.target.value}})}/></label><label className="sdp__field">购买按钮<input value={design.visual.buttonText||''} onChange={e=>patchDesign({visual:{...design.visual,buttonText:e.target.value}})}/></label></>}</section>
      <section className="sdp__module"><header><strong>P04 沉浸式产品详情</strong><span className="hint">车型独立装修</span></header>
      <p className="hint">首个子模块建议全幅整车图。子模块支持透明素材、文字叠加、滚动交互；最多 200 段。</p>
      <label className="sdp__check"><input type="checkbox" checked={design.visibility.P04!==false} onChange={e=>toggleVisibility('P04',e.target.checked)}/> 显示</label>
      {detailBlocks.map((block,index)=><section className="sdp__module" key={index} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',String(index))} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const raw=e.dataTransfer.getData('text/plain');if(!raw)return;const from=Number(raw);if(!Number.isInteger(from)||from<0||from>=detailBlocks.length||from===index)return;const next=[...detailBlocks];next.splice(index,0,next.splice(from,1)[0]);patchDetail(next)}}>
        <header><strong>P04-{String(index+1).padStart(2,'0')} · {block.type==='video'?'视频':block.type==='image'?'全幅图':'文字'}</strong><span className="hint">拖拽排序</span></header>
        <label className="sdp__check"><input type="checkbox" checked={!block.hidden} onChange={e=>patchDetail(detailBlocks.map((x,i)=>i===index?{...x,hidden:!e.target.checked}:x))}/> 显示</label>
        <SceneFields row={block} images={blockImageOptions} videos={videos} onChange={next=>patchDetail(detailBlocks.map((x,i)=>i===index?next:x))}/>
        <div className="sdp__block-ops"><button type="button" className="btn small" disabled={index===0} onClick={()=>{const n=[...detailBlocks];[n[index-1],n[index]]=[n[index],n[index-1]];patchDetail(n)}}>↑</button><button type="button" className="btn small" disabled={index===detailBlocks.length-1} onClick={()=>{const n=[...detailBlocks];[n[index],n[index+1]]=[n[index+1],n[index]];patchDetail(n)}}>↓</button><button type="button" className="btn small" disabled={detailBlocks.length>=200} onClick={()=>patchDetail([...detailBlocks.slice(0,index+1),{...block},...detailBlocks.slice(index+1)])}>复制</button><button type="button" className="btn small" onClick={()=>patchDetail(detailBlocks.filter((_,i)=>i!==index))}>删除</button></div>
      </section>)}
      <div className="sdp__block-add"><button type="button" className="btn small" disabled={detailBlocks.length>=200||!blockImageOptions.length} onClick={()=>patchDetail([...detailBlocks,{type:'image',imageId:blockImageOptions[0].id,fit:'cover'}])}>＋ 图片</button><button type="button" className="btn small" disabled={detailBlocks.length>=200||!videos.length} onClick={()=>patchDetail([...detailBlocks,{type:'video',videoId:videos[0].id}])}>＋ 视频</button><button type="button" className="btn small" disabled={detailBlocks.length>=200} onClick={()=>patchDetail([...detailBlocks,{type:'text',text:''}])}>＋ 文字</button></div></section>
      {[['P05','完整技术参数'],['P06','包装清单'],['P07','产品下载'],['P08','常见问题'],['P09','售后保障'],['P10','配送服务']].map(([id,name])=><section className="sdp__module" key={id}><header><strong>{id} {name}</strong><span className="hint">{id==='P08'?'车型独立配置':'产品取数'}</span></header><label className="sdp__check"><input type="checkbox" checked={design.visibility[id]!==false} onChange={e=>toggleVisibility(id,e.target.checked)}/> 显示</label>
      {id==='P08'?<>{design.faq.map((item,i)=><div key={i}><label className="sdp__field">问题<input value={item.question} onChange={e=>patchDesign({faq:design.faq.map((x,j)=>j===i?{...x,question:e.target.value}:x)})}/></label><label className="sdp__field">回答<textarea value={item.answer} onChange={e=>patchDesign({faq:design.faq.map((x,j)=>j===i?{...x,answer:e.target.value}:x)})}/></label><button className="btn small" type="button" onClick={()=>patchDesign({faq:design.faq.filter((_,j)=>j!==i)})}>删除</button></div>)}<button className="btn small" type="button" disabled={design.faq.length>=50} onClick={()=>patchDesign({faq:[...design.faq,{question:'',answer:''}]})}>＋ 问题</button></>:id==='P09'||id==='P10'?<p className="hint">读取当前商品的{id==='P09'?'质保':'配送'}资料：{(id==='P09'?localeDoc.warranty:localeDoc.delivery)||'尚未填写，请在商品资料维护'}</p>:<p className="hint">{id==='P05'?'读取整车主档公开参数':id==='P06'?'读取整车主档包装字段；未匹配则隐藏':'读取车型关联、已公开发布的 PDF 文件'}</p>}
      </section>)}
    </>}

  </div>;
}

// 公共模块的 8 个固定模块：序号、名称、是否属于全局装修
const GLOBAL_MODULES = [
  ['productNavigation', '00', '商品专属导航栏'],
  ['info', '01', '车型选配与核心参数'],
  ['marketing', '02', '商品主视觉与营销'],
  ['detail', '04', '沉浸式产品详情'],
  ['specifications', '05', '完整技术参数'],
  ['packaging', '06', '包装清单'],
  ['downloads', '07', '产品下载'],
  ['faq', '08', '常见问题'],
  ['warranty', '09', '售后保障'],
  ['delivery', '10', '配送服务'],
  ['reviews', '11', '用户评价'],
  ['returns', '12', '退换货'],
  ['other', '13', '其他说明'],
];

// 每个模块在编辑区顶部的定位说明 + 预览侧是否有对应区块（决定点击能否真的滚过去）
const MODULE_META = {
  productNavigation: { desc:'整车详情页单行吸顶导航；PC 与手机共用', anchor:()=>false },
  info: { desc: '固定模块，由商品数据自动生成', anchor: () => true },
  marketing: { desc: '促销展现 · 标准模板 3 选 1' },
  reserved3: { desc: '四项核心参数 · 读取整车主档 · 图片或视频', anchor: () => true },
  reserved4: { desc: '预留位 · 未配置内容时自动隐藏' },
  detail: { desc: '按商品维护，位置固定', anchor: () => true },
  specifications:{desc:'整车主档参数',anchor:()=>true},packaging:{desc:'当前车型包装字段'},downloads:{desc:'当前车型公开文件'},faq:{desc:'当前车型独立配置'},warranty:{desc:'当前商品质保资料',anchor:()=>true},delivery:{desc:'当前商品配送资料',anchor:()=>true},
  reviews: { desc: '读取「评价管理」真实评价', anchor: (m) => m?.enabled !== false },
  returns: { desc: '全局文案，所有商品共用', anchor: (m) => Boolean(m?.enabled && (m.title || m.body)) },
  other: { desc: '全局文案，所有商品共用', anchor: (m) => Boolean(m?.enabled && (m.title || m.body)) },
};
const BANNER_KEYS = ['marketing', 'reserved3', 'reserved4'];
// 预览端（CatalogPage）只渲染「已启用且填了内容」的模块，没内容就没有锚点，
// 提前算出来，免得点了目录什么都没发生还不给提示。
function moduleAnchor(key, modules) {
  const module = modules?.[key] || {};
  if (MODULE_META[key]?.anchor) return MODULE_META[key].anchor(module);
  if (BANNER_KEYS.includes(key)) {
    return Boolean(module.enabled && (module.imageId || module.title || module.description || module.text || module.href));
  }
  return false;
}

function moduleBadge(key, modules) {
  if (key === 'info' || key === 'productNavigation') return '固定';
  if (['detail','marketing','faq'].includes(key)) return '按商品';
  if (['specifications','packaging','downloads','warranty','delivery'].includes(key)) return '产品取数';
  if (key === 'reserved3') return modules.performance?.showParameters === false ? '参数关闭' : '四项参数';
  if (key === 'reserved4') {
    const m = modules[key] || {};
    return m.enabled && (m.imageId || m.text || m.href) ? '已配置' : '自动隐藏';
  }
  return modules[key]?.enabled ? '已启用' : '已关闭';
}

export function GlobalModulesPanel({ cms, row, locale, onEditGraphic, onSelectModule, onLocaleChange }) {
  const { doc, setDoc, dirty } = cms;
  const [assets, setAssets] = useState([]);
  const [active, setActive] = useState('marketing');
  const [fields, setFields] = useState([]);
  const [fieldError, setFieldError] = useState('');
  useEffect(() => { let alive = true; api.fields().then(rows => { if (alive) setFields(Array.isArray(rows) ? rows : []); }).catch(e => { if (alive) setFieldError(e.message || '读取参数字典失败'); }); return () => { alive = false; }; }, []);
  useEffect(() => { api.assetsAll({ category: 'page', kind: 'image' }).then(rows => setAssets(Array.isArray(rows) ? rows : [])).catch(() => setAssets([])); }, []);
  if (!doc) return <p className="sdw__tip">{cms.error || '正在读取公共模块配置…'}</p>;
  const modules = { ...DEFAULT_MODULES, ...(doc.modules || {}) };
  const patchModules = next => setDoc({ ...doc, modules: { ...modules, ...next } });
  const productLayout = { gallery: 'standard', specifications: 'list', reviews: 'list', ...(doc.productLayout || {}) };
  const fixedSpec = (doc.blocks || []).find(block => block.componentKey === 'specs' && block.visible !== false);
  const availableFields = fields.filter(field => field.enabled && field.shopVisible && field.level === 'product' && !field.code.startsWith('_') && (!field.templates?.length || field.templates.includes('EBI')));
  const selectedCodes = fixedSpec?.bindings?.fieldCodes || [];
  const setSpecBinding = codes => {
    const block = fixedSpec || createBlock('specs');
    setDoc({ ...doc, blocks: [...(doc.blocks || []).filter(item => item.componentKey !== 'specs'), { ...block, visible: true, bindings: { ...block.bindings, productId: '', fieldSet: 'public_specs', fieldCodes: codes } }] });
  };
  const toggleSpecField = (code, checked) => {
    const current = selectedCodes.length ? selectedCodes : availableFields.map(field => field.code);
    const next = checked ? [...new Set([...current, code])] : current.filter(value => value !== code);
    if (next.length) setSpecBinding(next);
  };
  const current = GLOBAL_MODULES.find(([key]) => key === active) || GLOBAL_MODULES[1];
  const [no, name] = [current[1], current[2]];
  const meta = MODULE_META[active] || {};
  const anchor = moduleAnchor(active, modules);
  // 目录点击与「在预览中定位」共用同一套载荷：预览侧据此决定滚不滚、并给一句人话提示
  const focusModule = key => {
    const item = GLOBAL_MODULES.find(([itemKey]) => itemKey === key);
    onSelectModule?.({ key, no: item?.[1], name: item?.[2], anchor: moduleAnchor(key, modules) });
  };
  const pickModule = key => { setActive(key); focusModule(key); };
  // 切语言会换成另一条 product_template 记录，有未保存修改必须先确认，不能静默丢弃
  const switchLocale = code => {
    if (code === locale) return;
    if (dirty && !window.confirm('当前语言还有未保存的修改，切换语言会离开这份草稿，未保存内容将丢失。继续切换？')) return;
    onLocaleChange?.(code);
  };

  const editor = (() => {
    if (active === 'productNavigation') return <section className="sdp__module"><header><strong>商品专属导航栏</strong><span className="hint">固定模块 · ALSVID-P00</span></header><p>PC 与手机共用一条吸顶导航，不显示品牌 Logo 或品牌名称。营销公告开启时位于其上方。</p><div aria-label="导航结构示意（非实时预览）" style={{display:'flex',alignItems:'center',gap:12,overflowX:'auto',whiteSpace:'nowrap',background:'#111',color:'#fff',padding:'12px 14px',borderRadius:4}}><span>☰</span><strong>当前车型</strong><span>概览</span><span>技术参数</span><span>视频</span><span>下载</span><span style={{background:'#fff',color:'#111',padding:'7px 10px',borderRadius:3}}>配置车型 / 购物车</span><span>个人账户</span></div><p>汉堡菜单保留返回首页；购买入口展开后可配置当前车型或查看购物车。无内容的快捷导航显示禁用状态，避免无效链接。手机端中间导航可横向滑动，两端不删减功能。</p><p className="sdw__tip">该区为四款及后续车型共用的固定结构，模块 ID 保持不变。以上为后台结构示意；真实预览同步和样式编辑仍待完善。</p></section>;
    if (active === 'info') return <div className="sdp"><section className="sdp__module"><header><strong>P01-01 车型选配</strong></header><p>产品取数：商品主图、SKU、价格、库存。</p><button type="button" className="btn small" onClick={onEditGraphic}>按商品装修</button></section><PerformanceEditor value={modules.performance} fields={availableFields} fieldError={fieldError} assets={assets} onChange={performance=>patchModules({performance})}/></div>;
    if (active === 'specifications') return <div className="sdp">
      <section className="sdp__module">
        <header><strong>P05 完整技术参数</strong><span className="hint">产品取数 · 固定组件</span></header>
        <p className="sdw__tip">自动读取整车主档全部公开参数并按类别展示；按车型显示开关在按商品装修设置。</p>
        <label className="sdp__field">技术参数样式<select value={productLayout.specifications} onChange={e=>setDoc({...doc,productLayout:{...productLayout,specifications:e.target.value}})}><option value="list">列表</option><option value="table">表格</option><option value="accordion">折叠</option></select></label>
        <button type="button" className="btn small" onClick={onEditGraphic}>按商品装修 →</button>
      </section>
    </div>;
    if (['marketing','packaging','downloads','faq','warranty','delivery'].includes(active)) return <section className="sdp__module"><header><strong>{no} {name}</strong></header><p>当前车型独立装修或读取车型资料，不重复录入。</p><button type="button" className="btn small" onClick={onEditGraphic}>去按商品装修 →</button></section>;
    if (active === 'detail') return <div className="sdp">
      <section className="sdp__module">
        <header><strong>04 沉浸式产品详情</strong><span className="hint">按商品</span></header>
        <p className="sdw__tip">每个商品内容不同，内部可自由组合文字段与图片段；位置固定，不随公共模块变化。</p>
        <div><button type="button" className="btn small" onClick={onEditGraphic}>去按商品装修 →</button></div>
      </section>
    </div>;
    if (active === 'reviews') return <div className="sdp">
      <section className="sdp__module">
        <header><strong>11 用户评价</strong><span className="hint">标准模板</span></header>
        <label className="sdp__check"><input type="checkbox" checked={modules.reviews.enabled} onChange={e => patchModules({ reviews: { ...modules.reviews, enabled: e.target.checked } })}/> 显示评价区</label>
        <label className="sdp__field">显示条数<input type="number" min={1} max={50} value={modules.reviews.limit} onChange={e => patchModules({ reviews: { ...modules.reviews, limit: Number(e.target.value) || 20 } })}/></label>
        <label className="sdp__field">评价样式<select value={productLayout.reviews} onChange={e => setDoc({ ...doc, productLayout: { ...productLayout, reviews: e.target.value } })}><option value="list">列表</option><option value="cards">卡片</option></select></label>
        <p className="sdw__tip">内容读取「评价管理」，公共模板不覆盖商品真实评价。</p>
      </section>
    </div>;
    if (active === 'returns') return <div className="sdp">
      <CopyEditor title="12 退换货政策" defaultTitle="退换货政策" value={modules.returns} onChange={returns => patchModules({ returns })}/>
    </div>;
    if (active === 'other') return <div className="sdp">
      <CopyEditor title="13 其他说明" defaultTitle="其他说明" value={modules.other} onChange={other => patchModules({ other })}/>
    </div>;
    return <div className="sdp">
      <MarketingEditor title={`${no} ${name}`} note={meta.desc} value={modules[active]} assets={assets} locale={locale} onSwitchLocale={switchLocale} onChange={next => patchModules({ [active]: next })}/>
    </div>;
  })();

  return <>
    <aside className="sdw__panel gmp__nav">
      <div className="sdw__side-head">
        <h3 className="sdw__side-title">模块目录</h3>
        <span className="gmp__fixed">固定顺序</span>
      </div>
      <p className="sdw__tip gmp__hint">商品导航与主体模块位置固定，不可拖动、不可调整顺序。</p>
      <div className="gmp__list">
        {GLOBAL_MODULES.map(([key, itemNo, itemName]) => <button type="button" key={key} className={'gmp__item' + (active === key ? ' is-active' : '')} onClick={() => pickModule(key)}>
          <b>{itemNo}</b><span>{itemName}<small style={{display:'block',fontSize:10}}>ALSVID-P{itemNo}</small></span><i className={'gmp__badge' + (moduleBadge(key, modules) === '已启用' || moduleBadge(key, modules) === '已配置' ? ' is-on' : '')}>{moduleBadge(key, modules)}</i>
        </button>)}
      </div>
      <p className="sdw__tip">保存草稿 / 发布 / 发布记录统一在页面顶部动作条，此处只管选模块。</p>
    </aside>
    <section className="sdw__panel sdw__panel--editor">
      <div className="sdp__cast">
        <div className="sdp__cast-main">
          <span className="sdp__cast-no">{no}</span>
          <b>{name}</b><button type="button" className="btn small" onClick={()=>navigator.clipboard.writeText('ALSVID-P'+no).catch(()=>window.alert('复制失败，请手动复制模块编号'))}>复制 ALSVID-P{no}</button>
          {meta.desc && <small>{meta.desc}</small>}
        </div>
        <button type="button" className="btn small" onClick={() => focusModule(active)}
          title={anchor ? '在右侧官网预览里滚动到该模块并高亮' : '该模块当前未启用或没有内容，官网预览里没有对应区块'}>在预览中定位</button>
      </div>
      {editor}
    </section>
  </>;
}
