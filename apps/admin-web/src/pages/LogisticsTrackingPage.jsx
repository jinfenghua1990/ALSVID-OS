import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {api} from '../api.js';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

/*
 * 生产交付 · 物流跟踪
 * 两个来源合并看：
 *  1) 生产发运单（production_deliveries）：工厂/备货发货，含销售订单派生的直发发运单；
 *  2) 销售订单直发（sales_orders.tracking_no）：仓库现货出库的单不产生生产发运单，只落在销售订单上。
 * 两边按「销售订单号 + 运单号」去重，避免同一票在两条流里重复出现。
 */

const day=value=>value?new Date(value).toLocaleDateString('zh-CN'):'—';
const dayTime=value=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const money=(value,currency)=>{const n=Number(value||0);const symbol={CNY:'¥',EUR:'€',USD:'$'}[currency]||'';return `${symbol}${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`};

export default function LogisticsTrackingPage({active=true,user}){
  const admin=user?.role==='admin';
  const [deliveries,setDeliveries]=useState([]);
  const [sales,setSales]=useState(null);
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [panel,setPanel]=useState(null);      // {row, events}
  const [eventForm,setEventForm]=useState(null);
  const [busy,setBusy]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [list,tracking]=await Promise.all([api.deliveries({status:statusFilter}),api.salesOrderTracking({})]);
      setDeliveries(Array.isArray(list)?list:[]);setSales(tracking||null);
    }catch(e){setError(e.message||'物流数据读取失败')}
    finally{setLoading(false)}
  },[statusFilter]);
  useEffect(()=>{if(active)load()},[active,load]);

  const openPanel=async row=>{
    setError('');
    try{
      const events=await api.trackingEvents({delivery:row.id});
      setPanel({row,events:Array.isArray(events)?events:[]});
    }catch(e){setError(e.message)}
  };

  const submitEvent=async event=>{
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError('');
    try{
      await api.addTrackingEvent({
        deliveryUuid:panel.row.id,
        trackingNo:eventForm.trackingNo||panel.row.trackingNo||'',
        status:eventForm.status,
        location:eventForm.location,
        source:eventForm.source,
        note:eventForm.note,
        eventTime:eventForm.eventTime||undefined,
      });
      setEventForm(null);
      const events=await api.trackingEvents({delivery:panel.row.id});
      setPanel({row:panel.row,events:Array.isArray(events)?events:[]});
    }catch(e){setError(e.message||'事件登记失败')}
    finally{setBusy(false)}
  };

  const EVENT_PRESETS=['已揽收','已离港','到港','清关中','已放行','派送中','已签收','异常'];

  const openEvent=row=>{
    setEventForm({trackingNo:row.trackingNo||'',status:'',location:'',source:'手工',note:'',eventTime:''});
    openPanel(row);
  };

  // 已出运的销售单：有运单号的 + 已经派生出生产发运单的，两种都要看得到。
  // 早前这里多加了 !row.delivery_uuid，等于把工厂直发的单全滤掉，区块永远是空的。
  const salesShipments=useMemo(()=>{
    const rows=(sales?.shipments||[]);
    if(!query.trim())return rows;
    const needle=query.trim().toLowerCase();
    return rows.filter(row=>[row.order_no,row.customer_name,row.tracking_no,row.carrier,row.sku_code].some(value=>String(value||'').toLowerCase().includes(needle)));
  },[sales,query]);

  const factoryDeliveries=useMemo(()=>{
    if(!query.trim())return deliveries;
    const needle=query.trim().toLowerCase();
    return deliveries.filter(row=>[row.shipmentNo,row.orderNo,row.sku,row.trackingNo,row.carrier,row.warehouse].some(value=>String(value||'').toLowerCase().includes(needle)));
  },[deliveries,query]);

  const inTransit=deliveries.filter(row=>row.status==='在途').length;
  const freightTotal=deliveries.reduce((sum,row)=>sum+Number(row.freightCost||0),0);
  const stats=[
    ['发运单（当前筛选）',deliveries.length],
    ['其中在途',inTransit],
    ['运费合计',`¥${freightTotal.toLocaleString('zh-CN',{maximumFractionDigits:0})}`],
    ['包裹数',deliveries.reduce((sum,row)=>sum+Number(row.parcelCount||0),0)],
    ['已出运销售单',salesShipments.length],
    ['销售在途',sales?.metrics?.inTransit??0],
    ['销售已妥投',sales?.metrics?.delivered??0],
  ];

  // 销售单维度的事件：走发运单的按发运单查，没发运单的按订单号查。
  const openSalesEvents=async row=>{
    setError('');
    try{
      const events=row.delivery_uuid
        ? await api.trackingEvents({delivery:row.delivery_uuid})
        : await api.trackingEvents({order:row.order_no});
      setPanel({row,events:Array.isArray(events)?events:[]});
    }catch(e){setError(e.message||'物流事件读取失败')}
  };

  return <div className="page">
    <header className="prod-head">
      <div>
        <div className="prod-head__eyebrow">LOGISTICS TRACKING</div>
        <h2>物流跟踪</h2>
        <p className="hint">生产发运单与销售直发运单合并视图：谁发的、走哪家承运商、到哪一步、还有多久到港。</p>
      </div>
      <div className="prod-head__actions">
        <label className="field" style={{maxWidth:160}}><select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}>
          {[['','全部状态'],['在途','在途'],['已签收','已签收'],['已入库','已入库'],['待发运','待发运'],['已取消','已取消']].map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field" style={{maxWidth:260}}><input type="search" placeholder="运单号 / 发运单 / 订单号 / 承运商" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <button className="btn" disabled={loading} onClick={load}>{loading?'刷新中…':'刷新'}</button>
      </div>
    </header>

    {error&&<p className="error-text" role="alert">{error}</p>}

    <section className="metric-grid" aria-label="物流总览">
      {stats.map(([label,value])=><article className="metric-card" key={label}><span className="metric-label">{label}</span><strong>{value}</strong></article>)}
    </section>

    <section className="card">
      <h3>发运单</h3>
      <p className="hint">来自 production_deliveries 的全部发运记录：工厂发货与备货调拨。销售订单走工厂直发时，出运会自动生成一条发运单。切换上方状态可以看历史（已签收 / 已入库的发运单默认也在这里）。</p>
      {loading?<p role="status">正在读取发运单…</p>:(factoryDeliveries.length?<div className="table-scroll"><table className="table">
        <thead><tr><th>发运单号</th><th>生产单</th><th>SKU</th><th>数量</th><th>发运仓</th><th>承运商 / 运单</th><th>包裹 / 事件</th><th>ETA</th><th>运费</th><th>签收 / 入库</th><th>清关</th><th>状态</th><th>VIN</th><th></th></tr></thead>
        <tbody>{factoryDeliveries.map(row=><tr key={row.id} className="order-openable" title="双击查看物流事件" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>openPanel(row))}>
          <td>{row.shipmentNo}<small className="block">{day(row.shippedAt)}</small></td>
          <td>{row.orderNo}</td>
          <td><span className="tag sku">{row.sku}</span></td>
          <td>{row.plannedQuantity}{row.receivedQuantity?` / 收 ${row.receivedQuantity}`:''}</td>
          <td>{row.warehouse||'—'}<small className="block">{row.warehouseKind||''}</small></td>
          <td>{row.carrier||'—'}<small className="block">{row.trackingNo||''}</small></td>
          <td>{row.parcelCount||0} 件<small className="block">{row.eventCount||0} 条事件</small></td>
          <td>{day(row.etaDate)}</td>
          <td>{row.freightCost?`¥${Number(row.freightCost).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—'}</td>
          <td className="hint">{row.receivedAt?String(row.receivedAt).slice(0,10):'—'}</td>
          <td>{row.customsStatus||'—'}</td>
          <td><span className={'tag '+(row.status==='在途'?'on':row.status==='已取消'?'off':'plan')}>{row.status}</span></td>
          <td>{(row.vins||[]).join(', ')||'—'}</td>
          <td className="nowrap"><button className="btn small" onClick={()=>openPanel(row)}>事件</button>{admin&&<button className="btn small" onClick={()=>openEvent(row)}>＋事件</button>}</td>
        </tr>)}</tbody>
      </table></div>:<p className="hint">暂无发运单。</p>)}
    </section>

    <section className="card">
      <h3>已出运销售单</h3>
      <p className="hint">按销售订单看物流：运单号优先取生产发运单上的，没有发运单的取订单自带的。点「事件」看这一单的完整轨迹。</p>
      {loading?<p role="status">正在读取销售运单…</p>:(salesShipments.length?<div className="table-scroll"><table className="table">
        <thead><tr><th>销售订单</th><th>客户 / 目的国</th><th>SKU</th><th>数量</th><th>金额</th><th>承运商 / 运单</th><th>发运单</th><th>出运日</th><th>ETA</th><th>状态</th><th></th></tr></thead>
        <tbody>{salesShipments.map(row=><tr key={row.order_uuid} className="order-openable" title="双击查看物流事件" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>openSalesEvents(row))}>
          <td>{row.order_no}<small className="block">{row.fulfillment_type==='WAREHOUSE_PICK'?'仓库现货出库':'工厂直发'}</small></td>
          <td>{row.customer_name||'—'}<small className="block">{row.destination||''}</small></td>
          <td><span className="tag sku">{row.sku_code}</span></td>
          <td>{row.quantity}</td>
          <td>{money(row.sale_amount,row.currency)}</td>
          <td>{row.carrier||'—'}<small className="block">{row.tracking_no||''}</small></td>
          <td>{row.shipment_no||'—'}<small className="block">{row.parcel_count?row.parcel_count+' 件':''}</small></td>
          <td>{day(row.shipped_at)}</td>
          <td>{day(row.eta)}</td>
          <td><span className={'tag '+(['DELIVERED','COMPLETED'].includes(row.status)?'':'on')}>{sales?.statusLabels?.[row.status]||row.status}</span></td>
          <td><button className="btn small" onClick={()=>openSalesEvents(row)}>事件</button></td>
        </tr>)}</tbody>
      </table></div>:<p className="hint">还没有出运过的销售单。订单完成生产、登记运单号后会出现在这里。</p>)}
    </section>

    {panel&&<div className="modal-backdrop" role="presentation"><div className="card form-panel">
      <div className="row">
        <h2>{panel.row.shipmentNo||panel.row.order_no} · 物流事件</h2>
        <span className="hint">{panel.row.carrier||''} {panel.row.trackingNo||panel.row.tracking_no||''}</span>
        <span style={{flex:1}}/>
        <button type="button" className="btn" onClick={()=>{setPanel(null);setEventForm(null)}}>关闭</button>
      </div>
      {error&&<p className="error-text">{error}</p>}
      {panel.events.length?<div className="table-scroll"><table className="table">
        <thead><tr><th>业务时间</th><th>状态</th><th>位置</th><th>来源</th><th>备注</th><th>登记人</th><th>接收时间</th></tr></thead>
        <tbody>{panel.events.map(item=><tr key={item.id}>
          <td>{dayTime(item.event_time)}</td>
          <td><span className="tag on">{item.status}</span></td>
          <td>{item.location||'—'}</td>
          <td>{item.source}</td>
          <td>{item.note||'—'}</td>
          <td>{item.actor||'—'}</td>
          <td className="hint">{dayTime(item.received_at)}</td>
        </tr>)}</tbody>
      </table></div>:<p className="hint">这条发运单还没有事件。出运时会自动写入「已揽收」，后续节点可手工登记。</p>}

      {admin&&<form onSubmit={submitEvent} style={{marginTop:14}}>
        <div className="form-grid">
          <label className="field">事件状态 *
            <input required maxLength="120" list="eventPresets" value={eventForm?eventForm.status:''} onChange={event=>setEventForm({...eventForm,status:event.target.value})} placeholder="例如：到港 / 清关中"/>
            <datalist id="eventPresets">{EVENT_PRESETS.map(x=><option key={x} value={x}/>)}</datalist>
          </label>
          <label className="field">发生地点<input maxLength="300" value={eventForm?eventForm.location:''} onChange={event=>setEventForm({...eventForm,location:event.target.value})}/></label>
          <label className="field">数据来源<select value={eventForm?eventForm.source:'手工'} onChange={event=>setEventForm({...eventForm,source:event.target.value})}>{['手工','DHL','货代','其他'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label className="field">业务时间<input type="datetime-local" value={eventForm?eventForm.eventTime:''} onChange={event=>setEventForm({...eventForm,eventTime:event.target.value})}/></label>
          <label className="field">备注<input maxLength="200" value={eventForm?eventForm.note:''} onChange={event=>setEventForm({...eventForm,note:event.target.value})}/></label>
        </div>
        <div className="row" style={{marginTop:10}}>
          <span className="hint">留空业务时间则按当前时间登记。</span>
          <span style={{flex:1}}/>
          <button className="btn primary" disabled={busy||!eventForm||!eventForm.status}>{busy?'提交中…':'登记事件'}</button>
        </div>
      </form>}
    </div></div>}
  </div>;
}
