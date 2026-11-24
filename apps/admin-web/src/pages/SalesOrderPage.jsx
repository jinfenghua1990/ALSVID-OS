import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api.js';
import {createRequestIds} from '../request-ids.js';
import SalesOrderOverview from '../components/SalesOrderOverview.jsx';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

/*
 * B2B渠道 · 销售订单
 * 与「生产交付」解耦：本页只从销售视角看订单、金额、交期与履约方式；
 * 工厂排产细节仍在「生产交付 › 工厂订单」，物流细节在「生产交付 › 物流跟踪」。
 * 数据落在 alsvid_v2.sales_orders（迁移 164）。
 */

const STATUS_ORDER=['WAIT_WAREHOUSE_PICK','WAIT_PRODUCTION','IN_PRODUCTION','READY_TO_SHIP','IN_TRANSIT','DELIVERED','COMPLETED','CANCELLED'];
const STATUS_TONE={WAIT_WAREHOUSE_PICK:'plan',WAIT_PRODUCTION:'plan',IN_PRODUCTION:'on',READY_TO_SHIP:'on',IN_TRANSIT:'on',DELIVERED:'',COMPLETED:'',CANCELLED:'off'};
const TIMELINE_STATUS={
  WAIT_WAREHOUSE_PICK:'WAIT_WAREHOUSE_PICK',待仓库拣货:'WAIT_WAREHOUSE_PICK',
  WAIT_PRODUCTION:'WAIT_PRODUCTION',待排产:'WAIT_PRODUCTION',
  IN_PRODUCTION:'IN_PRODUCTION',开始生产:'IN_PRODUCTION',
  READY_TO_SHIP:'READY_TO_SHIP',已完工:'READY_TO_SHIP',
  IN_TRANSIT:'IN_TRANSIT',已出运:'IN_TRANSIT',运输中:'IN_TRANSIT',
  DELIVERED:'DELIVERED',COMPLETED:'COMPLETED',已结案:'COMPLETED',已签收:'COMPLETED',
};
const TIMELINE_LABEL={
  WAIT_WAREHOUSE_PICK:'待仓库拣货',
  WAIT_PRODUCTION:'待排产',IN_PRODUCTION:'生产中',READY_TO_SHIP:'生产完成 / 待出运',
  IN_TRANSIT:'已发货 / 国际在途',DELIVERED:'已完成',COMPLETED:'已完成',
};
const FULFILL_LABEL={WAREHOUSE_PICK:'仓库现货出库',FACTORY_DROPSHIP:'工厂直发'};

