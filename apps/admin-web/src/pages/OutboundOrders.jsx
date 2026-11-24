import React,{useCallback,useEffect,useState} from 'react';
import {api} from '../api.js';
import {uuidv7} from '../uuidv7.js';

// 统一出库单（G6）：销售出库 / 配件出库 / 其他出库。
// 规则：出库单确认后才扣减实际库存并写 inventory_ledger（source_type='outbound_order'）；
// 出库按指定来源库位记账；误出库走「出库退回」反向记账，不直接改库存数字。

const SOURCE_TYPES=['销售出库','配件出库','其他出库'];
const blankForm={sourceType:'销售出库',warehouseId:'',locationId:'',sourceRef:'',note:'',items:[{sku:'',quantity:1,note:''}]};
function requestFingerprint(value){const text=JSON.stringify(value);let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return `${text.length}-${hash>>>0}`}

export default function OutboundOrders({user}){
  const [orders,setOrders]=useState([]);
  const [warehouses,setWarehouses]=useState([]);
  const [products,setProducts]=useState([]);
  const [locations,setLocations]=useState([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(blankForm);
  const [ret,setRet]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [orders,warehouses,products]=await Promise.all([api.outboundOrders(),api.warehouses(),api.products()]);
      setOrders(orders);setWarehouses(warehouses);setProducts(products);setError('');
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[]);
  useEffect(()=>{load()},[load]);

  useEffect(()=>{
    let active=true;
    if(!form.warehouseId){setLocations([]);return}
    api.warehouseLocations(form.warehouseId)
      .then(rows=>{if(active)setLocations((rows||[]).filter(l=>l.status==='启用'))})
      .catch(()=>{if(active)setLocations([])});
    return()=>{active=false};
  },[form.warehouseId]);

  const admin=user?.role==='admin';
  const rows=orders.filter(o=>(!statusFilter||o.status===statusFilter)&&(!query||[o.outboundNo,o.sourceRef,o.warehouse,o.location,o.note].join(' ').toLowerCase().includes(query.toLowerCase())));

  const changeItem=(index,key,value)=>{setForm(f=>({...f,items:f.items.map((item,i)=>i===index?{...item,[key]:value}:item)}))};

  const submit=async event=>{
    event.preventDefault();
    const items=form.items.filter(x=>x.sku.trim());
    if(!items.length){setError('请至少填写一条出库明细');return}
    setBusy(true);setError('');
    try{
      await api.createOutboundOrder({id:uuidv7(),sourceType:form.sourceType,warehouseId:form.warehouseId,locationId:form.locationId||null,sourceRef:form.sourceRef.trim(),note:form.note.trim(),items:items.map(x=>({sku:x.sku.trim(),quantity:Number(x.quantity),note:x.note.trim()}))});
      setForm(blankForm);setShowForm(false);
      await load();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const confirmOrder=async id=>{
    setBusy(true);setError('');
    try{await api.confirmOutboundOrder(id);await load()}
    catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const cancelOrder=async id=>{
    const reason=window.prompt('填写取消出库单的原因');
    if(reason===null)return;
    if(!reason.trim()){setError('取消原因不能为空');return}
    setBusy(true);setError('');
    try{await api.cancelOutboundOrder(id,reason.trim());await load()}
    catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const openReturn=order=>{
    const items=(order.items||[]).map(x=>({sku:x.skuCode,quantity:Number(x.quantity),returnedQuantity:Number(x.returnedQuantity||0),returnNow:String(Number(x.quantity)-Number(x.returnedQuantity||0))}));
    setRet({order,items,reason:'',idempotencyKey:uuidv7()});
  };

  const submitReturn=async()=>{
    if(!ret)return;
    const items=ret.items.map(x=>({sku:x.sku,quantity:Number(x.returnNow)||0})).filter(x=>x.quantity>0);
    if(!items.length){setError('请填写本次退回数量');return}
    if(!ret.reason.trim()){setError('请填写退回原因');return}
    const payload={reason:ret.reason.trim(),items},signature=requestFingerprint(payload),storageKey=`alsvid:outbound-return:${ret.order.id}`;
    let idempotencyKey=ret.idempotencyKey;
    try{const pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(pending?.signature===signature)idempotencyKey=pending.idempotencyKey;else sessionStorage.setItem(storageKey,JSON.stringify({signature,idempotencyKey}))}catch{}
    setBusy(true);setError('');
    try{
      await api.returnOutboundOrder(ret.order.id,{...payload,idempotencyKey});
      try{const pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(pending?.idempotencyKey===idempotencyKey)sessionStorage.removeItem(storageKey)}catch{}
      setRet(null);
      await load();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const returnable=o=>o.ledgerSource==='outbound_order'&&o.status==='已完成'&&(o.items||[]).some(x=>Number(x.returnedQuantity||0)<Number(x.quantity));
  const ledgerLabel={outbound_order:'',sales_order:'扣账：B2C 销售发货',repair_stock_event:'扣账：售后领料'};

  return <div className="prod">
    <div className="prod-head">
      <div>
        <h2>出库单</h2>
        <p className="hint">确认出库后才扣减实际库存，按来源库位记账。误出库请用「出库退回」反向冲销，不直接改库存。</p>
      </div>
      <div className="prod-head__actions">
        <button className="btn" onClick={load} disabled={loading}>刷新</button>
        {admin&&<button className="btn primary" onClick={()=>setShowForm(v=>!v)}>{showForm?'收起新建':'新建出库单'}</button>}
      </div>
    </div>
    {error&&<p className="error-text">{error}</p>}
    <div className="prod-filters">
      <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索单号 / 来源单据 / 仓库 / 库位 / 备注"/>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="">全部状态</option>
        {['待出库','已完成','已退回','已取消'].map(s=><option key={s}>{s}</option>)}
      </select>
    </div>

    {showForm&&admin&&<form className="card ob-form" onSubmit={submit}>
      <h3>新建出库单</h3>
      <div className="ob-form__grid">
        <label>出库类型
          <select value={form.sourceType} onChange={e=>setForm({...form,sourceType:e.target.value})}>
            {SOURCE_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </label>
        <label>目标仓库
          <select required value={form.warehouseId} onChange={e=>setForm({...form,warehouseId:e.target.value,locationId:''})}>
            <option value="">选择已启用仓库</option>
            {warehouses.filter(w=>w.status==='启用').map(w=><option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}
          </select>
        </label>
        <label>来源库位
          <select value={form.locationId} onChange={e=>setForm({...form,locationId:e.target.value})} disabled={!form.warehouseId}>
            <option value="">仓库主库位</option>
            {locations.map(l=><option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
          </select>
        </label>
        <label>来源单据
          <input value={form.sourceRef} maxLength={120} placeholder="销售订单号 / 维修工单号 / 业务编号" onChange={e=>setForm({...form,sourceRef:e.target.value})}/>
        </label>
        <label>备注
          <input value={form.note} maxLength={500} onChange={e=>setForm({...form,note:e.target.value})}/>
        </label>
      </div>
      <table className="table ob-items">
        <thead><tr><th>SKU</th><th>数量</th><th>明细备注</th><th></th></tr></thead>
        <tbody>
          {form.items.map((item,index)=><tr key={index}>
            <td><input list="ob-sku-list" value={item.sku} maxLength={80} placeholder="SKU 编码" onChange={e=>changeItem(index,'sku',e.target.value)}/></td>
            <td><input type="number" min="1" value={item.quantity} onChange={e=>changeItem(index,'quantity',e.target.value)}/></td>
            <td><input value={item.note} maxLength={300} onChange={e=>changeItem(index,'note',e.target.value)}/></td>
            <td>{form.items.length>1&&<button type="button" className="btn small" onClick={()=>setForm(f=>({...f,items:f.items.filter((_,i)=>i!==index)}))}>删除</button>}</td>
          </tr>)}
        </tbody>
      </table>
      <datalist id="ob-sku-list">{products.flatMap(p=>(p.skus||[]).map(s=><option key={s.sku} value={s.sku}>{p.name}</option>))}</datalist>
      <div className="ob-form__foot">
        <button type="button" className="btn small" onClick={()=>setForm(f=>({...f,items:[...f.items,{sku:'',quantity:1,note:''}]}))}>+ 添加明细</button>
        <button className="btn primary" disabled={busy}>{busy?'保存中…':'保存出库单'}</button>
        <span className="hint">保存后状态为「待出库」，确认出库时才扣减库存。</span>
      </div>
    </form>}

    {ret&&admin&&<div className="card ob-form">
      <h3>出库退回 · {ret.order.outboundNo}</h3>
      <p className="hint">按原单明细反向记账，退回数量不能超过可退数量；全部退回后单据状态变为「已退回」。</p>
      <table className="table ob-items">
        <thead><tr><th>SKU</th><th>已出库</th><th>已退回</th><th>可退</th><th>本次退回</th></tr></thead>
        <tbody>{ret.items.map((item,index)=>{
          const remain=item.quantity-item.returnedQuantity;
          return <tr key={item.sku}>
            <td>{item.sku}</td>
            <td>{item.quantity}</td>
            <td>{item.returnedQuantity}</td>
            <td>{remain}</td>
            <td><input type="number" min="0" max={remain} value={item.returnNow} onChange={e=>setRet(r=>({...r,idempotencyKey:uuidv7(),items:r.items.map((x,i)=>i===index?{...x,returnNow:e.target.value}:x)}))}/></td>
          </tr>;
        })}</tbody>
      </table>
      <div className="ob-form__grid">
        <label className="ob-span">退回原因
          <input value={ret.reason} maxLength={500} placeholder="必填，例如：单据误确认 / 客户退单" onChange={e=>setRet(r=>({...r,reason:e.target.value,idempotencyKey:uuidv7()}))}/>
        </label>
      </div>
      <div className="ob-form__foot">
        <button className="btn primary" disabled={busy} onClick={submitReturn}>{busy?'提交中…':'确认退回'}</button>
        <button className="btn" disabled={busy} onClick={()=>setRet(null)}>取消</button>
      </div>
    </div>}

    <div className="card table-scroll">
      <table className="table">
        <thead><tr><th>出库单号</th><th>出库类型</th><th>来源单据</th><th>仓库 / 库位</th><th>出库明细</th><th>状态</th><th>创建人 / 时间</th><th>确认出库</th><th>操作</th></tr></thead>
        <tbody>{rows.map(o=><tr key={o.id}>
          <td>{o.outboundNo}</td>
          <td>{o.sourceType}{ledgerLabel[o.ledgerSource]&&<div className="hint">{ledgerLabel[o.ledgerSource]}</div>}</td>
          <td>{o.sourceRef||'—'}</td>
          <td>{o.warehouse}{o.locationCode&&<div className="hint">{o.locationCode} · {o.location}</div>}</td>
          <td>{(o.items||[]).map(x=>`${x.skuCode} × ${x.quantity}${Number(x.returnedQuantity||0)>0?`（已退 ${x.returnedQuantity}）`:''}`).join('、')||'—'}{o.note&&<div className="hint">{o.note}</div>}</td>
          <td>{o.status}{o.cancelReason&&<div className="hint">{o.cancelReason}</div>}{o.returnReason&&<div className="hint">退回：{o.returnReason}</div>}</td>
          <td>{o.createdBy||'—'}<div className="hint">{new Date(o.createdAt).toLocaleString('zh-CN')}</div></td>
          <td>{o.confirmedAt?`${o.confirmedBy||''} ${new Date(o.confirmedAt).toLocaleString('zh-CN')}`:'—'}</td>
          <td>
            {admin&&o.status==='待出库'&&o.ledgerSource==='outbound_order'&&<>
              <button className="btn small" disabled={busy} onClick={()=>confirmOrder(o.id)}>完成出库</button>
              <button className="btn small" disabled={busy} onClick={()=>cancelOrder(o.id)}>取消</button>
            </>}
            {admin&&returnable(o)&&<button className="btn small" disabled={busy} onClick={()=>openReturn(o)}>出库退回</button>}
            {!admin&&o.status!=='待出库'&&<span className="hint">—</span>}
            {admin&&o.status!=='待出库'&&!returnable(o)&&<span className="hint">—</span>}
          </td>
        </tr>)}{!rows.length&&<tr><td className="empty-cell" colSpan="9">暂无出库单</td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
