import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function CustomsHistory({ delivery, onClose }) {
  const [rows, setRows] = useState(null), [error, setError] = useState('');
  useEffect(() => { let active = true; api.deliveryCustomsHistory(delivery.id).then(value => { if (active) setRows(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [delivery.id]);
  return <section className="card"><div className="row" style={{justifyContent:'space-between'}}><h3>清关变更历史 · {delivery.shipmentNo}</h3><button className="btn small" onClick={onClose}>关闭</button></div>{error&&<p role="alert" className="error-text">{error}</p>}{rows===null&&!error?<p className="hint">读取中…</p>:rows?.length?<table className="table"><thead><tr><th>时间</th><th>操作人</th><th>此前状态</th><th>更新后状态</th><th>参考号</th><th>说明</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.changedAt}-${index}`}><td>{new Date(row.changedAt).toLocaleString('zh-CN')}</td><td>{row.actor||'—'}</td><td>{row.before?.customsStatus||'—'}</td><td>{row.after?.customsStatus||'—'}</td><td>{row.after?.customsReference||'—'}</td><td>{row.after?.customsNote||'—'}</td></tr>)}</tbody></table>:!error&&<p className="hint">暂无清关状态变更记录。</p>}</section>;
}