const money=(value,currency)=>{const n=Number(value||0);const symbol={CNY:'¥',EUR:'€',USD:'$'}[currency]||'';return `${symbol}${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`};
const cny=value=>`¥${Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const day=value=>value?new Date(value).toLocaleDateString('zh-CN'):'—';
const dayTime=value=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const overdue=order=>order.due_date&&!['DELIVERED','COMPLETED','CANCELLED'].includes(order.status)&&String(order.due_date).slice(0,10)<new Date().toISOString().slice(0,10);

const blankForm=()=>({customerId:'',customerName:'',skuCode:'',quantity:1,unitPrice:'',currency:'EUR',dueDate:'',consigneeCountry:'',consigneeAddress:'',factory:'',note:''});

export default function SalesOrderPage({active=true,user,onNavigate,section='orders',orderId}){
  const requestIds=useRef(createRequestIds());
  const admin=user?.role==='admin';
  const [summary,setSummary]=useState(null);
  const [options,setOptions]=useState(null);
  const [status,setStatus]=useState('');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [flash,setFlash]=useState('');
  const [form,setForm]=useState(null);      // 新建订单表单
  const [detail,setDetail]=useState(null);  // 订单详情
  const [readyForm,setReadyForm]=useState(null);
  const [shipForm,setShipForm]=useState(null);
  const [picked,setPicked]=useState([]);          // 批量操作勾选
  const [bulkDue,setBulkDue]=useState(null);      // 批量改交期
  const [bulkShip,setBulkShip]=useState(null);    // 批量出运
  const [bulkResult,setBulkResult]=useState(null);

  const load=useCallback(async(quiet)=>{
    if(!quiet)setLoading(true);
    setError('');
    try{
      const [sum,opt]=await Promise.all([api.salesOrderSummary(),api.salesOrderOptions()]);
      setSummary(sum);setOptions(opt);
    }catch(e){setError(e.message||'订单数据读取失败')}
    finally{if(!quiet)setLoading(false)}
  },[]);
  useEffect(()=>{if(active)load()},[active,load]);

  const run=async(fn,successMsg)=>{
    if(busy)return;
    setBusy(true);setError('');setFlash('');
    try{await fn();setFlash(successMsg||'操作已完成');await load(true)}
    catch(e){setError(e.message||'操作失败')}
    finally{setBusy(false)}
  };

  const rows=useMemo(()=>{
    const list=(Array.isArray(summary?.orders)?summary.orders:[]).filter(order=>{
      if(status&&order.status!==status)return false;
      if(!query.trim())return true;
      const needle=query.trim().toLowerCase();
      return [order.order_no,order.customer_name,order.sku_code,order.product_name,order.vin,order.tracking_no].some(value=>String(value||'').toLowerCase().includes(needle));
    });
    return list;
  },[summary,status,query]);

  const m=summary?.metrics;
  const statusTabs=[['','全部',m?.total||0],...STATUS_ORDER.map(key=>[key,summary?.statusLabels?.[key]||key,summary?.byStatus?.[key]||0])];  const skuOptions=options?.skus||[];
  const customerOptions=options?.customers||[];

  const openCreate=()=>{setError('');setFlash('');setForm({...blankForm(),currency:'EUR'})};
  const pickCustomer=id=>{
    const customer=customerOptions.find(row=>String(row.id)===String(id));
    setForm(current=>({
      ...current,
      customerId:id,
      customerName:customer?.name||'',
      currency:customer?.currency||current.currency||'EUR',
      consigneeCountry:customer?.country||'',
      consigneeAddress:customer?.address||'',
    }));
  };
  const pickSku=code=>{
    const sku=skuOptions.find(row=>row.code===code);
    setForm(current=>({...current,skuCode:code,unitPrice:current.unitPrice||(sku&&sku.price?String(sku.price):'')}));
  };

  const submitCreate=async event=>{
    event.preventDefault();
    if(!form.skuCode)return setError('请选择车型 SKU');
    if(!(Number(form.quantity)>0))return setError('数量须为正整数');
    if(busy)return;
    setBusy(true);setError('');setFlash('');
    try{
      const payload={
        customerId:form.customerId||null,
        customerName:form.customerName,
        skuCode:form.skuCode,
        quantity:Number(form.quantity),
        unitPrice:Number(form.unitPrice||0),
        currency:form.currency,
        dueDate:form.dueDate||null,
        consigneeCountry:form.consigneeCountry,
        consigneeAddress:form.consigneeAddress,
        factory:form.factory,
        note:form.note,
      };
      const created=await api.createSalesOrder({...payload,idempotencyKey:requestIds.current.get('sales-order-create',payload)});
      requestIds.current.clear('sales-order-create',payload);
      setForm(null);
      setFlash(`${created.order_no} 已创建 · ${FULFILL_LABEL[created.fulfillment_type]||created.fulfillment_type}${created.poNo?` · 连带生成 ${created.poNo}`:''}`);
      await load(true);
      await openDetail(created.id);
    }catch(e){setError(e.message||'创建订单失败')}
    finally{setBusy(false)}
  };

  const openDetail=async id=>{
    setError('');
    try{setDetail(await api.salesOrder(id))}catch(e){setError(e.message)}
  };
  useEffect(()=>{if(active&&section==='orders'&&orderId)openDetail(orderId)},[active,section,orderId]);
  const orderDetail=detail?.order;
  const timelineEvents=(()=>{
    if(!orderDetail)return [];
    const events=[...(detail?.events||[])];
    const hasStatus=status=>events.some(event=>TIMELINE_STATUS[event.status]===status);
    const milestones=[
      [orderDetail.fulfillment_type==='WAREHOUSE_PICK'?'WAIT_WAREHOUSE_PICK':'WAIT_PRODUCTION',orderDetail.created_at,orderDetail.fulfillment_type==='WAREHOUSE_PICK'?'订单创建，等待仓库拣货':'订单创建，等待排产'],
      ['IN_PRODUCTION',orderDetail.production_started_at,'开始生产'],
      ['READY_TO_SHIP',orderDetail.ready_to_ship_at,`生产完成${orderDetail.vin?`，VIN ${orderDetail.vin}`:''}，等待出运`],
      ['IN_TRANSIT',orderDetail.shipped_at,`${orderDetail.carrier||'承运商'} ${orderDetail.tracking_no||''} 已发货，进入国际在途`],
      [orderDetail.delivered_at?'DELIVERED':'COMPLETED',orderDetail.delivered_at||orderDetail.completed_at,'客户签收，订单结案'],
    ];
    milestones.forEach(([status,at,message])=>{
      if(at&&!hasStatus(status))events.push({id:`milestone-${status}`,status,message,at});
    });
    return events.sort((a,b)=>new Date(b.at)-new Date(a.at));
  })();
  const detailLedger=detail?.ledger||[];
  const parcelRows=detail?.parcels||[];
  const deliveredPo=['已交货','已完成','已归档','DELIVERED','COMPLETED','ARCHIVED'].includes(orderDetail?.po_status);
  const detailStages=orderDetail?[{
    title:'订单接收',done:true,meta:`${dayTime(orderDetail.created_at)} · ${orderDetail.channel||'B2B'}`,
  },{
    title:'生产交付',done:orderDetail.fulfillment_type==='WAREHOUSE_PICK'||deliveredPo,active:orderDetail.fulfillment_type!=='WAREHOUSE_PICK'&&!deliveredPo,
    meta:orderDetail.fulfillment_type==='WAREHOUSE_PICK'?'实体仓现货，无需生产':orderDetail.po_no?`${orderDetail.po_no} · ${orderDetail.po_status||'等待工厂交付'}`:'尚未关联生产单',
  },{
    title:'库存过账',done:detailLedger.length>0,active:!detailLedger.length&&orderDetail.status!=='CANCELLED',
    meta:detailLedger.length?`${detailLedger.length} 笔库存流水`:'等待实际出入库过账',
  },{
    title:'物流签收',done:['DELIVERED','COMPLETED'].includes(orderDetail.status)||parcelRows.length>0&&parcelRows.every(p=>['DELIVERED','已签收','已妥投'].includes(p.status)),
    active:orderDetail.status==='IN_TRANSIT'||parcelRows.some(p=>p.tracking_no),meta:parcelRows.length?`${parcelRows.filter(p=>['DELIVERED','已签收','已妥投'].includes(p.status)).length}/${parcelRows.length} 包裹签收`:orderDetail.status==='IN_TRANSIT'?'订单运输中':'等待发货',
  }]:[];
  const costSummary=detail?.costSummary||{};
  const hasCost=Boolean(costSummary.hasCost);
  const refreshDetail=async id=>{try{setDetail(await api.salesOrder(id))}catch(_){}};

  const actStart=order=>run(async()=>{
    await api.startSalesOrder(order.id);
    await refreshDetail(order.id);
  },`${order.order_no} 已进入生产`);

  const submitReady=async event=>{
    event.preventDefault();
    const order=readyForm.order;
    await run(async()=>{
      const vins=readyForm.vins.split(/[\n,，;；\s]+/).map(value=>value.trim()).filter(Boolean);
      await api.readySalesOrder(order.id,{vins,motorNo:readyForm.motorNo,factoryCost:readyForm.factoryCost||0});
      setReadyForm(null);
      await refreshDetail(order.id);
    },`${order.order_no} 已登记完工，等待出运`);
  };

  const submitShip=async event=>{
    event.preventDefault();
    const order=shipForm.order;
    await run(async()=>{
      await api.shipSalesOrder(order.id,{carrier:shipForm.carrier,trackingNo:shipForm.trackingNo,etaDate:shipForm.etaDate||null,freightCost:shipForm.freightCost||0});
      setShipForm(null);
      await refreshDetail(order.id);
    },`${order.order_no} 已出运`);
  };

  const actDeliver=order=>{
    if(!window.confirm(`确认 ${order.order_no} 客户已签收？签收后订单结案。`))return;
    run(async()=>{
      await api.deliverSalesOrder(order.id);
      await refreshDetail(order.id);
    },`${order.order_no} 已妥投结案`);
  };

  const actCancel=order=>{
    const reason=window.prompt(`取消 ${order.order_no} 的原因（会同步取消未开工的关联生产单）`);
    if(!reason)return;
    run(async()=>{
      await api.cancelSalesOrder(order.id,reason);
      await refreshDetail(order.id);
    },`${order.order_no} 已取消`);
  };

  const actionFor=order=>{
    if(!admin||order.status==='CANCELLED'||order.status==='COMPLETED'||order.status==='DELIVERED')return null;
    if(order.status==='WAIT_WAREHOUSE_PICK')return <button className="btn small" disabled={busy} onClick={()=>setReadyForm({order,vins:'',motorNo:'',factoryCost:''})}>拣货登记 VIN</button>;
    if(order.status==='WAIT_PRODUCTION')return <button className="btn small" disabled={busy} onClick={()=>actStart(order)}>开工生产</button>;
    if(order.status==='IN_PRODUCTION')return <button className="btn small" disabled={busy} onClick={()=>setReadyForm({order,vins:'',motorNo:'',factoryCost:''})}>完工交货</button>;
    if(order.status==='READY_TO_SHIP')return <button className="btn small" disabled={busy} onClick={()=>setShipForm({order,carrier:'',trackingNo:'',etaDate:'',freightCost:''})}>登记出运</button>;
    if(order.status==='IN_TRANSIT')return <button className="btn small" disabled={busy} onClick={()=>actDeliver(order)}>登记妥投</button>;
    return null;
  };

  /* ── 批量操作 ─────────────────────────────────────────── */
  const selectable=rows.filter(order=>order.status!=='CANCELLED');
  const allPicked=selectable.length>0&&selectable.every(order=>picked.includes(order.id));
  const togglePick=id=>setPicked(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  const toggleAll=()=>setPicked(allPicked?[]:selectable.map(order=>order.id));
  const pickedOrders=()=>rows.filter(order=>picked.includes(order.id));

  const doBulk=async(action,payload)=>{
    if(busy)return;
    setBusy(true);setError('');setFlash('');
    try{
      const result=await api.bulkSalesOrders(action,picked,payload);
      setBulkResult(result);
      setBulkDue(null);setBulkShip(null);
      if(result.failCount===0)setPicked([]);
      await load(true);
    }catch(e){setError(e.message||'批量操作失败')}
    finally{setBusy(false)}
  };

  const openBulkDue=()=>{
    const base=new Date();base.setDate(base.getDate()+14);
    setBulkDue({dueDate:base.toISOString().slice(0,10)});
  };
  const openBulkShip=()=>{
    const eligible=pickedOrders().filter(order=>order.status==='READY_TO_SHIP');
    if(!eligible.length)return setError('所选订单里没有已完工待出运的订单');
    setBulkShip({carrier:'',etaDate:'',rows:eligible.map(order=>({id:order.id,orderNo:order.order_no,trackingNo:''}))});
  };

  const exportOrders=()=>{
    const list=picked.length?pickedOrders():rows;
    if(!list.length)return setError('没有可导出的订单');
    const head=['订单号','客户','目的国','SKU','车型','数量','单价','币种','金额','履约方式','状态','交期','VIN','承运商','运单号','创建时间'];
    const body=list.map(order=>[
      order.order_no,order.customer_name,order.consignee_country,order.sku_code,order.product_name,
      order.quantity,order.unit_price,order.currency,order.sale_amount,
      FULFILL_LABEL[order.fulfillment_type]||order.fulfillment_type,
      summary?.statusLabels?.[order.status]||order.status,
      order.due_date?String(order.due_date).slice(0,10):'',
      order.vin,order.carrier,order.tracking_no,order.created_at?dayTime(order.created_at):'',
    ]);
    const csv=[head,...body].map(row=>row.map(cell=>`"${String(cell??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`销售订单-${new Date().toISOString().slice(0,10)}.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setFlash(`已导出 ${list.length} 单`);
  };

  return <div className="page">
    <header className="prod-head">
      <div>
        <div className="prod-head__eyebrow">B2B CHANNELS</div>
        <h2>{section==='overview'?'B2B 销售订单总览':'B2B 销售订单'}</h2>
        <p className="hint">{section==='overview'?'查看订单履约、交期预警、回款健康度与近期趋势。':'B2B 销售订单主账本：下单即路由履约——目标仓现货够就走仓库现货出库，不够就工厂直发并自动生成生产单。'}</p>
      </div>
      <div className="prod-head__actions">
        <button className="btn" disabled={loading} onClick={()=>load()}>{loading?'刷新中…':'刷新'}</button>
        {section==='orders'&&admin&&<button className="btn primary" onClick={openCreate}>＋ 新建 B2B 订单</button>}
      </div>
    </header>

    {error&&<p className="error-text" role="alert">{error}</p>}
    {flash&&<p className="hint" role="status">{flash}</p>}

    {section==='overview'&&<SalesOrderOverview
      summary={summary}
      onOpenOrder={id=>onNavigate?.('sales-orders',{orderId:id})}
      onGoProduction={()=>onNavigate?.('production')}
      onGoFinance={()=>onNavigate?.('finance')}
    />}

    {section==='orders'&&<>
    <section className="card">
      <div className="row" style={{flexWrap:'wrap'}}>
        {statusTabs.map(([key,label,count])=><button key={key||'all'} type="button" className={'btn small'+(status===key?' primary':'')} onClick={()=>setStatus(key)}>{label} {count}</button>)}
        <span style={{flex:1}}/>
        <label className="field" style={{maxWidth:280}}><input type="search" placeholder="单号 / 客户 / SKU / VIN / 运单号" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <button className="btn small" onClick={exportOrders}>导出{picked.length?`选中 ${picked.length} 单`:'全部'}</button>
      </div>

      {picked.length>0&&<div className="row" style={{flexWrap:'wrap',margin:'10px 0',padding:'8px 12px',border:'1px solid var(--accent)',borderRadius:'var(--radius)',background:'var(--accent-soft)'}}>
        <strong>已选 {picked.length} 单</strong>
        <button className="btn small" disabled={busy} onClick={openBulkDue}>批量改交期</button>
        <button className="btn small" disabled={busy} onClick={openBulkShip}>批量出运</button>
        <button className="btn small" disabled={busy} onClick={exportOrders}>导出选中</button>
        <span style={{flex:1}}/>
        <button className="btn small" onClick={()=>setPicked([])}>清除选择</button>
      </div>}

      {loading?<p role="status">正在读取订单…</p>:(rows.length?<div className="table-scroll"><table className="table">
        <thead><tr>
          <th style={{width:34}}><input type="checkbox" aria-label="全选" checked={allPicked} onChange={toggleAll}/></th>
          <th>订单号</th><th>客户</th><th>车型</th><th>数量</th><th>金额</th><th>履约方式</th><th>状态</th><th>交期</th><th>运单</th><th></th>
        </tr></thead>
        <tbody>{rows.map(order=><tr key={order.id} className="order-openable" title="双击打开订单详情" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>openDetail(order.id))}>
          <td><input type="checkbox" aria-label={`选择 ${order.order_no}`} disabled={order.status==='CANCELLED'} checked={picked.includes(order.id)} onChange={()=>togglePick(order.id)}/></td>
          <td><button type="button" className="link" onClick={()=>openDetail(order.id)}>{order.order_no}</button><small className="block">{day(order.created_at)}</small></td>
          <td>{order.customer_name||'—'}<small className="block">{order.customer_code||order.consignee_country||''}</small></td>
          <td><span className="tag sku">{order.sku_code}</span><small className="block">{order.product_name}</small></td>
          <td>{order.quantity}</td>
          <td>{money(order.sale_amount,order.currency)}</td>
          <td><span className={'tag '+(order.fulfillment_type==='WAREHOUSE_PICK'?'on':'plan')}>{FULFILL_LABEL[order.fulfillment_type]||order.fulfillment_type}</span></td>
          <td><span className={'tag '+(STATUS_TONE[order.status]||'')}>{summary?.statusLabels?.[order.status]||order.status}</span></td>
          <td>{day(order.due_date)}{overdue(order)&&<small className="block" style={{color:'var(--danger)'}}>已逾期</small>}</td>
          <td>{order.tracking_no||'—'}<small className="block">{order.carrier||''}</small></td>
          <td className="nowrap">{actionFor(order)} {admin&&!['DELIVERED','COMPLETED','CANCELLED'].includes(order.status)&&<button className="btn small" disabled={busy} onClick={()=>actCancel(order)}>取消</button>}</td>
        </tr>)}</tbody>
      </table></div>:<p className="hint">还没有销售订单。点右上角「新建 B2B 订单」下第一单。</p>)}
    </section>

    {detail&&<section className="card so-detail-shell">
      <div className="row">
        <h3>{detail.order.order_no} · {detail.order.customer_name||'未指定客户'}</h3>
        <span className={'tag '+(STATUS_TONE[detail.order.status]||'')}>{detail.statusLabel}</span>
        <span style={{flex:1}}/>
        <button className="btn small" onClick={()=>setDetail(null)}>收起</button>
      </div>
      <div className="so-stage-grid">{detailStages.map((stage,index)=><article key={stage.title} className={`so-stage ${stage.done?'is-done':''} ${stage.active?'is-active':''}`}><small>STAGE {String(index+1).padStart(2,'0')}</small><strong>{stage.title}</strong><span>{stage.meta}</span></article>)}</div>
      <div className="form-grid" style={{marginTop:12}}>
        <div className="field"><label>车型 / 数量</label><div><span className="tag sku">{detail.order.sku_code}</span> × {detail.order.quantity}</div></div>
        <div className="field"><label>销售金额</label><div>{money(detail.order.sale_amount,detail.order.currency)}</div></div>
        <div className="field"><label>履约方式</label><div>{FULFILL_LABEL[detail.order.fulfillment_type]||detail.order.fulfillment_type}</div><small className="hint">{detail.order.fulfillment_reason}</small></div>
        <div className="field"><label>交期</label><div>{day(detail.order.due_date)}</div></div>
        <div className="field"><label>VIN / 电机号</label><div>{detail.order.vin||'—'} / {detail.order.motor_no||'—'}</div></div>
        <div className="field"><label>运单</label><div>{detail.order.tracking_no||'—'}</div><small className="hint">{detail.order.carrier||''} {detail.order.eta?`ETA ${day(detail.order.eta)}`:''}</small></div>
        <div className="field"><label>关联生产单</label><div>{detail.order.po_no||'未生成（仓库现货路径）'}</div><small className="hint">{detail.order.po_status||''}</small></div>
        <div className="field"><label>成本合计</label><div>{money(detail.order.total_cost,detail.order.currency)}</div><small className="hint">工厂 {money(detail.order.factory_cost,detail.order.currency)} + 运费 {money(detail.order.freight_cost,detail.order.currency)}</small></div>
      </div>
      <div className="so-detail-layout"><div className="so-detail-main"><div className="so-detail-grid">
        <section className="so-detail-card"><h4>客户与收货</h4><dl><div><dt>客户</dt><dd>{detail.order.customer_name||'—'} {detail.order.customer_code||''}</dd></div><div><dt>收货人</dt><dd>{detail.order.consignee_name||'—'}</dd></div><div><dt>目的国</dt><dd>{detail.order.consignee_country||'—'}</dd></div><div><dt>收货地址</dt><dd>{detail.order.consignee_address||'—'}</dd></div><div><dt>联系方式</dt><dd>{[detail.order.consignee_phone,detail.order.consignee_email].filter(Boolean).join(' · ')||'—'}</dd></div></dl></section>
        <section className="so-detail-card"><h4>订单商品</h4><dl><div><dt>商品</dt><dd>{detail.order.product_name||'—'}</dd></div><div><dt>SKU</dt><dd>{detail.order.sku_code}</dd></div><div><dt>数量</dt><dd>{detail.order.quantity} 台</dd></div><div><dt>单价</dt><dd>{money(detail.order.unit_price,detail.order.currency)}</dd></div><div><dt>销售金额</dt><dd>{money(detail.order.sale_amount,detail.order.currency)}</dd></div></dl></section>
        <section className="so-detail-card"><h4>关联生产采购单</h4>{detail.order.po_no ? <><dl><div><dt>生产单号</dt><dd>{detail.order.po_no}</dd></div><div><dt>生产状态</dt><dd>{detail.order.po_status||'—'}</dd></div></dl><button type="button" className="btn small" onClick={()=>onNavigate?.('production')}>前往工厂订单</button></> : <p className="hint">尚未关联生产采购单。</p>}</section>
        <section className="so-detail-card"><h4>履约说明</h4><p>{FULFILL_LABEL[detail.order.fulfillment_type]||detail.order.fulfillment_type||'—'}</p><p className="hint">{detail.order.fulfillment_reason||'暂无履约说明'}</p>{detail.order.note&&<p className="hint">备注：{detail.order.note}</p>}</section>
      </div>
      <section className="so-detail-card so-ledger-card"><div className="row"><h4>库存过账流水</h4><span className="hint">入库与出库按账本记录</span></div>
        {detailLedger.length?<div className="table-scroll"><table className="table"><thead><tr><th>时间</th><th>来源</th><th>仓库</th><th>SKU</th><th>数量变化</th></tr></thead><tbody>{detailLedger.map(row=><tr key={row.id}><td>{dayTime(row.created_at)}</td><td><span className="tag">{row.source_type==='opening_balance'?'期初/迁移':row.source_type==='sales_order'?'销售出库':row.source_type==='production_order_material'?'生产过账':row.source_type}</span><small className="block">{row.source_id}</small></td><td>{row.warehouse_name||'—'}</td><td>{orderDetail.sku_code}</td><td className={Number(row.quantity_delta)>0?'so-qty-in':'so-qty-out'}>{Number(row.quantity_delta)>0?'+':''}{row.quantity_delta} 台</td></tr>)}</tbody></table></div>:<p className="hint">暂无关联库存流水。完成工厂交付或仓库出库后会在此显示。</p>}
      </section>
      <section className="so-detail-card"><div className="row"><h4>财务单据</h4><span className="hint">应收与应付结算</span></div>
        {(detail.finance||[]).length?<div className="table-scroll"><table className="table"><thead><tr><th>关联单号 / 依据</th><th>方向</th><th>金额</th><th>未结</th><th>到期日</th><th>状态</th></tr></thead><tbody>{detail.finance.map(item=><tr key={item.id}><td>{item.legacy_ref_no||item.link_basis||'—'}<small className="block">{item.legacy_ref_no?'':item.link_basis==='备注关联'?'由原始备注关联':''}</small></td><td>{item.direction==='AR'?'应收':'应付'}</td><td>{money(item.original_amount,item.currency)}</td><td>{money(item.outstanding_amount,item.currency)}</td><td>{day(item.due_date)}</td><td>{({OPEN:'未结',PARTIALLY_SETTLED:'部分结清',SETTLED:'已结清'})[item.settlement_status]||item.settlement_status}</td></tr>)}</tbody></table></div>:<p className="hint">没有找到与销售单或采购单关联的应收应付单据。</p>}
      </section>
      <h4 className="mt16">物流包裹</h4>
      {(detail.parcels||[]).length?<div className="table-scroll"><table className="table"><thead><tr><th>包裹</th><th>组件</th><th>物流公司</th><th>运单号</th><th>状态</th></tr></thead><tbody>{detail.parcels.map(parcel=><tr key={parcel.id}><td>{parcel.parcel_no||'—'}</td><td>{parcel.component_type||'—'} · {parcel.quantity||0} 件</td><td>{parcel.carrier||'—'}</td><td>{parcel.tracking_no||'—'}</td><td>{parcel.status||'—'}</td></tr>)}</tbody></table></div>:<p className="hint">暂无关联物流包裹。</p>}
      <section className="so-detail-card"><div className="row"><h4>订单时间线</h4><span className="hint">状态机记录与阶段时间</span></div>
        {timelineEvents.length?<ol className="so-event-timeline">{timelineEvents.map((event,index)=><li key={event.id} className={index===0?'is-current':''}><time>{dayTime(event.at)}</time><strong>{TIMELINE_LABEL[TIMELINE_STATUS[event.status]]||summary?.statusLabels?.[event.status]||event.status}</strong><p>{event.message||'状态更新'}{event.actor?` · ${event.actor}`:''}</p></li>)}</ol>:<p className="hint">暂无订单阶段时间。</p>}
      </section>
      </div>

      <aside className="so-detail-side">
        <section className="so-detail-card"><h4>金额与成本结算</h4><div className="so-money-row"><span>销售金额</span><strong>{money(orderDetail.sale_amount,orderDetail.currency)}<small className="block">折人民币 {cny(costSummary.revenueCny)}</small></strong></div><div className="so-money-row"><span>工厂/采购成本{costSummary.estimated?' · 关联 PO 预估':''}</span><strong>{cny(costSummary.factoryCostCny)}</strong></div><div className="so-money-row"><span>国际运费</span><strong>{cny(costSummary.freightCostCny)}</strong></div><div className="so-money-row is-total"><span>综合成本{costSummary.estimated?'（预估）':''}</span><strong>{cny(costSummary.totalCostCny)}{hasCost?'':' · 待归集'}</strong></div><div className="so-money-row is-total"><span>毛利{costSummary.estimated?'（预估）':'（已归集成本）'}</span><strong className={hasCost?(costSummary.grossProfitCny>=0?'so-qty-in':'so-qty-out'):''}>{hasCost?`${cny(costSummary.grossProfitCny)} · ${costSummary.grossMargin}%`:'待归集成本后计算'}</strong></div><p className="hint">成本与折算收入统一按人民币展示；关联生产单成本尚未归集到销售订单时标为预估。</p></section>
        <section className="so-detail-card"><h4>履约摘要</h4><p>{FULFILL_LABEL[orderDetail.fulfillment_type]||orderDetail.fulfillment_type||'—'}</p><p className="hint">{orderDetail.fulfillment_reason||'暂无履约说明'}</p>{orderDetail.note&&<p className="hint">备注：{orderDetail.note}</p>}</section>
        <section className="so-detail-card"><h4>整车资产</h4>{detail.asset?<dl><div><dt>VIN</dt><dd>{detail.asset.vin||orderDetail.vin}</dd></div><div><dt>资产归属</dt><dd>{({STOCK:'实体仓在库',VIRTUAL:'虚拟仓待出库',IN_TRANSIT:'国际在途',CUSTOMER:'买方持有'})[detail.asset.owner_state]||detail.asset.owner_state||'—'}</dd></div><div><dt>资产状态</dt><dd>{detail.asset.asset_status||'—'}</dd></div></dl>:<p className="hint">尚未登记 VIN 资产。</p>}</section>
      </aside></div>
      <section className="so-detail-card so-tracking-card"><div className="row" style={{marginBottom:10}}><h4 style={{margin:0}}>物流事件</h4><span className="hint">{detail.asset?`资产归属：${({STOCK:'实体仓在库',VIRTUAL:'虚拟仓待出库',IN_TRANSIT:'国际在途',CUSTOMER:'买方持有'})[detail.asset.owner_state]||detail.asset.owner_state}`:'尚未登记 VIN 资产'}</span><span style={{flex:1}}/><button className="btn small" onClick={()=>openDetail(detail.order.id)}>刷新</button></div>
      {(detail.tracking||[]).length?<div className="table-scroll"><table className="table">
        <thead><tr><th>业务时间</th><th>状态</th><th>位置</th><th>来源</th><th>备注</th><th>登记人</th></tr></thead>
        <tbody>{detail.tracking.map(item=><tr key={item.id}>
          <td>{dayTime(item.event_time)}</td>
          <td><span className="tag on">{item.status}</span></td>
          <td>{item.location||'—'}</td>
          <td>{item.source}</td>
          <td>{item.note||'—'}</td>
          <td>{item.actor||'—'}</td>
        </tr>)}</tbody>
      </table></div>:<p className="hint">还没有物流事件。订单出运后会自动写入「已揽收」，后续可在「生产交付 › 物流跟踪」里逐条登记。</p>}</section>
    </section>}

    {form&&<div className="modal-backdrop" role="presentation"><form className="card form-panel" onSubmit={submitCreate}>
      <div className="row"><h2>新建 B2B 销售订单</h2><span style={{flex:1}}/><button type="button" className="btn" onClick={()=>setForm(null)}>关闭</button></div>
      <p className="hint">提交后系统自动判定履约路径：目标仓有现货即走仓库出库，否则按以销定产生成生产单。</p>
      <div className="form-grid">
        <label className="field">客户<select value={form.customerId} onChange={event=>pickCustomer(event.target.value)}><option value="">不关联客户（手工填写）</option>{customerOptions.map(customer=><option key={customer.id} value={customer.id}>{customer.code?`${customer.code} · `:''}{customer.name}</option>)}</select></label>
        <label className="field">客户名称<input maxLength="120" value={form.customerName} onChange={event=>setForm({...form,customerName:event.target.value})}/></label>
        <label className="field">车型 SKU *<select required value={form.skuCode} onChange={event=>pickSku(event.target.value)}><option value="">选择车型</option>{skuOptions.map(sku=><option key={sku.code} value={sku.code}>{sku.code} · {sku.product_name}</option>)}</select></label>
        <label className="field">数量 *<input type="number" min="1" step="1" required value={form.quantity} onChange={event=>setForm({...form,quantity:event.target.value})}/></label>
        <label className="field">单价 *<input type="number" min="0" step="0.01" required value={form.unitPrice} onChange={event=>setForm({...form,unitPrice:event.target.value})}/></label>
        <label className="field">币种<select value={form.currency} onChange={event=>setForm({...form,currency:event.target.value})}>{['EUR','USD','CNY'].map(value=><option key={value}>{value}</option>)}</select></label>
        <label className="field">约定交期<input type="date" value={form.dueDate} onChange={event=>setForm({...form,dueDate:event.target.value})}/></label>
        <label className="field">指定工厂（直发时用）<input maxLength="120" value={form.factory} onChange={event=>setForm({...form,factory:event.target.value})} placeholder="留空则标记待指派工厂"/></label>
        <label className="field">收货国家<input maxLength="80" value={form.consigneeCountry} onChange={event=>setForm({...form,consigneeCountry:event.target.value})}/></label>
        <label className="field">收货地址<input maxLength="300" value={form.consigneeAddress} onChange={event=>setForm({...form,consigneeAddress:event.target.value})}/></label>
        <label className="field">备注<input maxLength="200" value={form.note} onChange={event=>setForm({...form,note:event.target.value})}/></label>
      </div>
      <div className="row" style={{marginTop:12}}>
        <span className="hint">合计：{money(Number(form.quantity||0)*Number(form.unitPrice||0),form.currency)}</span>
        <span style={{flex:1}}/>
        <button className="btn primary" disabled={busy}>{busy?'提交中…':'创建订单'}</button>
        <button type="button" className="btn" onClick={()=>setForm(null)}>取消</button>
      </div>
    </form></div>}

    {readyForm&&<div className="modal-backdrop" role="presentation"><form className="card form-panel" onSubmit={submitReady}>
      <div className="row"><h2>{readyForm.order.order_no} · {readyForm.order.fulfillment_type==='WAREHOUSE_PICK'?'仓库拣货登记':'工厂完工交货'}</h2><span style={{flex:1}}/><button type="button" className="btn" onClick={()=>setReadyForm(null)}>关闭</button></div>
      <div className="form-grid">
        <label className="field">车架号 VIN *<textarea required rows={Math.min(6,Math.max(2,Number(readyForm.order.quantity)))} value={readyForm.vins} onChange={event=>setReadyForm({...readyForm,vins:event.target.value})} placeholder={`共 ${readyForm.order.quantity} 台，每行填写一个 VIN`}/></label>
        <label className="field">电机号<input maxLength="60" value={readyForm.motorNo} onChange={event=>setReadyForm({...readyForm,motorNo:event.target.value})}/></label>
        <label className="field">工厂成本（{readyForm.order.currency}）<input type="number" min="0" step="0.01" value={readyForm.factoryCost} onChange={event=>setReadyForm({...readyForm,factoryCost:event.target.value})}/></label>
      </div>
      <div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy}>{busy?'保存中…':'确认完工'}</button><button type="button" className="btn" onClick={()=>setReadyForm(null)}>取消</button></div>
    </form></div>}

    {shipForm&&<div className="modal-backdrop" role="presentation"><form className="card form-panel" onSubmit={submitShip}>
      <div className="row"><h2>{shipForm.order.order_no} · 登记出运</h2><span style={{flex:1}}/><button type="button" className="btn" onClick={()=>setShipForm(null)}>关闭</button></div>
      <p className="hint">确认出运后会生成订单包裹和物流事件，可在订单详情及物流跟踪中查看。</p>
      <div className="form-grid">
        <label className="field">承运商<input maxLength="60" value={shipForm.carrier} onChange={event=>setShipForm({...shipForm,carrier:event.target.value})} placeholder="DHL / DPD / 货代名称"/></label>
        <label className="field">运单号 *<input required maxLength="80" value={shipForm.trackingNo} onChange={event=>setShipForm({...shipForm,trackingNo:event.target.value})}/></label>
        <label className="field">预计到港<input type="date" value={shipForm.etaDate} onChange={event=>setShipForm({...shipForm,etaDate:event.target.value})}/></label>
        <label className="field">运费（{shipForm.order.currency}）<input type="number" min="0" step="0.01" value={shipForm.freightCost} onChange={event=>setShipForm({...shipForm,freightCost:event.target.value})}/></label>
      </div>
      <div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy}>{busy?'提交中…':'确认出运'}</button><button type="button" className="btn" onClick={()=>setShipForm(null)}>取消</button></div>
    </form></div>}
    {bulkDue&&<div className="modal-backdrop" role="presentation"><form className="card form-panel" onSubmit={event=>{event.preventDefault();doBulk('due',{dueDate:bulkDue.dueDate})}}>
      <div className="row"><h2>批量调整交期 · {picked.length} 单</h2><span style={{flex:1}}/><button type="button" className="btn" onClick={()=>setBulkDue(null)}>关闭</button></div>
      <p className="hint">已出运、已妥投、已取消的单会被逐单跳过，不影响其他单；生产单的计划完工日会同步更新。</p>
      <div className="form-grid">
        <label className="field">新的交期 *<input type="date" required value={bulkDue.dueDate} onChange={event=>setBulkDue({...bulkDue,dueDate:event.target.value})}/></label>
        <div className="field"><label>快捷调整</label><div className="row">{[-7,0,7,14,30].map(offset=><button key={offset} type="button" className="btn small" onClick={()=>{const d=new Date();d.setDate(d.getDate()+offset);setBulkDue({...bulkDue,dueDate:d.toISOString().slice(0,10)})}}>{offset===0?'今天':offset>0?`+${offset} 天`:`${offset} 天`}</button>)}</div></div>
      </div>
      <div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy}>{busy?'执行中…':'确认调整'}</button><button type="button" className="btn" onClick={()=>setBulkDue(null)}>取消</button></div>
    </form></div>}

    {bulkShip&&<div className="modal-backdrop" role="presentation"><form className="card form-panel" onSubmit={event=>{event.preventDefault();doBulk('ship',{carrier:bulkShip.carrier,etaDate:bulkShip.etaDate||null,shipments:bulkShip.rows})}}>
      <div className="row"><h2>批量出运 · {bulkShip.rows.length} 单</h2><span style={{flex:1}}/><button type="button" className="btn" onClick={()=>setBulkShip(null)}>关闭</button></div>
      <p className="hint">每单必须单独填运单号；未填的会被跳过并逐条回传原因。已登记 VIN 的订单才能出运。</p>
      <div className="form-grid">
        <label className="field">统一承运商<input maxLength="60" value={bulkShip.carrier} onChange={event=>setBulkShip({...bulkShip,carrier:event.target.value})} placeholder="可留空，在下方逐单填写"/></label>
        <label className="field">统一预计到港<input type="date" value={bulkShip.etaDate} onChange={event=>setBulkShip({...bulkShip,etaDate:event.target.value})}/></label>
      </div>
      <table className="table" style={{marginTop:12}}><thead><tr><th>订单号</th><th>运单号 *</th></tr></thead>
        <tbody>{bulkShip.rows.map((row,index)=><tr key={row.id}>
          <td>{row.orderNo}</td>
          <td><input maxLength="80" value={row.trackingNo} placeholder="必填" onChange={event=>setBulkShip({...bulkShip,rows:bulkShip.rows.map((item,i)=>i===index?{...item,trackingNo:event.target.value}:item)})}/></td>
        </tr>)}</tbody>
      </table>
      <div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy}>{busy?'执行中…':'确认出运'}</button><button type="button" className="btn" onClick={()=>setBulkShip(null)}>取消</button></div>
    </form></div>}

    {bulkResult&&<div className="modal-backdrop" role="presentation"><div className="card form-panel">
      <div className="row"><h2>批量操作结果</h2><span style={{flex:1}}/><button type="button" className="btn" onClick={()=>setBulkResult(null)}>关闭</button></div>
      <div className="metric-grid" style={{marginTop:12}}>
        <article className="metric-card"><span className="metric-label">提交</span><strong>{bulkResult.total}</strong></article>
        <article className="metric-card"><span className="metric-label">成功</span><strong>{bulkResult.successCount}</strong></article>
        <article className="metric-card"><span className="metric-label">失败 / 跳过</span><strong>{bulkResult.failCount}</strong></article>
      </div>
      {bulkResult.failCount>0&&<table className="table"><thead><tr><th>订单</th><th>原因</th></tr></thead>
        <tbody>{bulkResult.failed.map((row,index)=><tr key={`${row.id}-${index}`}><td>{row.orderNo||row.id}</td><td className="hint">{row.reason}</td></tr>)}</tbody>
      </table>}
      {bulkResult.failCount===0&&<p className="hint">全部成功。</p>}
      <div className="row" style={{marginTop:12}}><button type="button" className="btn primary" onClick={()=>setBulkResult(null)}>知道了</button></div>
    </div></div>}
    </>}
  </div>;
}
