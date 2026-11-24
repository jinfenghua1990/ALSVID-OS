import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const models = { standard: 'Standard', pro: 'Pro' };
const colours = { sample: '样车绿', black: '黑色', blue: '蓝色', silver: '银色' };

export default function ColourInterestAdmin({ active, user }) {
  const [summary, setSummary] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || user?.role !== 'admin') return;
    let current = true;
    setSummary(null); setError('');
    api.colourInterest().then(result => { if (current) setSummary(result.data); })
      .catch(failure => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [active, user?.role, attempt]);
  if (user?.role !== 'admin') return <div className="card">仅管理员可查看颜色偏好。</div>;
  return <section className="card"><h2>A1 Ultra 颜色偏好</h2>
    <p>仅统计主动保存的匿名浏览会话；这不是库存、订单或可售颜色统计。</p>
    <button type="button" className="btn" onClick={() => setAttempt(value => value + 1)}>刷新</button>
    {error ? <p role="alert">读取失败：{error}</p> : !summary ? <p>正在加载…</p> : <>
      <p>偏好总数：{summary.total}</p>
      {summary.lastSelection && <p>最近保存：{new Date(summary.lastSelection).toLocaleString('zh-CN')}</p>}
      {summary.variants.length ? <table className="table"><thead><tr><th>车型</th><th>颜色</th><th>会话数</th></tr></thead><tbody>{summary.variants.map(row => <tr key={`${row.model}:${row.colour}`}><td>{models[row.model] || row.model}</td><td>{colours[row.colour] || row.colour}</td><td>{row.count}</td></tr>)}</tbody></table> : <p>暂无颜色偏好。</p>}
    </>}
  </section>;
}
