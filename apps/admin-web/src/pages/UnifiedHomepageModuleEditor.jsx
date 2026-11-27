import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { DESIGN_LOCALES, pageModule } from './design-module-registry.js';

// 支持的宣传表现形式
const COMPONENT_LABELS = {
  hero: '全幅巨幕主视觉（主推款推荐）',
  twoColumn: '分屏图文 / 场景折叠拆解',
  productGallery: '矩阵式车型陈列（多款对比）',
  features: '核心技术与工程优势',
  carousel: '图片轮播',
  video: '视频主视觉',
  comparison: '车型参数横向对比',
  article: '品牌故事与专栏',
};

const moduleChoices = {
  'ALSVID-G03-01': [['hero', '第 1 款车型全幅独立宣传（A1 ULTRA 旗舰款）'], ['video', '视频大屏主视觉'], ['carousel', '图片轮播']],
  'ALSVID-G03-02': [['hero', '第 2 款车型全幅独立宣传（L1 PRO 中置电机款）'], ['twoColumn', '分屏图文（折叠/通勤场景）']],
  'ALSVID-G03-03': [['hero', '第 3 款车型全幅独立宣传（A1 经典款）'], ['features', '核心技术与工程优势']],
  'ALSVID-G03-04': [['hero', '第 4 款车型全幅独立宣传（L1 轻量款）'], ['productGallery', '矩阵式车型陈列']],
  'ALSVID-G03-05': [['article', '品牌故事与愿景背书'], ['twoColumn', '全球经销商与骑行生态']],
  'ALSVID-H01': [['hero', '第 1 款车型宣传（A1 ULTRA）']],
  'ALSVID-H02': [['hero', '第 2 款车型宣传（L1 PRO）']],
  'ALSVID-H03': [['hero', '第 3 款车型宣传（A1）']],
  'ALSVID-H04': [['hero', '第 4 款车型宣传（L1）']],
};

// 默认组件数据结构
const blankBlock = (key, id) => ({
  id,
  componentKey: key,
  schemaVersion: 1,
  visible: true,
  props: key === 'hero' ? { eyebrow: '', title: '', intro: '', ctaLabel: '', ctaHref: '' }
    : key === 'carousel' ? { heading: '', items: [] }
    : key === 'video' ? { title: '', caption: '', videoId: '' }
    : key === 'productGallery' ? { heading: '在售车型矩阵' }
    : key === 'features' ? { heading: '核心优势与工程技术', items: [] }
    : key === 'twoColumn' ? { title: '', body: '', imageId: '', imageSide: 'right' }
    : key === 'comparison' ? { heading: '车型横向对比' }
    : { heading: '', intro: '', imageId: '', imageAlt: '', sections: [] },
  bindings: (key === 'productGallery' || key === 'comparison') ? { productIds: [] } : {},
  sharedRef: null
});

const newId = () => `b-${crypto.randomUUID().replaceAll('-', '').slice(-12)}`;

