import React, { useEffect, useState } from 'react';
import { api } from './api.js';

function Modal({ title, onClose, children, foot, wide }) {
  return (
    <div className="mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head"><h3>{title}</h3>
          <button className="btn small" onClick={onClose}>关闭</button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ---------------- 全局字段标准库 ----------------
   规范 4.1：新增字段必须先注册到全局字段标准库，再分配给产品类型模板。 */
export function FieldLibDialog({ onClose, onChanged }) {
  const [fields, setFields] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    code: '', nameZh: '', type: 'text', unit: '',
    options: '', level: 'product', templates: [], required: false,
    skuGen: false, searchable: true, shopVisible: false,
  });
  const [err, setErr] = useState('');

  const refresh = () => api.fields().then(setFields).catch(e => setErr(e.message));
  useEffect(() => { refresh(); }, []);

  const toggleTpl = (code) => setForm(f => ({
    ...f,
    templates: f.templates.includes(code) ? f.templates.filter(c => c !== code) : [...f.templates, code],
  }));

  const submit = async () => {
    setErr('');
    if (!/^[a-z][a-z0-9_]*$/.test(form.code)) { setErr('字段编码需为小写字母开头的 snake_case，如 motor_power'); return; }
    if (!form.nameZh) { setErr('中文名称必填'); return; }
    if (form.skuGen) {
      const options = form.type === 'enum' ? form.options.split(/[，,]/).map(value => value.trim()).filter(Boolean) : [];
      if (form.level !== 'sku' || !form.templates.length || !options.length || options.some(value => !/^[A-Z0-9]{1,8}$/.test(value)) || new Set(options).size !== options.length) { setErr('参与 SKU 生成的字段须为 SKU 级枚举，选项为不重复的 1–8 位大写字母或数字，并分配模板'); return; }
    }
    try {
      await api.addField({
        ...form,
        options: form.type === 'enum' ? form.options.split(/[，,]/).map(s => s.trim()).filter(Boolean) : [],
      });
      setShowAdd(false);
      refresh(); onChanged();
    } catch (e) { setErr(e.message); }
  };

  const toggleEnabled = async (f) => {
    setErr('');
    try {
      await api.updateField(f.code, { enabled: !f.enabled });
      refresh(); onChanged();
    } catch (e) { setErr(e.message); }
  };

  const body = !showAdd ? (
        <table className="table">
          <thead><tr>
            <th>字段编码</th><th>中文名称</th><th>类型</th>
            <th>单位</th><th>层级</th><th>适用模板</th><th>参与SKU</th><th>状态</th>
          </tr></thead>
          <tbody>
            {fields.map(f => (
              <tr key={f.code}>
                <td style={{ fontFamily: 'Consolas, monospace' }}>{f.code}</td>
                <td>{f.nameZh}{f.required ? <span style={{ color: 'var(--danger)' }}>*</span> : null}</td>
                <td>{{ text: '文本', number: '数字', enum: '枚举' }[f.type] || '未知类型'}</td><td>{f.unit}</td>
                <td>{f.level === 'product' ? '产品级' : f.level === 'sku' ? 'SKU 级' : 'BOM 级'}</td>
                <td>{(f.templates || []).join('、')}</td>
                <td>{f.skuGen ? '是' : '—'}</td>
                <td>
                  <span className={'tag ' + (f.enabled ? 'on' : 'off')}>{f.enabled ? '启用' : '停用'}</span>
                  <button className="btn small" style={{ marginLeft: 6 }} onClick={() => toggleEnabled(f)}>
                    {f.enabled ? '停用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>
          <div className="form-grid">
            <div className="field"><label>字段编码（唯一）<span className="req">*</span></label>
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="如 motor_power" /></div>
            <div className="field"><label>中文名称 <span className="req">*</span></label>
              <input value={form.nameZh} onChange={e => setForm({ ...form, nameZh: e.target.value })} /></div>
            <div className="field"><label>数据类型</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="text">文本</option><option value="number">数字</option><option value="enum">枚举</option>
              </select></div>
            <div className="field"><label>单位</label>
              <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="如 kg / Wh" /></div>
            <div className="field"><label>枚举选项（逗号分隔）</label>
              <input value={form.options} disabled={form.type !== 'enum'}
                onChange={e => setForm({ ...form, options: e.target.value })} placeholder="如 中折,竖折,横折" /></div>
            <div className="field"><label>字段层级</label>
              <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
                <option value="product">产品级</option><option value="sku">SKU 级</option><option value="bom">BOM 项目级</option>
              </select></div>
            <div className="field fg-span"><label>适用的产品类型模板（同类产品自动加载）</label>
              <div className="checkbox-row">
                <TplChecks onToggle={toggleTpl} selected={form.templates} />
              </div></div>
            <div className="field fg-span"><label>属性</label>
              <div className="checkbox-row">
                <label><input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} />必填</label>
                <label><input type="checkbox" checked={form.skuGen} onChange={e => setForm({ ...form, skuGen: e.target.checked })} />参与 SKU 生成</label>
                <label><input type="checkbox" checked={form.searchable} onChange={e => setForm({ ...form, searchable: e.target.checked })} />可搜索</label>
                <label><input type="checkbox" checked={form.shopVisible} onChange={e => setForm({ ...form, shopVisible: e.target.checked })} />未来商城展示</label>
              </div></div>
          </div>
          {err && <div className="error-text mt8">{err}</div>}
          <div className="row mt16">
            <button className="btn primary" onClick={submit}>保存字段</button>
            <button className="btn" onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      );
  const actions = (
    <>
      <span className="hint grow" style={{ alignSelf: 'center' }} />
      {!showAdd && <button className="btn primary" onClick={() => setShowAdd(true)}>新增字段</button>}
    </>
  );
  return <Modal wide title="全局字段标准库" onClose={onClose} foot={actions}>{body}</Modal>;
}

function TplChecks({ onToggle, selected }) {
  const [tpls, setTpls] = useState([]);
  useEffect(() => { api.meta().then(m => setTpls(m.templates || [])).catch(() => {}); }, []);
  return <>
    {tpls.map(t => (
      <label key={t.code}>
        <input type="checkbox" checked={selected.includes(t.code)} onChange={() => onToggle(t.code)} />
        {t.name}（{t.code}）
      </label>
    ))}
  </>;
}

/* ---------------- 统一颜色字典 ----------------
   规范 6.1：整车产品页与编辑器 SKU TAB 两个入口打开同一份全局颜色数据。 */
export function ColorDictDialog({ onClose, onChanged, quickMode }) {
  const [colors, setColors] = useState([]);
  const [form, setForm] = useState({ code: '', zh: '', hex: '#666666', ral: '', sort: 50 });
  const [err, setErr] = useState('');

  const refresh = () => api.colors().then(setColors).catch(e => setErr(e.message));
  useEffect(() => { refresh(); }, []);

  const submit = async () => {
    setErr('');
    if (!/^[A-Z0-9]{3}$/.test(form.code)) { setErr('颜色代码须为 3 位大写字母或数字'); return; }
    if (!form.zh) { setErr('中文名称必填'); return; }
    try {
      await api.addColor(form);
      setForm({ code: '', zh: '', hex: '#666666', ral: '', sort: 50 });
      refresh(); onChanged();
      if (quickMode) onClose();
    } catch (e) { setErr(e.message); }
  };

  return (
    <Modal title={quickMode ? '新增颜色（统一颜色字典）' : '统一颜色字典'} onClose={onClose} foot={
      quickMode ? undefined : <span className="hint grow" />
    }>
      {!quickMode && (
        <table className="table mb12">
          <thead><tr>
            <th>颜色代码</th><th>中文名称</th><th>HEX</th><th>RAL</th><th>排序</th><th>状态</th>
          </tr></thead>
          <tbody>
            {colors.map(c => (
              <tr key={c.code}>
                <td><span className="color-dot" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: c.hex, border: '1px solid rgba(0,0,0,.15)', marginRight: 6 }} /><span style={{ fontFamily: 'Consolas, monospace' }}>{c.code}</span></td>
                <td>{c.zh}</td><td>{c.hex}</td><td>{c.ral || <span className="hint" />}</td><td>{c.sort}</td>
                <td><span className={'tag ' + (c.enabled ? 'on' : 'off')}>{c.enabled ? '启用' : '停用'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="form-grid">
        <div className="field"><label>颜色代码（SKU 第四段，3 位）<span className="req">*</span></label>
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="如 RED" /></div>
        <div className="field"><label>中文名称 <span className="req">*</span></label>
          <input value={form.zh} onChange={e => setForm({ ...form, zh: e.target.value })} /></div>
        <div className="field"><label>HEX 色值</label>
          <input type="color" style={{ height: 30, padding: 2 }} value={form.hex} onChange={e => setForm({ ...form, hex: e.target.value })} /></div>
        <div className="field"><label>RAL 标准色号</label>
          <input value={form.ral || ''} placeholder="如 RAL 9005" onChange={e => setForm({ ...form, ral: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label>排序</label>
          <input type="number" value={form.sort} onChange={e => setForm({ ...form, sort: Number(e.target.value) })} /></div>
      </div>
      {err && <div className="error-text mt8">{err}</div>}
      <div className="row mt16">
        <button className="btn accent" onClick={submit}>保存颜色</button>
        {!quickMode && <span className="hint" />}
      </div>
    </Modal>
  );
}

export default Modal;
