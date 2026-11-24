import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const PAGE_SIZE = 50;
const ACTION_WORDS = {
  account: '账号', approve: '审批通过', application: '申请', assign: '分配', attributes: '参数', bom: 'BOM', cancel: '取消', catalog: '商品目录', center: '网点', change: '修改', color: '颜色', company: '企业', complete: '完成', create: '新增', customer: '客户', decision: '处理决定', dealer: '经销商', delete: '删除', delivery: '发运', dispatch: '发出', draft: '草稿', field: '字段', factory: '工厂', fitments: '适配关系', followup: '回访', home: '首页', interaction: '沟通记录', invoice: '发票', layout: '页面装修', location: '库位', login: '登录', logout: '退出登录', offer: '公开报价', old: '旧件', order: '订单', part: '配件', password: '密码', payment: '收款', portal: '门户', price: '价格', product: '产品', production: '生产', publish: '发布', quote: '报价', receive: '收货/签收', record: '登记', reject: '拒绝', repair: '维修', reset: '重置', restock: '回收入库', review: '审核', return: '退货', refund: '退款', reverse: '冲销', save: '保存', service: '服务', site: '官网', sku: 'SKU', status: '状态', storefront: '商城', substitute: '配件替代', unpublish: '撤下', update: '修改', upload: '上传', user: '用户', version: '版本', vin: 'VIN', vins: 'VIN', warehouse: '仓库', warranty: '质保', vehicle: '车辆', media: '图片/附件', dispose: '处置',
};

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
}

function jsonText(value) {
  if (value == null) return '无';
  try { return JSON.stringify(value, null, 2); } catch { return '内容无法显示'; }
}

function actionLabel(value) {
  const action = String(value || '');
  const parts = action.split(/[._-]/);
  const translated = parts.map(part => ACTION_WORDS[part]);
  return translated.every(Boolean) ? translated.join(' · ') : action || '—';
}

export default function AuditPage({ active = true }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [cat, setCat] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const result = await api.audit();
      if (version === requestVersion.current) setRows(Array.isArray(result) ? result : []);
    } catch (e) {
      if (version === requestVersion.current) setError(e.message || '审计记录读取失败');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) reload();
    return () => { requestVersion.current += 1; };
  }, [active, reload]);

  // 8090 同款分类：订单 / 生产 / 物流 / 财务 / 库存，按 action 前缀粗分
  const catOf = action => {
    const a = String(action || '');
    if (/sales|order|commerce|sample/.test(a)) return '订单';
    if (/production|delivery|bom|factory/.test(a)) return '生产';
    if (/tracking|parcel|shipment|logistics/.test(a)) return '物流';
    if (/finance|payment|allocation|landed|fx|obligation/.test(a)) return '财务';
    if (/stock|warehouse|inventory|condition|adjust/.test(a)) return '库存';
    return '其他';
  };
  const catCounts = useMemo(() => {
    const map = { '': rows.length };
    for (const row of rows) { const c = catOf(row.action); map[c] = (map[c] || 0) + 1; }
    return map;
  }, [rows]);
  const filtered = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return rows
      .filter(row => !cat || catOf(row.action) === cat)
      .filter(row => !query || [row.actor, row.action, row.target].some(value => String(value || '').toLocaleLowerCase().includes(query)));
  }, [rows, filter, cat]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 列表不携带变更全文（跨境传输太重），点「查看」时按 id 拉单条详情。
  const toggleExpand = async row => {
    if (expanded === row.id) { setExpanded(null); setDetail(null); return; }
    setExpanded(row.id); setDetail(null); setDetailLoading(true);
    try { const d = await api.auditDetail(row.id); setDetail(d || { before: null, after: null }); }
    catch (e) { setDetail({ error: e.message || '详情读取失败' }); }
    finally { setDetailLoading(false); }
  };

  return <div className="card">
    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <div><h2 /><p className="hint" /></div>
      <button type="button" className="btn" disabled={loading} onClick={reload}>{loading ? '正在刷新…' : '刷新'}</button>
    </div>
    <div className="row mb12">
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {['', '订单', '生产', '物流', '财务', '库存', '其他'].map(key => <button key={key || 'all'} type="button" className={'btn small' + (cat === key ? ' primary' : '')} onClick={() => { setCat(key); setPage(1); }}>{key || '全部'} {catCounts[key] || 0}</button>)}
      </div>
      <input type="search" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }} placeholder="按操作人、操作类型或对象筛选" aria-label="筛选操作审计" />
      <span className="hint" />
    </div>
    {error && <p className="error-text" role="alert">审计记录读取失败：{error} <button type="button" className="btn small" disabled={loading} onClick={reload}>重试</button></p>}
    <div style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>时间</th><th>操作人</th><th>操作类型</th><th>操作对象</th><th>变更详情</th></tr></thead>
        <tbody>{loading && !rows.length ? <tr><td colSpan={5} className="hint" /></tr>
          : !error && !visible.length ? <tr><td colSpan={5} className="hint" /></tr>
            : visible.map(row => <React.Fragment key={row.id}>
              <tr><td>{formatTime(row.at)}</td><td>{row.actor || '系统'}</td><td title={row.action || ''}>{actionLabel(row.action)}</td><td style={{ overflowWrap: 'anywhere' }}>{row.target || '—'}</td><td><button type="button" className="btn small" aria-expanded={expanded === row.id} onClick={() => toggleExpand(row)}>{expanded === row.id ? '收起' : (row.hasBefore || row.hasAfter ? '查看' : '详情')}</button></td></tr>
              {expanded === row.id && <tr><td colSpan={5}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
                {detailLoading ? <div style={{ gridColumn: '1/-1' }} className="hint">加载详情中…</div>
                  : detail?.error ? <div style={{ gridColumn: '1/-1' }} className="error-text">详情读取失败：{detail.error}</div>
                  : <>
                    <div><strong>变更前</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto', padding: 10, background: 'var(--hover)', marginTop: 6 }}>{jsonText(detail?.before)}</pre></div>
                    <div><strong>变更后</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflow: 'auto', padding: 10, background: 'var(--hover)', marginTop: 6 }}>{jsonText(detail?.after)}</pre></div>
                  </>}
              </div></td></tr>}
            </React.Fragment>)}</tbody>
      </table>
    </div>
    <div className="row mt16" style={{ justifyContent: 'flex-end' }}>
      <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(value => value - 1)}>上一页</button>
      <span className="hint" />
      <button type="button" className="btn small" disabled={currentPage >= pageCount} onClick={() => setPage(value => value + 1)}>下一页</button>
    </div>
  </div>;
}
