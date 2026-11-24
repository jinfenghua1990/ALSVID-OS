import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatCents } from '../storefront-cart.js';

const TABS = [
  ['all', '全部评价', 'total'],
  ['pending', '待回复', 'pending'],
  ['replied', '已回复', 'replied'],
  ['bad', '差评（1-2星）', 'bad'],
  ['hidden', '已隐藏', 'hidden'],
];

const num = value => { const n = Number(value); return Number.isFinite(n) ? n : 0; };

// uuidv7 前缀是时间戳，取尾部 12 位才能唯一区分不同订单
function shortId(id) {
  const value = String(id || '').replace(/-/g, '');
  return (value.length > 12 ? value.slice(-12) : value).toUpperCase();
}

function stamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Stars({ rating }) {
  const score = Math.max(1, Math.min(5, num(rating)));
  return (
    <span className={'shop-stars' + (score <= 2 ? ' is-bad' : score === 3 ? ' is-mid' : '')} aria-label={`${score} 星`}>
      {'★★★★★'.slice(0, score)}<span className="shop-stars__empty">{'★★★★★'.slice(score)}</span>
    </span>
  );
}

export default function StorefrontReviewsAdmin({ active = true, onDirtyChange }) {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [reply, setReply] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => { setKeyword(query.trim()); setPage(1); }, 320);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await api.storefrontReviews({ page, status: tab, q: keyword });
      if (version !== loadVersion.current) return;
      setRows(Array.isArray(data.items) ? data.items : []);
      setHasMore(Boolean(data.hasMore));
      setCounts(data.counts || {});
      setLoadError('');
    } catch (e) {
      if (version === loadVersion.current) setLoadError(e.message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [page, tab, keyword]);

  useEffect(() => { if (active) load(); }, [active, load]);
  useEffect(() => () => { loadVersion.current++; }, []);
  useEffect(() => { onDirtyChange?.(Boolean(reply)); }, [reply, onDirtyChange]);

  const saveReply = async () => {
    if (!reply || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.replyStorefrontReview(reply.id, reply.text);
      setReply(null);
      await load();
      setNotice('回复已保存，官网评价区会同步显示。');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const toggleHidden = async (row, hidden) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.setStorefrontReviewVisibility(row.id, hidden);
      await load();
      setNotice(hidden ? '已隐藏，官网不再展示该评价。' : '已恢复展示。');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const average = num(counts.average).toFixed(1);
  const visible = num(counts.visible);
  const goodRate = visible ? Math.round(num(counts.good) * 100 / visible) : 0;
  const reset = () => { setQuery(''); setKeyword(''); setTab('all'); setPage(1); setError(''); setNotice(''); };

  const tips = [];
  if (num(counts.pending)) tips.push(<span key="pending">有 <b>{counts.pending}</b> 条评价还没回复，回复会展示在官网商品页。<button type="button" className="shop-tips__link" onClick={() => { setTab('pending'); setPage(1); }}>去回复 →</button></span>);
  if (num(counts.bad)) tips.push(<span key="bad">有 <b>{counts.bad}</b> 条 1-2 星差评需要跟进处理。<button type="button" className="shop-tips__link" onClick={() => { setTab('bad'); setPage(1); }}>查看差评 →</button></span>);

  return (
    <section className="card shop-grid">
      <div className="shop-grid__tabs">
        {TABS.map(([key, label, counter]) => (
          <button type="button" key={key} className={'shop-grid__tab' + (tab === key ? ' is-active' : '')} onClick={() => { setTab(key); setPage(1); }}>
            {label}<em>{num(counts[counter]).toLocaleString()}</em>
          </button>
        ))}
        <div className="shop-grid__tabs-right">
          <input type="search" className="shop-grid__search" placeholder="搜索评价内容 / 买家 / 订单号" value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索评价" />
          <button type="button" className="btn small" onClick={reset}>重置</button>
        </div>
      </div>

      <div className="shop-grid__bar">
        <div className="shop-score">
          <span className="shop-score__value">{average}</span>
          <span className="shop-score__meta">综合评分 · 好评率 {goodRate}% · 共 {visible} 条公开评价</span>
        </div>
        <span className="shop-grid__bar-sep" />
        <button type="button" className="btn small" disabled={loading || busy} onClick={() => load()}>{loading ? '读取中…' : '刷新'}</button>
        <span className="shop-grid__count">本页 {rows.length} 条</span>
      </div>

      {tips.length > 0 && <div className="shop-tips">{tips}</div>}
      {error && <div className="shop-tips shop-tips--error" role="alert">{error}</div>}
      {notice && <div className="shop-tips shop-tips--note" role="status">{notice}</div>}
      {loadError && <div className="shop-tips shop-tips--error" role="alert">评价读取失败：{loadError} <button type="button" className="shop-tips__link" onClick={() => load()}>重试</button></div>}

      {rows.length ? (
        <div className="shop-grid__scroll">
          <table className="shop-grid__table shop-review__table">
            <colgroup>
              <col style={{ width: 'auto', minWidth: 380 }} />
              <col style={{ width: 176 }} />
              <col style={{ width: 108 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>评价内容</th>
                <th>订单 / 金额</th>
                <th>回复状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={row.hidden ? 'is-muted' : undefined}>
                  <td>
                    <div className="shop-review__head">
                      <Stars rating={row.rating} />
                      <span className="shop-review__buyer">{row.username || '匿名买家'}</span>
                      <span className="shop-grid__time">{stamp(row.createdAt)}</span>
                      {row.hidden && <span className="shop-badge is-mute">已隐藏</span>}
                    </div>
                    <p className="shop-review__text">{row.content || <span className="shop-grid__muted">买家未填写文字评价</span>}</p>
                    <div className="shop-review__items">
                      {(row.items || []).map((item, index) => <span className="shop-chip shop-chip--plain" key={item.sku + index}>{item.productName || '商品'} · {item.sku}</span>)}
                    </div>
                    {row.reply && (
                      <div className="shop-review__reply">
                        <b>卖家回复</b>
                        <span>{row.reply}</span>
                        <em>{stamp(row.repliedAt)}{row.repliedBy ? ` · ${row.repliedBy}` : ''}</em>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="shop-grid__id">{shortId(row.orderId)}</div>
                    <div className="shop-grid__muted">{row.currency} {formatCents(String(row.subtotalMinor ?? '0'))}</div>
                    <div className="shop-grid__muted">{row.delivery?.country || '—'}</div>
                  </td>
                  <td>
                    {row.hidden ? <span className="shop-badge is-mute">已隐藏</span> : row.reply ? <span className="shop-badge is-ok">已回复</span> : <span className="shop-badge is-warn">待回复</span>}
                  </td>
                  <td>
                    <div className="shop-grid__ops">
                      <button type="button" className="shop-link is-strong" disabled={busy} onClick={() => setReply({ id: row.id, text: row.reply || '', buyer: row.username || '买家' })}>{row.reply ? '修改回复' : '回复评价'}</button>
                      {row.hidden
                        ? <button type="button" className="shop-link" disabled={busy} onClick={() => toggleHidden(row, false)}>恢复展示</button>
                        : <button type="button" className="shop-link" disabled={busy} onClick={() => toggleHidden(row, true)}>隐藏评价</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="shop-empty">{loading ? '正在读取评价…' : num(counts.total) ? '当前筛选条件下没有评价，试试切换状态标签。' : '还没有买家评价。买家在订单签收后可在官网「我的订单」里评价，评价会显示在这里。'}</div>
      )}

      <div className="shop-grid__foot">
        <span className="shop-grid__picked">{num(counts.pending) ? `${counts.pending} 条待回复` : ''}</span>
        <div className="shop-pager">
          <span>共 {num(counts.total).toLocaleString()} 条</span>
          <button type="button" className="btn small" disabled={page <= 1 || loading || busy} onClick={() => { setRows([]); setPage(p => p - 1); }}>上一页</button>
          <span>第 {page} 页</span>
          <button type="button" className="btn small" disabled={!hasMore || loading || busy} onClick={() => { setRows([]); setPage(p => p + 1); }}>下一页</button>
        </div>
      </div>

      {reply && (
        <div className="mask" role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) setReply(null); }}>
          <div className="modal shop-modal" role="dialog" aria-modal="true" aria-label="回复评价">
            <div className="modal-head"><h3>回复 {reply.buyer} 的评价</h3><button type="button" className="btn small" disabled={busy} onClick={() => setReply(null)}>关闭</button></div>
            <div className="modal-body">
              <p className="hint" />
              <textarea className="shop-modal__textarea" rows={5} maxLength={2000} value={reply.text} onChange={e => setReply({ ...reply, text: e.target.value })} placeholder="感谢您的反馈…" />
              <div className="shop-modal__foot">
                <span className="shop-grid__muted">{reply.text.length} / 2000</span>
                <button type="button" className="btn primary" disabled={busy || !reply.text.trim()} onClick={saveReply}>保存回复</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
