import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// 线上支付统一适配层（骨架页）
// 目标：把 6 种支付方式的坑位全部占住，标清优先级（P0/P1/P2）与当前状态。
// 未接入适配器的服务商明确显示 NOT_IMPLEMENTED，绝不显示「已支持」或伪造可支付状态。
// 密钥只存服务端，本页只展示末 4 位提示（credentialHint），不展示完整凭据。

const STATUS_TEXT = {
  NOT_IMPLEMENTED: { label: '适配器未接入', tone: 'warn' },
  NOT_CONFIGURED: { label: '待配置凭据', tone: 'warn' },
  READY: { label: '已就绪', tone: 'ok' },
  DISABLED: { label: '已停用', tone: 'muted' },
};
const PRIORITY_TEXT = { P0: 'P0 · 上线必须', P1: 'P1 · 第二阶段', P2: 'P2 · 第三阶段' };

export default function PaymentProviders({ active }) {
  const [providers, setProviders] = useState(null);
  const [schemaReady, setSchemaReady] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try {
      const result = await api.paymentProviders();
      setProviders(result.providers || []);
      setSchemaReady(result.schemaReady !== false);
    }
    catch (e) { setError(e.message || '支付方式读取失败'); }
  }
  useEffect(() => { if (active) load(); }, [active]);

  async function save() {
    setBusy(true);
    try {
      const config = {};
      for (const key of dialog.required) if (dialog.form[key]) config[key] = dialog.form[key];
      const result = await api.savePaymentProvider(dialog.provider, { config, enabled: dialog.form.enabled });
      setDialog(null);
      await load();
      if (result.adapterStatus === 'READY') setError('配置已保存（适配器就绪）。请再点「测试连通性」确认可用。');
    } catch (e) { setError(e.message || '保存失败'); }
    finally { setBusy(false); }
  }
  async function test(provider) {
    setBusy(true);
    try {
      const result = await api.testPaymentProvider(provider);
      setError(result.ok ? `连通性测试通过：${result.reason || 'OK'}` : `未通过：${result.reason || '未知原因'}`);
      await load();
    } catch (e) { setError(e.message || '测试失败'); }
    finally { setBusy(false); }
  }

  const readyCount = providers?.filter(p => p.adapterStatus === 'READY').length || 0;

  return <div className="shop-work">
    <section className="card">
      <div className="card-title">线上支付 · 统一适配层
        <span className="card-sub">6 种支付方式 · 业务代码只对接统一接口，服务商是适配器实现</span>
      </div>
      <div className="src-banner">
        <span>已就绪 <strong>{readyCount}</strong> / {providers?.length || 6}</span>
        <span className="hint">未接入适配器的方式显示「适配器未接入」，不会误报为已支持；上线前需达成 P0（信用卡 + PayPal）。</span>
      </div>
      {error && <div className="form-error">{error}</div>}
      {!schemaReady && <div className="src-banner">
        <span className="warn-tag">表结构未就绪</span>
        <span className="hint">迁移 180（payment_providers / payment_intents / payment_webhook_events）尚未应用，当前仅展示静态骨架；应用迁移后即可保存配置与测试连通性。</span>
      </div>}

      {!providers && !error && <div className="padmin-empty">加载中…</div>}
      {providers && <div className="payment-grid">
        {providers.map(p => {
          const status = STATUS_TEXT[p.adapterStatus] || STATUS_TEXT.NOT_IMPLEMENTED;
          return <div key={p.provider} className="mkt-card payment-card">
            <div className="payment-card__head">
              <strong>{p.displayName}</strong>
              <span className="priority-tag">{PRIORITY_TEXT[p.priority]}</span>
            </div>
            <div className="payment-card__status">
              <span className={status.tone === 'ok' ? 'ok-tag' : 'warn-tag'}>{status.label}</span>
              {p.credentialHint && <span className="hint mono">{p.credentialHint}</span>}
              {p.lastTestAt && <span className="hint">上次测试：{new Date(p.lastTestAt).toLocaleString('zh-CN')}</span>}
            </div>
            <p className="hint">{p.docs}</p>
            <div className="payment-card__required">
              <span className="hint">需要配置：</span>
              <span className="mono">{p.required.join(' · ')}</span>
            </div>
            <div className="payment-card__actions">
              <button className="btn small" type="button" disabled={!schemaReady}
                title={schemaReady ? '' : '迁移 180 未应用，暂不能保存配置'}
                onClick={() => setDialog({
                  provider: p.provider, required: p.required,
                  form: Object.fromEntries(p.required.map(key => [key, ''])),
                })}>{p.configured ? '更新配置' : '填写配置'}</button>
              <button className="btn small" type="button" disabled={busy || p.adapterStatus === 'NOT_IMPLEMENTED'}
                title={p.adapterStatus === 'NOT_IMPLEMENTED' ? '适配器未接入，无法测试' : ''}
                onClick={() => test(p.provider)}>测试连通性</button>
            </div>
          </div>;
        })}
      </div>}

      <p className="hint">
        接入顺序：<strong>P0 信用卡（Visa/Mastercard）+ PayPal</strong> → P1 Apple Pay + Google Pay → P2 Klarna + SEPA。
        适配器接入后，先在此填写服务端凭据并测试连通性，再启用；支付成功以服务商回调验签 + ALSVID 订单实际付清状态为准，与浏览器是否跳到成功页无关。
      </p>
      <p className="hint">
        订单与财务数据仍以 ALSVID 自有记录为准；回调按服务商事件 ID 幂等去重，重复通知不会重复入账。银行转账 / 现金的手动收款登记保持原流程不变。
      </p>
    </section>

    {dialog && <div className="dialog-mask" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(null); }}>
      <div className="dialog">
        <div className="card-title">填写支付配置<span className="card-sub">{dialog.provider}</span></div>
        <p className="hint">密钥只写入服务端配置表，页面只保存末 4 位提示，不会回显完整凭据。</p>
        {dialog.required.map(key => <label key={key} className="field">
          <span className="mono">{key}</span>
          <input type="password" value={dialog.form[key] || ''} autoComplete="off"
            onChange={e => setDialog({ ...dialog, form: { ...dialog.form, [key]: e.target.value } })} />
        </label>)}
        <label className="field"><span>启用此支付方式</span>
          <input type="checkbox" checked={Boolean(dialog.form.enabled)}
            onChange={e => setDialog({ ...dialog, form: { ...dialog.form, enabled: e.target.checked } })} />
        </label>
        <div className="dialog__actions">
          <button className="btn" type="button" disabled={busy} onClick={() => setDialog(null)}>取消</button>
          <button className="btn primary" type="button" disabled={busy} onClick={save}>保存</button>
        </div>
      </div>
    </div>}
  </div>;
}
