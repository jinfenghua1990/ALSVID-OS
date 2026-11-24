import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const STATUS = { connected: '已连接', configured: '已配置', unconfigured: '未配置', error: '连接异常', unavailable: '不可用' };

export default function SystemConnectionsPage() {
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.systemConnections();
      setConnections(Array.isArray(data.connections) ? data.connections : []);
      setError('');
    } catch (e) {
      setConnections([]);
      setError(e.status === 404 ? '后台服务尚未更新，请重启本机 8089 服务后重新检查。' : e.message || '连接信息读取失败，请稍后重试。');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return <div className="page">
    <header className="prod-head">
      <div>
        <div className="prod-head__eyebrow">SYSTEM CONNECTIONS</div>
        <h2>连接状态</h2>
        <p className="hint">查看业务数据、文件对象与素材分类分别连接到哪里。密钥与密码不会显示。</p>
      </div>
      <div className="prod-head__actions"><button className="btn small" type="button" disabled={loading} onClick={load}>{loading ? '检查中…' : '重新检查'}</button></div>
    </header>

    {error && <section className="card" role="alert"><strong>连接信息暂不可用</strong><p className="hint">{error}</p></section>}
    {loading && !connections.length && !error && <section className="card"><p className="hint">正在检查连接…</p></section>}
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      {connections.map(item => <section className="card" key={item.id}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3>{item.name}</h3>
          <span className={'tag ' + (item.status === 'connected' ? 'on' : 'plan')}>{STATUS[item.status] || item.status}</span>
        </div>
        <p className="hint">{item.purpose}</p>
        <dl className="connection-details">
          <div><dt>服务商</dt><dd>{item.provider || '—'}</dd></div>
          {item.endpoint && <div><dt>端点</dt><dd className="mono">{item.endpoint}</dd></div>}
          <div><dt>目标</dt><dd className="mono">{item.target || '—'}</dd></div>
        </dl>
      </section>)}
    </div>
    {connections.length > 0 && <section className="card" style={{ marginTop: 16 }}>
      <h3>素材数据流</h3>
      <p className="hint">上传文件 → 图片或视频本体写入对象存储 → 文件信息、产品/营销/页面分类及关联关系写入素材库。两部分都成功后，素材才会完整显示。</p>
    </section>}
  </div>;
}
