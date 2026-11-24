import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// 商品发布到官网（catalog_publications）。
// 后端契约：PUT /api/products/:id/publication 保存草稿（需 revision 乐观锁），
// POST .../publish 把草稿固化成访客可见版本，POST .../unpublish 下架回落到「无详情页」。
// 发布前置条件由后端强制：产品状态必须为「启用」、必须已有草稿。
const MAX_MEDIA = 12;

function imageOf(asset) {
  const type = asset.contentType || asset.content_type || '';
  return String(type).startsWith('image/');
}

export default function PublicationDialog({ product, onClose, onChanged, embedded = false, onDirtyChange, onBusyChange }) {
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [locale, setLocale] = useState('zh');
  const [form, setForm] = useState({ title: '', model: '', description: '' });
  const [specs, setSpecs] = useState([]);
  const [mediaIds, setMediaIds] = useState([]);
  const [linked, setLinked] = useState([]);
  const [library, setLibrary] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      const [rec, linkedAssets, allImages] = await Promise.all([
        api.productPublication(product.id),
        api.assetsAll({ productId: product.id, kind: 'image' }).catch(() => []),
        api.assetsAll({ kind: 'image' }).catch(() => []),
      ]);
      if (!active) return;
      const document = { ...(rec?.published || {}), ...(rec?.draft || {}), languages: { ...(rec?.published?.languages || {}), ...(rec?.draft?.languages || {}) } };
      setRecord(rec);
      setForm({ title: '', model: document?.model || product.model || product.officialModelName || '', description: '' });
      setSpecs([]);
      setMediaIds(Array.isArray(document.mediaIds) ? document.mediaIds : []);
      setLinked(linkedAssets.filter(imageOf));
      setLibrary(allImages.filter(imageOf));
      setLoading(false);
    })().catch(reason => {
      if (active) { setError(reason.message); setLoading(false); }
    });
    return () => { active = false; };
  }, [product.id]);

  useEffect(() => {
    if (!record) return;
    const document={...(record.published||{}),...(record.draft||{}),languages:{...(record.published?.languages||{}),...(record.draft?.languages||{})}}, content=document.languages?.[locale]||{};
    setForm(current=>({...current,title:content.title||'',model:document.model||product.model||product.officialModelName||'',description:content.description||''}));
    setSpecs(Array.isArray(content.specifications)?content.specifications:[]);
    setMediaIds(Array.isArray(document.mediaIds)?document.mediaIds:[]);
  }, [locale,record,product.model,product.officialModelName]);

  const buildDocument = () => {
    const current = { ...(record?.published || {}), ...(record?.draft || {}) };
    const previous = { ...(record?.published?.languages || {}), ...(record?.draft?.languages || {}) };
    return {
      ...current,
      model: form.model.trim(),
      languages: { ...previous, [locale]: { title: form.title.trim(), description: form.description.trim(), specifications: specs } },
      mediaIds,
    };
  };

  const saveDraft = async () => {
    if (!form.title.trim()) throw Error('请填写官网展示的产品名称');
    const saved = await api.saveProductPublication(product.id, { revision: record?.revision ?? 0, document: buildDocument() });
    setRecord(saved);
    setDirty(false);
    return saved;
  };

  const run = async action => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'save') {
        await saveDraft();
        setMessage('草稿已保存，访客看到的仍是上一次发布的版本。');
      } else if (action === 'publish') {
        const saved = await saveDraft();
        const published = await api.publishProductPublication(product.id, { revision: saved.revision });
        setRecord(published);
        setMessage('已发布到官网，商品详情页现在对访客可见。');
        onChanged?.();
      } else {
        const unpublished = await api.unpublishProductPublication(product.id, { revision: record?.revision ?? 0 });
        setRecord(unpublished);
        setMessage('已从官网下架，商品详情页不再对访客开放。');
        onChanged?.();
      }
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleMedia = id => {
    setMediaIds(current => {
      if (current.includes(id)) return current.filter(x => x !== id);
      if (current.length >= MAX_MEDIA) { setError(`最多选择 ${MAX_MEDIA} 张产品图片`); return current; }
      setError('');
      return [...current, id];
    });
  };
  const patchSpec = (index, key, value) => setSpecs(rows=>rows.map((row,i)=>i===index?{...row,[key]:value}:row));

  const candidates = showLibrary ? library : (linked.length ? linked : library);
  const published = record?.published != null;
  const pendingPublish = record?.draft != null && record?.revision !== record?.publishedRevision;
  const statusText = published ? (pendingPublish ? '已发布 · 有未发布的修改' : '已发布') : '未发布';

  return <div className={embedded ? 'product-publication-embedded' : 'mask mask--center'} onMouseDown={event => { if (!embedded && event.target === event.currentTarget && !busy) onClose?.(); }}>
    <div className={embedded ? 'product-publication-embedded__panel' : 'modal shop-modal'} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={`官网详情内容 · ${product.name}`}>
      <div className={embedded ? 'product-publication-embedded__head' : 'modal-head'}>
        <h3>官网详情内容 · {product.name}</h3>
        <span className={'shop-status' + (published ? ' is-on' : '')}>{statusText}</span>
        {!embedded && <button type="button" className="btn small" onClick={onClose} disabled={busy} aria-label="关闭">×</button>}
      </div>
      <div className={embedded ? 'product-publication-embedded__body' : 'modal-body'}>
        {error && <p className="shop-modal__error" role="alert">{error}</p>}
        {message && <p className="hint pub-message" role="status">{message}</p>}
        {!loading && <label className="product-publication-embedded__locale">编辑语言 <select disabled={busy} value={locale} onChange={event=>{if(dirty&&!window.confirm('当前语言有未保存修改，切换会丢弃这些修改，继续吗？'))return;setDirty(false);setLocale(event.target.value)}}><option value="zh">中文</option><option value="en">English</option><option value="de">Deutsch</option></select></label>}
        {loading ? <p className="hint">正在读取发布内容…</p> : <>
          <div className="form-grid">
            <div className="field"><label>官网产品名称 *</label><input maxLength={160} value={form.title} onChange={event => { setForm({ ...form, title: event.target.value }); setDirty(true); }} /></div>
            <div className="field"><label>型号</label><input maxLength={100} value={form.model} onChange={event => { setForm({ ...form, model: event.target.value }); setDirty(true); }} /></div>
            <div className="field fg-span"><label>产品描述</label>
              <textarea className="shop-modal__textarea" rows={5} maxLength={10000} value={form.description} onChange={event => { setForm({ ...form, description: event.target.value }); setDirty(true); }} />
            </div>
          </div>
          <div className="field fg-span product-publication-specs">
            <div className="pub-media__head"><b>技术参数</b><span className="hint">{specs.length} / 30</span><button type="button" className="btn small" disabled={specs.length>=30} onClick={()=>{setSpecs(rows=>[...rows,{label:'',value:''}]);setDirty(true)}}>添加参数</button></div>
            {specs.map((row,index)=><div className="product-publication-specs__row" key={index}><input aria-label={`参数 ${index+1} 名称`} maxLength={80} placeholder="参数名称" value={row.label} onChange={event=>{patchSpec(index,'label',event.target.value);setDirty(true)}}/><input aria-label={`参数 ${index+1} 数值`} maxLength={500} placeholder="参数值" value={row.value} onChange={event=>{patchSpec(index,'value',event.target.value);setDirty(true)}}/><button type="button" className="btn small" aria-label="删除参数" onClick={()=>{setSpecs(rows=>rows.filter((_,i)=>i!==index));setDirty(true)}}>删除</button></div>)}
          </div>
          <div className="pub-media">
            <div className="pub-media__head">
              <b>产品图片</b>
              <span className="hint">已选 {mediaIds.length} / {MAX_MEDIA}{linked.length ? `（产品素材库 ${linked.length} 张）` : ''}</span>
                <button type="button" className="btn small" onClick={() => setShowLibrary(value => !value)}>
                {showLibrary ? '只看本产品素材' : '从全部素材中挑选'}
              </button>
            </div>
            <div className="pub-media__grid">
              {candidates.map(asset => {
                const picked = mediaIds.includes(asset.id);
                return <button type="button" key={asset.id} className={'pub-media__item' + (picked ? ' is-on' : '')} onClick={() => { toggleMedia(asset.id); setDirty(true); }} title={asset.label || asset.fileName || asset.id}>
                  <img src={api.assetUrl(asset.id)} alt={asset.label || ''} loading="lazy" />
                  {picked && <span className="pub-media__badge">已选</span>}
                </button>;
              })}
              {!candidates.length && <p className="hint">素材库里还没有图片，先到「商品管理 › 素材库」上传。</p>}
            </div>
          </div>
        </>}
      </div>
      <div className={embedded ? 'product-publication-embedded__foot' : 'modal-foot'}>
        {!embedded && <button type="button" className="btn small" onClick={onClose} disabled={busy}>关闭</button>}
        {published && <button type="button" className="btn small" disabled={busy || dirty} onClick={() => run('unpublish')}>从官网下架</button>}
        <button type="button" className="btn small" disabled={busy || loading} onClick={() => run('save')}>{busy ? '处理中…' : '保存草稿'}</button>
        <button type="button" className="btn small primary" disabled={busy || loading} onClick={() => run('publish')}>{published ? '重新发布' : '发布到官网'}</button>
      </div>
    </div>
  </div>;
}
