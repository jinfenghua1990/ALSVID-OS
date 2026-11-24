import React,{useCallback,useEffect,useState} from 'react';
import {api} from '../api.js';

// 交付包裹：整车车体与独立锂电池强制分包裹、独立签收。
// 完整交付按每个 VIN 的车体 + 电池签收状态合并判断，不用「已发包数/2」推算。
// 一个包裹可登记多个物流编号（货代运单/承运商运单/其他），只增不删、留痕。

const emptyForm={vin:'',batterySn:'',carrier:'',cartonNo:'',bodyTracking:'',batteryTracking:'',hazmatApproved:false};
const TRACKING_TYPES=['货代运单','承运商运单','其他'];
const emptyTrackingForm={parcelId:'',trackingType:'货代运单',trackingNo:''};

export default function DeliveryParcels({orderId,deliveries=[],disabled=false}){
  const [deliveryId,setDeliveryId]=useState('');
  const [parcels,setParcels]=useState([]);
  const [trackingMap,setTrackingMap]=useState({});
  const [trForm,setTrForm]=useState(emptyTrackingForm);
  const [overview,setOverview]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState(emptyForm);

  const loadOverview=useCallback(async()=>{
    if(!orderId){setOverview(null);return}
    try{setOverview(await api.deliveryOverview(orderId))}catch(_){setOverview(null)}
  },[orderId]);

  const loadParcels=useCallback(async id=>{
    if(!id){setParcels([]);setTrackingMap({});return}
    try{const r=await api.deliveryParcels(id);const rows=r.parcels||[];setParcels(rows);setError('');
      const trackings=await Promise.all(rows.map(p=>api.deliveryParcelTrackings(p.id).catch(()=>({parcelId:p.id,trackings:[]}))));
      setTrackingMap(Object.fromEntries(trackings.map(t=>[t.parcelId,t.trackings||[]])));
    }catch(e){setError(e.message)}
  },[]);

  useEffect(()=>{loadOverview()},[loadOverview]);
  useEffect(()=>{loadParcels(deliveryId)},[deliveryId,loadParcels]);

  const refresh=async()=>{await loadParcels(deliveryId);await loadOverview()};

  const submit=async event=>{
    event.preventDefault();
    if(disabled)return;
    if(!deliveryId){setError('请先选择发货单');return}
    const vin=form.vin.trim(),batterySn=form.batterySn.trim();
    if(!vin||!batterySn){setError('车体 VIN 与电池 SN 必填，二者不得合箱');return}
    setBusy(true);
    try{
      await api.createDeliveryParcels(deliveryId,[
        {componentType:'车体',vin,cartonNo:form.cartonNo.trim(),carrier:form.carrier.trim(),trackingNo:form.bodyTracking.trim(),quantity:1},
        {componentType:'电池',vin,batterySn,cartonNo:form.cartonNo.trim(),carrier:form.carrier.trim(),trackingNo:form.batteryTracking.trim(),quantity:1,hazmatUn:'UN3480',hazmatApproved:form.hazmatApproved}
      ]);
      setForm(emptyForm);
      await refresh();
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const submitTracking=async()=>{
    if(!trForm.parcelId||!trForm.trackingNo.trim())return;
    setBusy(true);
    try{
      await api.addDeliveryParcelTracking(trForm.parcelId,{trackingType:trForm.trackingType,trackingNo:trForm.trackingNo.trim()});
      setTrForm(emptyTrackingForm);
      const r=await api.deliveryParcelTrackings(trForm.parcelId);
      setTrackingMap(m=>({...m,[trForm.parcelId]:r.trackings||[]}));
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const act=async(action,id)=>{
    if(disabled)return;
    setBusy(true);
    try{await action(id);await refresh()}
    catch(e){setError(e.message)}finally{setBusy(false)}
  };

  const vehicles=overview?.vehicles||[];
  const totals=overview?.totals;

  return <div className="card dlv-parcels">
    <h3>交付包裹 · 车体与电池分件</h3>
    <p className="hint">车体与电池独立包装、独立追踪；一个包裹可登记多个物流编号（货代运单、承运商运单等）。</p>
    {error&&<p className="error-text">{error}</p>}

    <label className="field inline parcels-batch">发货单
      <select value={deliveryId} onChange={e=>setDeliveryId(e.target.value)} disabled={disabled}>
        <option value="">选择发货单</option>
        {deliveries.map(d=><option key={d.id} value={d.id}>{d.shipmentNo} · {d.status}</option>)}
      </select>
    </label>

    {totals&&<table className="table">
      <thead><tr><th>整车</th><th>包裹</th><th>待发运</th><th>在途</th><th>已签收</th><th>异常</th><th>完整交付</th><th>部分交付</th></tr></thead>
      <tbody><tr>
        <td>{totals.vehicles}</td><td>{totals.parcels}</td><td>{totals.pending}</td><td>{totals.dispatched}</td>
        <td>{totals.delivered}</td><td>{totals.abnormal}</td><td>{totals.vehiclesComplete}</td><td>{totals.vehiclesPartial}</td>
      </tr></tbody>
    </table>}

    {vehicles.length>0&&<table className="table">
      <thead><tr><th>VIN</th><th>车体</th><th>电池</th><th>结论</th></tr></thead>
      <tbody>{vehicles.map(v=><tr key={v.vin}>
        <td>{v.vin}</td>
        <td>{v.body?v.body.status:'—'}</td>
        <td>{v.battery?v.battery.status:(v.missingBattery?'未创建':'—')}</td>
        <td>{v.complete?'完整交付':v.abnormal?'异常':v.partial?'部分交付':'未交付'}</td>
      </tr>)}</tbody>
    </table>}

    {parcels.length>0&&<table className="table">
      <thead><tr><th>包裹</th><th>组件</th><th>VIN / 电池 SN</th><th>箱号</th><th>承运商</th><th>物流编号</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>{parcels.map(p=>{
        const trackings=trackingMap[p.id]||[];
        return <tr key={p.id}>
        <td>{p.parcelNo}</td>
        <td>{p.componentType}</td>
        <td>{p.vin||'—'}{p.batterySn?` / ${p.batterySn}`:''}</td>
        <td>{p.cartonNo||'—'}</td>
        <td>{p.carrier||'—'}</td>
        <td className="parcels-trackcell">
          {trackings.length?trackings.map(t=><div key={t.id} className="hint">{t.trackingType}：{t.trackingNo}</div>):(p.trackingNo||'—')}
          {!disabled&&(trForm.parcelId===p.id
            ?<div className="parcels-trackform">
              <select value={trForm.trackingType} onChange={e=>setTrForm({...trForm,trackingType:e.target.value})}>
                {TRACKING_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
              <input value={trForm.trackingNo} maxLength={120} placeholder="物流编号" onChange={e=>setTrForm({...trForm,trackingNo:e.target.value})} />
              <button className="btn small" disabled={busy||!trForm.trackingNo.trim()} onClick={submitTracking}>保存</button>
              <button className="btn small" onClick={()=>setTrForm(emptyTrackingForm)}>取消</button>
            </div>
            :<button className="btn small" disabled={busy} onClick={()=>setTrForm({...emptyTrackingForm,parcelId:p.id})}>+ 添加物流编号</button>)}
        </td>
        <td>{p.status}{p.hazmatUn&&!p.hazmatApproved?' · 危品未审核':''}</td>
        <td>
          {p.status==='待发运'&&<button className="btn small" disabled={busy||disabled} onClick={()=>act(api.dispatchDeliveryParcel,p.id)}>确认发运</button>}
          {['已交运','运输中','异常'].includes(p.status)&&<button className="btn small" disabled={busy||disabled} onClick={()=>act(api.receiveDeliveryParcel,p.id)}>登记签收</button>}
          {p.status==='已签收'&&<span className="hint" />}
        </td>
      </tr>})}</tbody>
    </table>}

    {!deliveryId&&<p className="hint" />}

    <form className="parcels-form" onSubmit={submit}>
      <h4>新增一组整车包裹</h4>
      <label className="field inline">车体 VIN<input value={form.vin} disabled={disabled} onChange={e=>setForm({...form,vin:e.target.value})} placeholder="A1VIN..." /></label>
      <label className="field inline">电池 SN<input value={form.batterySn} disabled={disabled} onChange={e=>setForm({...form,batterySn:e.target.value})} placeholder="BAT..." /></label>
      <label className="field inline">箱号<input value={form.cartonNo} disabled={disabled} onChange={e=>setForm({...form,cartonNo:e.target.value})} /></label>
      <label className="field inline">承运商<input value={form.carrier} disabled={disabled} onChange={e=>setForm({...form,carrier:e.target.value})} placeholder="DHL / DPD" /></label>
      <label className="field inline">车体运单号<input value={form.bodyTracking} disabled={disabled} onChange={e=>setForm({...form,bodyTracking:e.target.value})} /></label>
      <label className="field inline">电池运单号<input value={form.batteryTracking} disabled={disabled} onChange={e=>setForm({...form,batteryTracking:e.target.value})} /></label>
      <label className="field inline parcels-check"><input type="checkbox" checked={form.hazmatApproved} disabled={disabled} onChange={e=>setForm({...form,hazmatApproved:e.target.checked})} />危品合规已审核</label>
      <button className="btn" type="submit" disabled={busy||disabled||!deliveryId}>生成车体 + 电池包裹</button>
      <p className="hint" />
    </form>
  </div>;
}