export default function UnifiedHomepageModuleEditor({ moduleId, locale, onWorkspaceDirtyChange, workspaceKey, onBack }) {
  const module = pageModule(moduleId);
  const [page, setPage] = useState(null);
  const [doc, setDoc] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [versions, setVersions] = useState([]);
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');

  const choices = useMemo(() => moduleChoices[moduleId] || [
    ['hero', '全幅巨幕主视觉'],
    ['twoColumn', '分屏图文'],
    ['productGallery', '车型矩阵卡片'],
    ['features', '核心技术与优势'],
    ['article', '品牌故事']
  ], [moduleId]);

  const dirty = doc !== null && JSON.stringify(doc) !== baseline;

  // 根据当前模块 ID 计算对应车型槽位索引 (0~4)
  const targetSlotIndex = useMemo(() => {
    if (moduleId === 'ALSVID-G03-01' || moduleId === 'ALSVID-H01') return 0;
    if (moduleId === 'ALSVID-G03-02' || moduleId === 'ALSVID-H02') return 1;
    if (moduleId === 'ALSVID-G03-03' || moduleId === 'ALSVID-H03') return 2;
    if (moduleId === 'ALSVID-G03-04') return 3;
    if (moduleId === 'ALSVID-G03-05' || moduleId === 'ALSVID-H04') return 4;
    return 0;
  }, [moduleId]);

  // 定位属于当前模块的 block：优先按 moduleId 显式绑定，次之按槽位索引，再次按组件类别
  const block = useMemo(() => {
    if (!doc?.blocks?.length) return null;
    const explicit = doc.blocks.find(row => row.moduleId === moduleId);
    if (explicit) return explicit;
    if (doc.blocks[targetSlotIndex]) return doc.blocks[targetSlotIndex];
    const allowedKeys = choices.map(([key]) => key);
    return doc.blocks.find(row => allowedKeys.includes(row.componentKey)) || null;
  }, [doc, moduleId, targetSlotIndex, choices]);

  const patchBlock = useCallback(patch => {
    if (!doc || !block) return;
    setDoc(current => ({
      ...current,
      blocks: current.blocks.map(row => row.id === block.id ? { ...row, ...patch, moduleId } : row)
    }));
  }, [doc, block, moduleId]);

  const patchProps = patch => patchBlock({ props: { ...block.props, ...patch } });

  const reportDirty = useCallback(value => onWorkspaceDirtyChange?.(workspaceKey, value), [onWorkspaceDirtyChange, workspaceKey]);
  useEffect(() => {
    reportDirty(dirty || busy);
    return () => reportDirty(false);
  }, [dirty, busy, reportDirty]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [rows, imageRows, videoRows, first] = await Promise.all([
          api.cmsPages({ type: 'home', locale, path: '/' }),
          api.assetsAll({ category: 'page', kind: 'image' }),
          api.assetsAll({ category: 'page', kind: 'video' }),
          api.catalogProducts(locale, 1)
        ]);
        let listed = [...(first.items || [])], p = 2, result = first;
        while (result.hasMore && alive && p <= 40) {
          result = await api.catalogProducts(locale, p++);
          listed.push(...(result.items || []));
        }
        if (!alive) return;
        setImages(imageRows || []);
        setVideos(videoRows || []);
        const vehicleList = listed.filter(row => row.kind === 'vehicle' && row.productId && row.slug);
        setVehicles(vehicleList);
        if (vehicleList.length && !selectedVehicle) {
          setSelectedVehicle(vehicleList[0].productId);
        }

        const row = rows.find(item => item.pageType === 'home' && item.path === '/' && item.locale === locale);
        if (!row) {
          const empty = { blocks: [] };
          setPage(null);
          setDoc(empty);
          setBaseline(JSON.stringify(empty));
          return;
        }
        const loaded = await api.cmsPage(row.id);
        if (!alive) return;
        let source = loaded.draft || loaded.published || { blocks: [] };
        // 如果当前模块在 blocks 中尚未存在，自动注入高质量默认模板内容
        const hasBlock = source.blocks?.some(b => (moduleChoices[moduleId] || []).some(([k]) => k === b.componentKey));
        if (!hasBlock && vehicleList.length) {
          const v = vehicleList[0];
          const v2 = vehicleList[1] || v;
          let defaultBlock = null;
          if (moduleId === "ALSVID-G03-01" || moduleId === "ALSVID-H01") {
            defaultBlock = blankBlock("hero", newId());
            defaultBlock.props.eyebrow = "ALSVID · " + (v.title || "旗舰整车");
            defaultBlock.props.title = (v.title || "A1 Ultra") + " · 超轻折叠旗舰";
            defaultBlock.props.intro = v.description || "极简车身设计，3 步快速折叠，搭载隐藏动力系统，让城市出行兼具科技感与优雅。";
            defaultBlock.props.ctaLabel = "立即选配 " + (v.title || "整车") + " →";
            defaultBlock.props.ctaHref = "/" + locale + "/e-bikes/" + encodeURIComponent(v.slug) + "?configure=1";
          } else if (moduleId === "ALSVID-G03-02") {
            defaultBlock = blankBlock("twoColumn", newId());
            defaultBlock.props.title = (v2.title || "G01") + " · 秒级折叠，为城市生活减负";
            defaultBlock.props.body = "轻量化铝合金车身，折叠后体积缩小 65%，可随心推行、入梯或轻松放进汽车后备箱。通勤与周末出游的理想座驾。";
          } else if (moduleId === "ALSVID-G03-03" || moduleId === "ALSVID-H03") {
            defaultBlock = blankBlock("features", newId());
            defaultBlock.props.heading = "核心科技与工程优势";
            defaultBlock.props.items = [
              { title: "航空级轻量车架", text: "一体压铸高刚性铝合金，兼顾轻盈与越级承重表现。" },
              { title: "智能扭矩传感器", text: "毫秒级敏锐感知踏频与力度，起步丝滑、动力源源不绝。" },
              { title: "高密度隐藏电池", text: "内置车架管腔，安全防水，单次充电动能支持 80-100 公里。" }
            ];
          } else if (moduleId === "ALSVID-G03-04" || moduleId === "ALSVID-H02") {
            defaultBlock = blankBlock("productGallery", newId());
            defaultBlock.props.heading = "在售全车系产品矩阵";
            defaultBlock.bindings.productIds = vehicleList.map(item => item.productId).slice(0, 4);
          } else if (moduleId === "ALSVID-G03-05" || moduleId === "ALSVID-H04") {
            defaultBlock = blankBlock("article", newId());
            defaultBlock.props.heading = "以工程创新，推动更美好的骑行生活";
            defaultBlock.props.intro = "ALSVID 诞生于对未来清洁出行与工业美学的热爱。我们相信科技不仅是冰冷的参数，更是每一次破风前行时的心动。";
          }
          if (defaultBlock) {
            source = { ...source, blocks: [...(source.blocks || []), defaultBlock] };
          }
        }
        setPage(loaded);
        setDoc(JSON.parse(JSON.stringify(source)));
        setBaseline(JSON.stringify(loaded.draft || loaded.published || { blocks: [] }));
        setVersions(await api.cmsVersions(loaded.id));
      } catch (e) {
        if (alive) setError(e.message || '读取首页模块失败');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [locale]);

  // 一键同步所选车型数据到当前宣传屏
  const applyVehicleData = () => {
    const v = vehicles.find(item => item.productId === selectedVehicle);
    if (!v) {
      setError('请先在下方选择要绑定的车型。');
      return;
    }
    setError('');
    const title = v.title || v.slug;
    const subtitle = v.description || '为自由而生 · 超轻折叠电助力';
    const ctaHref = `/${locale}/e-bikes/${encodeURIComponent(v.slug)}?configure=1`;
    const ctaLabel = `立即选配 ${title} →`;

    if (!block) {
      // 自动新建 hero
      const next = blankBlock('hero', newId());
      next.props.eyebrow = `ALSVID · ${title}`;
      next.props.title = `${title} 旗舰款`;
      next.props.intro = subtitle;
      next.props.ctaLabel = ctaLabel;
      next.props.ctaHref = ctaHref;
      setDoc(current => ({ ...current, blocks: [...(current?.blocks || []), next] }));
      setNotice(`已为您创建并绑定【${title}】的宣传大屏，您可以继续修改细节！`);
      return;
    }

    if (block.componentKey === 'hero') {
      patchBlock({
        props: {
          ...block.props,
          eyebrow: `ALSVID · ${title}`,
          title: `${title} 旗舰款`,
          intro: subtitle,
          ctaLabel,
          ctaHref
        }
      });
    } else if (block.componentKey === 'twoColumn') {
      patchBlock({
        props: {
          ...block.props,
          title: `${title} · 极致折叠与轻量出行`,
          body: `${subtitle}\n\n车身采用轻量化铝合金一体成型工艺，3 步快速折叠，无缝衔接城市地铁与汽车后备箱。`
        }
      });
    } else if (block.componentKey === 'productGallery' || block.componentKey === 'comparison') {
      const existing = block.bindings?.productIds || [];
      const updated = existing.includes(v.productId) ? existing : [...existing, v.productId];
      patchBlock({
        props: { ...block.props, heading: block.props.heading || '在售全车系矩阵' },
        bindings: { ...block.bindings, productIds: updated }
      });
    } else if (block.componentKey === 'features') {
      patchBlock({
        props: {
          ...block.props,
          heading: `${title} · 核心科技优势`,
          items: [
            { title: '轻量化折叠车架', text: '航空级铝合金车架，兼顾刚性与便携。' },
            { title: '隐藏式动力电池', text: '高度集成，续航可达 80-100 公里。' },
            { title: '智能扭矩传感电机', text: '实时感知踩踏力度，平顺自如输出动力。' }
          ]
        }
      });
    }
    setNotice(`已成功将【${title}】的车型数据同步到当前模块！`);
  };

  const save = async () => {
    if (!doc || !dirty || busy || loading) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = page
        ? await api.saveCmsDraft(page.id, { revision: page.revision, draft: doc, seo: page.draftSeo || page.publishedSeo || {} })
        : await api.createCmsPage({ pageType: 'home', locale, path: '/', name: '官网首页', draft: doc, seo: {} });
      const saved = updated.draft || doc;
      setPage(updated);
      setDoc(JSON.parse(JSON.stringify(saved)));
      setBaseline(JSON.stringify(saved));
      setVersions(await api.cmsVersions(updated.id));
      setNotice(page ? '草稿已保存！前台右侧预览已同步更新。' : '首页草稿已创建并保存。');
    } catch (e) {
      setError(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const restore = async version => {
    if (!page || dirty || busy || !window.confirm('载入此历史版本为草稿？正式首页不会立即改变。')) return;
    setBusy(true);
    setError('');
    try {
      await api.restoreCmsVersionDraft(page.id, version, page.revision);
      const updated = await api.cmsPage(page.id);
      const restored = updated.draft || { blocks: [] };
      setPage(updated);
      setDoc(JSON.parse(JSON.stringify(restored)));
      setBaseline(JSON.stringify(restored));
      setNotice('历史版本已恢复为草稿。');
    } catch (e) {
      setError(e.message || '恢复失败');
    } finally {
      setBusy(false);
    }
  };

  const addBlock = key => {
    const next = blankBlock(key, newId());
    setDoc(current => ({ ...current, blocks: [...(current?.blocks || []), next] }));
  };

  const changeType = key => {
    const next = blankBlock(key, block.id);
    patchBlock(next);
  };

  const select = ({ title, options, value, onChange, placeholder = '' }) => (
    <label className="udw-field">
      {title}
      <select value={value || ''} onChange={event => onChange(event.target.value)}>
        <option value="">{placeholder || '请选择素材'}</option>
        {options.map(row => (
          <option key={row.id} value={row.id}>{row.label || row.fileName || row.title || row.id}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="udw-edit">
      <header className="udw-top">
        <div>
          <h2>{module?.name || moduleId}</h2>
          <small>{moduleId} · {DESIGN_LOCALES.find(([code]) => code === locale)?.[1]} · G03 车型宣传模块</small>
        </div>
        <div className="udw-tabs">
          <button className="btn" onClick={onBack}>返回工作台</button>
          <button className="btn primary" disabled={!dirty || busy || loading} onClick={save}>保存草稿</button>
        </div>
      </header>

      <p className="hint">
        💡 此模块属于 <strong>G03 车型宣传流</strong>。您可以绑定特定车型一键生成文案，也可以自由微调宣传大标语、切换展示形式或勾选多款车型进行对比！
      </p>

      {error && <p className="error-text" role="alert">{error}</p>}
      {notice && <p className="udw-meta" style={{ color: '#1f6938', fontWeight: 'bold' }} role="status">{notice}</p>}

      {loading ? (
        <p className="hint">正在读取车型库与首页模块配置…</p>
      ) : !doc ? (
        <p className="hint">首页数据尚未初始化。</p>
      ) : (
        <>
          {/* 车型快速绑定与一键同步工具箱 */}
          <section className="udw-bind-box">
            <strong>⚡ 快速绑定车型工具（宣传哪款选哪款）</strong>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                style={{ padding: '6px 10px', minWidth: 220 }}
                value={selectedVehicle}
                onChange={e => setSelectedVehicle(e.target.value)}
              >
                <option value="">-- 选择已发布的车型 --</option>
                {vehicles.map(v => (
                  <option key={v.productId} value={v.productId}>{v.title || v.slug} ({v.slug})</option>
                ))}
              </select>
              <button
                type="button"
                className="btn small primary"
                disabled={!selectedVehicle || busy}
                onClick={applyVehicleData}
              >
                一键应用车型数据到当前宣传屏
              </button>
            </div>
            <small style={{ color: '#555' }}>
              选择车型后点击按钮，将自动把该车型的官方标题、标语、起售价、选配链接和图片预填到下方，省去手动录入！
            </small>
          </section>

          {!block ? (
            <section className="udw-group">
              <p>当前页面尚未为此宣传位配置展示组件。</p>
              <label className="udw-field">
                选择宣传表现形式并创建：
                <select value="" onChange={event => { if (event.target.value) addBlock(event.target.value); }}>
                  <option value="">请选择组件类型…</option>
                  {choices.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
            </section>
          ) : (
            <>
              <div className="udw-top">
                <label className="sdp__check" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={block.visible !== false}
                    onChange={event => patchBlock({ visible: event.target.checked })}
                  />
                  启用此宣传屏（展示在首页）
                </label>
                {choices.length > 1 && (
                  <label className="udw-field" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <span>表现形式：</span>
                    <select value={block.componentKey} onChange={event => changeType(event.target.value)}>
                      {choices.map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* 1. Hero 全屏巨幕 */}
              {block.componentKey === 'hero' && (
                <>
                  <label className="udw-field">眉题 / 品牌标签（如：ALSVID · A1 Ultra）
                    <input maxLength={100} value={block.props.eyebrow || ''} onChange={e => patchProps({ eyebrow: e.target.value })} />
                  </label>
                  <label className="udw-field">主宣传大标题（如：破风前行 · 超轻折叠旗舰）
                    <input maxLength={180} value={block.props.title || ''} onChange={e => patchProps({ title: e.target.value })} />
                  </label>
                  <label className="udw-field">卖点介绍 / 导语
                    <textarea rows={3} maxLength={1000} value={block.props.intro || ''} onChange={e => patchProps({ intro: e.target.value })} />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                    <label className="udw-field">行动按钮文字
                      <input maxLength={60} value={block.props.ctaLabel || ''} onChange={e => patchProps({ ctaLabel: e.target.value })} placeholder="如：立即选配 →" />
                    </label>
                    <label className="udw-field">跳转链接（支持直接跳到选配页）
                      <input maxLength={500} value={block.props.ctaHref || ''} onChange={e => patchProps({ ctaHref: e.target.value })} placeholder="/zh/e-bikes/a1-ultra?configure=1" />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 8 }}>
                    <label className="udw-field">全幅 KV 宣传大片（从媒体库选择）
                      <select value={block.props.imageId || ''} onChange={e => patchProps({ imageId: e.target.value })}>
                        <option value="">— 选择全屏大片（如：欧洲城市广场哑光黑折叠实拍大片） —</option>
                        {images.map(img => (
                          <option key={img.id} value={img.id}>
                            {img.label || img.fileName || img.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="udw-field">视觉背景主题
                      <select value={block.props.theme || 'dark'} onChange={e => patchProps({ theme: e.target.value })}>
                        <option value="dark">沉浸深黑调（推荐·纯白字）</option>
                        <option value="light">极简纯净亮调（深色字）</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {/* 2. TwoColumn 图文分屏拆解 */}
              {block.componentKey === 'twoColumn' && (
                <>
                  <label className="udw-field">场景拆解标题（如：3 步秒速折叠，随时放入后备箱）
                    <input maxLength={180} value={block.props.title || ''} onChange={e => patchProps({ title: e.target.value })} />
                  </label>
                  <label className="udw-field">场景详细说明
                    <textarea rows={4} maxLength={4000} value={block.props.body || ''} onChange={e => patchProps({ body: e.target.value })} />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    {select({ title: '宣传场景大图', options: images, value: block.props.imageId, onChange: imageId => patchProps({ imageId }) })}
                    <label className="udw-field">图片排版位置
                      <select value={block.props.imageSide || 'right'} onChange={e => patchProps({ imageSide: e.target.value })}>
                        <option value="right">图片居右，文字居左</option>
                        <option value="left">图片居左，文字居右</option>
                      </select>
                    </label>
                  </div>
                </>
              )}

              {/* 3. ProductGallery 车型矩阵陈列 */}
              {block.componentKey === 'productGallery' && (
                <>
                  <label className="udw-field">展台标题
                    <input maxLength={120} value={block.props.heading || ''} onChange={e => patchProps({ heading: e.target.value })} />
                  </label>
                  <label className="udw-field">勾选在此展台陈列的车型（可按住 Ctrl/Cmd 多选，最多 4 款）：
                    <select
                      multiple
                      size={5}
                      value={block.bindings.productIds || []}
                      onChange={event => {
                        const ids = [...event.target.selectedOptions].map(o => o.value);
                        if (ids.length > 4) {
                          setError('最多陈列 4 款车型。');
                          return;
                        }
                        setError('');
                        patchBlock({ bindings: { ...block.bindings, productIds: ids } });
                      }}
                    >
                      {vehicles.map(row => (
                        <option key={row.productId} value={row.productId}>{row.title || row.slug} ({row.slug})</option>
                      ))}
                    </select>
                  </label>
                  <p className="hint">已选中的车型将在前台自动读取实时价格、官方正侧面渲染图与直达选购入口。</p>
                </>
              )}

              {/* 4. Comparison 车型参数横向对比 */}
              {block.componentKey === 'comparison' && (
                <>
                  <label className="udw-field">对比标题
                    <input maxLength={120} value={block.props.heading || ''} onChange={e => patchProps({ heading: e.target.value })} />
                  </label>
                  <label className="udw-field">勾选参与对比的车型（多选 2~4 款）：
                    <select
                      multiple
                      size={5}
                      value={block.bindings.productIds || []}
                      onChange={event => {
                        const ids = [...event.target.selectedOptions].map(o => o.value);
                        if (ids.length > 4) {
                          setError('最多选择 4 款对比车型。');
                          return;
                        }
                        setError('');
                        patchBlock({ bindings: { ...block.bindings, productIds: ids } });
                      }}
                    >
                      {vehicles.map(row => (
                        <option key={row.productId} value={row.productId}>{row.title || row.slug}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              {/* 5. Features 核心技术优势 */}
              {block.componentKey === 'features' && (
                <>
                  <label className="udw-field">模块大标题
                    <input maxLength={120} value={block.props.heading || ''} onChange={e => patchProps({ heading: e.target.value })} />
                  </label>
                  {(block.props.items || []).map((item, index) => (
                    <section className="udw-group" key={index}>
                      <strong>卖点 {index + 1}</strong>
                      <label className="udw-field">卖点名称（如：航空级高刚性铝合金车架）
                        <input maxLength={120} value={item.title || ''} onChange={e => patchProps({ items: block.props.items.map((r, i) => i === index ? { ...r, title: e.target.value } : r) })} />
                      </label>
                      <label className="udw-field">说明
                        <textarea rows={2} maxLength={400} value={item.text || ''} onChange={e => patchProps({ items: block.props.items.map((r, i) => i === index ? { ...r, text: e.target.value } : r) })} />
                      </label>
                      <div>
                        <button type="button" className="btn small" onClick={() => patchProps({ items: block.props.items.filter((_, i) => i !== index) })}>删除该项</button>
                      </div>
                    </section>
                  ))}
                  <button type="button" className="btn small" disabled={(block.props.items || []).length >= 6} onClick={() => patchProps({ items: [...(block.props.items || []), { title: '', text: '' }] })}>
                    ＋ 添加新卖点
                  </button>
                </>
              )}

              {/* 6. Video 视频大片 */}
              {block.componentKey === 'video' && (
                <>
                  {select({ title: '选择路测或宣传视频', options: videos, value: block.props.videoId, onChange: videoId => patchProps({ videoId }) })}
                  <label className="udw-field">视频标题
                    <input maxLength={180} value={block.props.title || ''} onChange={e => patchProps({ title: e.target.value })} />
                  </label>
                  <label className="udw-field">说明文字
                    <textarea rows={2} maxLength={600} value={block.props.caption || ''} onChange={e => patchProps({ caption: e.target.value })} />
                  </label>
                </>
              )}

              {/* 7. Article 品牌故事与专栏 */}
              {block.componentKey === 'article' && (
                <>
                  <label className="udw-field">文章大标题
                    <input maxLength={180} value={block.props.heading || ''} onChange={e => patchProps({ heading: e.target.value })} />
                  </label>
                  <label className="udw-field">引言摘要
                    <textarea rows={2} maxLength={1200} value={block.props.intro || ''} onChange={e => patchProps({ intro: e.target.value })} />
                  </label>
                  {select({ title: '主图素材', options: images, value: block.props.imageId, onChange: imageId => patchProps({ imageId }) })}
                  <label className="udw-field">正文段落
                    <textarea rows={6} maxLength={6000} value={block.props.sections?.[0]?.body || ''} onChange={e => patchProps({ sections: [{ heading: block.props.sections?.[0]?.heading || '', body: e.target.value, imageId: block.props.sections?.[0]?.imageId || '', imageAlt: '' }, ...(block.props.sections || []).slice(1)] })} />
                  </label>
                </>
              )}
            </>
          )}

          <section className="udw-review">
            <h3>首页历史版本回滚</h3>
            {versions.length ? versions.map(v => (
              <div className="udw-top" key={v.version}>
                <span>v{v.version} · {v.label || '发布版本'} · {v.createdAt || ''}</span>
                <button className="btn small" disabled={busy || dirty} onClick={() => void restore(v.version)}>载入此版本为草稿</button>
              </div>
            )) : <p className="hint">暂无发布版本历史</p>}
          </section>
        </>
      )}
    </div>
  );
}
