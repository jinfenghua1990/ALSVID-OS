import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const LANGUAGES = [['zh', '中文'], ['en', '英文'], ['de', '德文']];
const LANG_LABEL = { zh: '中文', en: '英文', de: '德文', '*': '多语言' };
const TYPE_LABELS = { home: '官网首页', custom: '普通内容页', product_template: '商品详情模板' };
const STATE_LABELS = { active: '启用', disabled: '已停用' };
const emptyDraft = () => ({ blocks: [], seo: { title: '', description: '' } });

/* 时间版本制：统一 YYYY-MM-DD HH:mm:ss */
function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function PageManager({ active = true, user, initialQuery = '', onOpenBuilder, onOpenHomeBuilder, onDirtyChange }) {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ type: '', locale: '', q: initialQuery || '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', pageType: 'custom', locale: 'de', path: '' });
  const [versionOf, setVersionOf] = useState(null);
  const [versions, setVersions] = useState([]);
  const loadVersion = useRef(0);
  const canEdit = user?.role === 'admin';

  const notify = (text, isError = false) => { if (isError) { setError(text); setMessage(''); } else { setMessage(text); setError(''); } };

  const loadRows = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await api.cmsPages(filters);
      if (version === loadVersion.current) { setRows(data); setError(''); }
    } catch (e) {
      if (version === loadVersion.current) setError(e.message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { setFilters(current => ({ ...current, q: initialQuery || '' })); }, [initialQuery]);
  useEffect(() => { if (active) loadRows(); }, [active, loadRows]);

  /* ---------- 统计 ---------- */
  const stats = {
    total: rows.length,
    published: rows.filter(r => r.publishedVersion != null).length,
    pending: rows.filter(r => r.hasDraft && (r.publishedVersion == null || r.revision !== r.publishedRevision)).length,
    disabled: rows.filter(r => r.status === 'disabled').length,
  };

  /* ---------- 操作 ---------- */
  const toggleStatus = async row => {
    setBusy(true);
    try {
      await api.setCmsPageStatus(row.id, row.status === 'active' ? 'disabled' : 'active');
      await loadRows();
      notify(row.status === 'active' ? `「${row.name}」已停用，官网访问将不再展示。` : `「${row.name}」已启用。`);
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };

  const duplicate = async row => {
    if (!canEdit) return;
    const nextPath = `${row.path || '/page'}-copy`.slice(0, 160);
    if (!window.confirm(`复制「${row.name}」为新页面？新页面路径默认为 ${nextPath}，可稍后修改。`)) return;
    setBusy(true);
    try {
      const detail = await api.cmsPage(row.id);
      const created = await api.createCmsPage({
        name: `${row.name} 副本`.slice(0, 120),
        pageType: row.pageType === 'product_template' ? 'product_template' : 'custom',
        locale: row.locale === '*' ? 'de' : row.locale,
        path: nextPath,
        draft: detail.draft || emptyDraft(),
        seo: detail.draftSeo || {},
      });
      await loadRows();
      notify(`已复制为「${created.name}」，可点击装修继续编辑。`);
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await api.createCmsPage({ ...form, draft: emptyDraft(), seo: {} });
      setCreateOpen(false);
      setForm({ name: '', pageType: 'custom', locale: 'de', path: '' });
      await loadRows();
      notify(`页面「${created.name}」已创建。`);
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };

  const openVersions = async row => {
    setBusy(true); setVersionOf(row); setVersions([]);
    try { setVersions(await api.cmsVersions(row.id)); }
    catch (e) { notify(e.message, true); setVersionOf(null); }
    finally { setBusy(false); }
  };

  const openBuilder = row => {
    if (row.pageType === 'home') { onOpenHomeBuilder?.(); return; }
    onOpenBuilder?.(row.id);
  };

  if (!canEdit) return <section className="card"><h3>页面管理</h3><p className="hint">需要管理员权限。</p></section>;

  return <>
    {/* 统计 */}
    <div className="pg-stats">
      <div className="pg-stat"><span>页面总数</span><strong>{stats.total}</strong></div>
      <div className="pg-stat"><span>已发布</span><strong className="is-on">{stats.published}</strong></div>
      <div className="pg-stat"><span>草稿待发布</span><strong className="is-warn">{stats.pending}</strong></div>
      <div className="pg-stat"><span>已停用</span><strong className="is-off">{stats.disabled}</strong></div>
      <div className="pg-stats__actions">
        <button type="button" className="btn small primary" onClick={() => setCreateOpen(true)}>＋ 新建页面</button>
      </div>
    </div>

    <section className="card">
      <div className="media-toolbar">
        <input type="search" value={filters.q} placeholder="搜索页面名称或路径" onChange={e => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
          <option value="">全部类型</option>
          <option value="home">官网首页</option>
          <option value="custom">普通内容页</option>
          <option value="product_template">商品详情模板</option>
        </select>
        <select value={filters.locale} onChange={e => setFilters({ ...filters, locale: e.target.value })}>
          <option value="">全部语言</option>
          {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" className="btn small" disabled={loading} onClick={loadRows}>{loading ? '加载中…' : '刷新'}</button>
        <span className="hint">共 {rows.length} 个页面</span>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}

      <table className="table pg-table">
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: 116 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: 78 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 300 }} />
        </colgroup>
        <thead>
          <tr>
            <th>页面名称</th>
            <th>页面类型</th>
            <th>语言</th>
            <th>页面 URL</th>
            <th>状态</th>
            <th>草稿更新时间</th>
            <th>已发布时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const published = row.publishedVersion != null;
            const pending = row.hasDraft && (row.publishedVersion == null || row.revision !== row.publishedRevision);
            return (
              <tr key={row.id}>
                <td>
                  <b className="pg-name">{row.name || '未命名页面'}</b>
                  {pending && <span className="pg-dot" title="有未发布修改">待发布</span>}
                </td>
                <td><span className={'pg-type' + (row.pageType === 'home' ? ' is-home' : '')}>{TYPE_LABELS[row.pageType] || row.pageType}</span></td>
                <td>{LANG_LABEL[row.locale] || row.locale}</td>
                <td className="pg-path" title={row.pageType === 'home' ? '/' : `/www/${row.locale}${row.path}`}>
                  {row.pageType === 'home' ? '/' : `/www/${row.locale}${row.path}`}
                </td>
                <td><span className={'pg-state' + (row.status === 'active' ? ' is-on' : ' is-off')}>{STATE_LABELS[row.status] || row.status}</span></td>
                <td className="pg-time">{fmtTime(row.updatedAt)}</td>
                <td className="pg-time">{published ? (row.publishedAt ? fmtTime(row.publishedAt) : <span className="pg-pub">已发布</span>) : <span className="muted">未发布</span>}</td>
                <td>
                  <div className="pg-ops">
                    <button type="button" className="btn small primary" onClick={() => openBuilder(row)}>装修</button>
                    {published
                      ? <a className="btn small" href={row.pageType === 'home' ? '/www/zh' : `/www/${row.locale}${row.path}`} target="_blank" rel="noreferrer">预览</a>
                      : <button type="button" className="btn small" disabled title="发布后才可预览正式页面">预览</button>}
                    <button type="button" className="btn small" disabled={busy} onClick={() => duplicate(row)}>复制</button>
                    <button type="button" className="btn small" disabled={busy} onClick={() => openVersions(row)}>历史</button>
                    {row.pageType !== 'home' && (
                      <button type="button" className="btn small" disabled={busy} onClick={() => toggleStatus(row)}>
                        {row.status === 'active' ? '停用' : '启用'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length && !loading && <tr><td colSpan={8} className="hint" style={{ padding: 28, textAlign: 'center' }}>暂无页面，点击右上角「新建页面」开始。</td></tr>}
        </tbody>
      </table>

      <p className="hint pg-note">
        说明：版本统一按时间标识，不再使用 V1/V2 编号。「已发布时间」取该页面当前线上版本在版本记录中的生成时刻。
      </p>
    </section>

    {/* 版本历史 */}
    {versionOf && (
      <div className="cms-modal" role="dialog" aria-label="历史版本">
        <div className="cms-modal-body">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>历史版本 · {versionOf.name}</h3>
            <button type="button" className="btn small" onClick={() => { setVersionOf(null); setVersions([]); }}>关闭</button>
          </div>
          <table className="table mt16">
            <thead><tr><th>时间</th><th>类型</th><th>状态</th><th>操作人</th></tr></thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.version}>
                  <td className="pg-time">{fmtTime(v.createdAt)}</td>
                  <td>{v.version === versionOf.publishedVersion ? '发布' : '草稿'}</td>
                  <td>{v.version === versionOf.publishedVersion ? <span className="pg-pub">当前线上</span> : <span className="muted">历史版本</span>}</td>
                  <td>{v.createdBy || '—'}</td>
                </tr>
              ))}
              {!versions.length && <tr><td colSpan={4} className="hint">暂无历史记录。</td></tr>}
            </tbody>
          </table>
          <p className="hint mt16">回滚请进入「装修」后在编辑器内操作，回滚会生成新版本，不会删除历史记录。</p>
        </div>
      </div>
    )}

    {/* 新建页面 */}
    {createOpen && (
      <div className="cms-modal" role="dialog" aria-label="新建页面">
        <div className="cms-modal-body" style={{ width: 'min(560px,100%)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>新建页面</h3>
            <button type="button" className="btn small" onClick={() => setCreateOpen(false)}>关闭</button>
          </div>
          <div className="form-grid mt16">
            <label>页面名称<input value={form.name} maxLength={120} placeholder="例如：品牌介绍" onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>页面类型
              <select value={form.pageType} onChange={e => setForm({ ...form, pageType: e.target.value })}>
                <option value="custom">普通内容页</option>
                <option value="product_template">商品详情模板</option>
              </select>
            </label>
            <label>语言
              <select value={form.locale} onChange={e => setForm({ ...form, locale: e.target.value })}>
                {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>页面路径<input value={form.path} maxLength={160} placeholder="/about" onChange={e => setForm({ ...form, path: e.target.value })} /></label>
          </div>
          <p className="hint mt16">路径仅支持小写字母、数字和连字符；与 www / catalog / api 等系统路由冲突的路径会被拒绝。</p>
          <div className="row mt16">
            <button type="button" className="btn primary" disabled={busy || !form.name || !form.path} onClick={create}>{busy ? '创建中…' : '创建'}</button>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>取消</button>
          </div>
        </div>
      </div>
    )}
  </>;
}
