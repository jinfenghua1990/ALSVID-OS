import { useCallback, useEffect, useMemo, useState } from 'react';
// api.js 导出的是具名对象 api，不是默认导出，必须按名取。
import { api } from '../api.js';

// 装修发布版本管理：列表、对比、回滚。
// 设计前提：版本快照是回滚的唯一依据，所以这里对「表未建立」必须显式提示，
// 而不是静默显示空列表 —— 否则运营会以为发布过很多版本。

const ORIGIN_LABEL = { publish: '发布', rollback: '回滚', manual: '手动保存', locale: '语言发布 / 下线' };

function formatTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false });
}

// 表格里只放 MM-DD HH:mm，鼠标悬停再看完整时间，避免时间列吃掉半行宽度
function formatShortTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const p = n => String(n).padStart(2, '0');
  return `${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

// 操作人列只显示邮箱前缀，完整地址放 title
function shortActor(value) {
  if (!value) return '—';
  return String(value).split('@')[0];
}

function bytesLabel(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '—';
  return size >= 1024 ? (size / 1024).toFixed(1) + ' KB' : size + ' B';
}

// 按行做近似差异。不做 LCS 是刻意的：装修 HTML 单版几十 KB，
// 完整 diff 对运营没有意义，他们需要的是「这次到底动了哪些区块」。
function lineSummary(before, after) {
  const toLines = (html) => String(html || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const a = toLines(before), b = toLines(after);
  const setA = new Set(a), setB = new Set(b);
  const removed = a.filter((line) => !setB.has(line));
  const added = b.filter((line) => !setA.has(line));
  return { removed, added, linesA: a.length, linesB: b.length };
}

export default function StorefrontLayoutVersions({ currentVersion, onRolledBack }) {
  const [state, setState] = useState({ loading: true, available: true, items: [], reason: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [compare, setCompare] = useState({ a: null, b: null, result: null });
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api.layoutVersions(50);
      setState({ loading: false, available: result.available !== false, items: result.items || [], reason: result.reason || '' });
    } catch (reason) {
      setState({ loading: false, available: true, items: [], reason: '' });
      setError(reason.message || '读取版本历史失败');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runCompare = async () => {
    if (!compare.a || !compare.b || busy) return;
    setBusy('compare'); setError(''); setCompare((current) => ({ ...current, result: null }));
    try {
      const [left, right] = await Promise.all([
        api.layoutVersionDetail(compare.a),
        api.layoutVersionDetail(compare.b),
      ]);
      setCompare((current) => ({ ...current, result: { left, right, html: lineSummary(left.html, right.html), css: lineSummary(left.css, right.css), leftLocales: Object.keys(left.locales || {}), rightLocales: Object.keys(right.locales || {}) } }));
    } catch (reason) {
      setError(reason.message || '版本对比失败');
    } finally { setBusy(''); }
  };

  const rollback = async (version) => {
    if (busy) return;
    if (!window.confirm('回滚会把线上首页切换为 v' + version + ' 的快照。\n当前版本不会被删除，回滚本身也会记录为新版本。确定继续？')) return;
    setBusy('rollback'); setError(''); setNotice('');
    try {
      const result = await api.rollbackLayout({ version, note });
      const revalidate = result.data?.storefrontRevalidate;
      const revalidateNote = revalidate?.ok
        ? '前台缓存已刷新（' + revalidate.ms + 'ms）。'
        : revalidate?.skipped
          ? '未配置前台刷新：' + revalidate.reason + '。'
          : '前台刷新失败：' + (revalidate?.reason || '未知原因') + '，可等待缓存自然过期或手动重试。';
      setNotice('已回滚到 v' + version + '，当前线上版本变为 v' + (result.data?.publishedVersion ?? '—') + '。' + revalidateNote);
      setNote('');
      await load();
      onRolledBack?.(result.data);
    } catch (reason) {
      setError(reason.message || '回滚失败');
    } finally { setBusy(''); }
  };

  const currentLabel = useMemo(() => (currentVersion ? 'v' + currentVersion : '未发布'), [currentVersion]);

  if (state.loading) return <section className="card"><p className="hint">正在读取发布版本…</p></section>;

  return <section className="card vl-panel">
    <div className="vl-head">
      <div>
        <h3>版本管理</h3>
        <p className="hint">当前线上 {currentLabel} · 回滚不改历史，每次回滚记为一个新版本</p>
      </div>
      <button className="btn small" type="button" onClick={load} disabled={Boolean(busy)}>刷新</button>
    </div>

    {error && <p className="vl-msg vl-error" role="alert">{error}</p>}
    {notice && <p className="vl-msg vl-ok" role="status">{notice}</p>}

    {!state.available && <div className="vl-msg vl-error">
      <strong>版本历史不可用：</strong>{state.reason || '版本历史表尚未建立'}
      <br />在迁移 178 执行前，发布不会留下可回滚的快照。正式上线前必须完成该迁移并开启严格模式。
    </div>}

    {state.available && !state.items.length && <p className="hint vl-empty">还没有版本记录。保存版本或发布后这里会出现快照。</p>}

    {state.available && state.items.length > 0 && <table className="table vl-table">
      <colgroup>
        <col style={{ width: '7%' }} /><col style={{ width: '12%' }} /><col style={{ width: '9%' }} />
        <col style={{ width: '12%' }} /><col style={{ width: '8%' }} /><col style={{ width: '28%' }} />
        <col style={{ width: '14%' }} /><col style={{ width: '10%' }} />
      </colgroup>
      <thead><tr><th>版本</th><th>时间</th><th>来源</th><th>操作人</th><th>快照</th><th>备注</th><th>对比</th><th>操作</th></tr></thead>
      <tbody>{state.items.map((item) => {
        const isCurrent = currentVersion === item.version;
        return <tr key={item.version}>
          <td><strong>v{item.version}</strong>{isCurrent && <span className="vl-live">线上</span>}</td>
          <td title={formatTime(item.publishedAt)}>{formatShortTime(item.publishedAt)}</td>
          <td>{ORIGIN_LABEL[item.origin] || item.origin}{item.rolledBackFrom ? ' ← v' + item.rolledBackFrom : ''}</td>
          <td title={item.publishedBy || ''}>{shortActor(item.publishedBy)}</td>
          <td>{bytesLabel(item.bytes)}</td>
          <td className="vl-note" title={item.note || ''}>{item.note || '—'}</td>
          <td>
            <label className={'vl-ab' + (compare.a === item.version ? ' is-on' : '')} title="选为对比 A">
              <input type="checkbox" checked={compare.a === item.version} onChange={(event) => setCompare((current) => ({ ...current, a: event.target.checked ? item.version : null, result: null }))} /> A
            </label>
            <label className={'vl-ab' + (compare.b === item.version ? ' is-on' : '')} title="选为对比 B">
              <input type="checkbox" checked={compare.b === item.version} onChange={(event) => setCompare((current) => ({ ...current, b: event.target.checked ? item.version : null, result: null }))} /> B
            </label>
          </td>
          <td>
            <button className="btn small" type="button" disabled={Boolean(busy) || isCurrent} onClick={() => rollback(item.version)} title={isCurrent ? '这就是当前线上版本' : '把线上切换为该版本'}>回滚</button>
          </td>
        </tr>;
      })}</tbody>
    </table>}

    {state.available && state.items.length > 0 && <div className="vl-actions">
      <button className="btn small" type="button" disabled={!compare.a || !compare.b || compare.a === compare.b || Boolean(busy)} onClick={runCompare}>
        {busy === 'compare' ? '对比中…' : '对比 v' + (compare.a ?? '?') + ' ↔ v' + (compare.b ?? '?')}
      </button>
      <input className="input vl-noteinput" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="回滚备注（可选）" title="回滚时记入版本历史，例如：新版式首屏错位，回退到上一版" />
      <span className="hint">表格里用 A / B 勾两版</span>
    </div>}

    {compare.result && <div className="vl-diff">
      <h4>v{compare.a} → v{compare.b} 的差异</h4>
      <p className="hint">按行近似比较：HTML {compare.result.html.linesA} → {compare.result.html.linesB} 行，CSS {compare.result.css.linesA} → {compare.result.css.linesB} 行 ·
        语言快照 [{(compare.result.leftLocales || []).join(', ') || '—'}] → [{(compare.result.rightLocales || []).join(', ') || '—'}]</p>
      <div className="vl-diffcols">
        <div><strong className="hint">仅在 v{compare.a} 中（{compare.result.html.removed.length} 行）</strong>
          <pre className="vl-code vl-code-old">{(compare.result.html.removed.slice(0, 12).join('\n') || '（无）').slice(0, 2000)}</pre>
        </div>
        <div><strong className="hint">仅在 v{compare.b} 中（{compare.result.html.added.length} 行）</strong>
          <pre className="vl-code vl-code-new">{(compare.result.html.added.slice(0, 12).join('\n') || '（无）').slice(0, 2000)}</pre>
        </div>
      </div>
    </div>}
  </section>;
}
