import React, { useEffect, useRef, useState } from 'react';
import { dealerOrderStatus, portalRequest } from './PortalPage.jsx';
import { uuidv7 } from '../uuidv7.js';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

const amountCents=value=>{const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'0'));return match?BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0')):0n};
const formatCents=value=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;
const dealerBalanceCents=order=>amountCents(order.orderTotal)-amountCents(order.returnCreditTotal)-amountCents(order.paidTotal)+amountCents(order.refundTotal);
const localToday=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const ORDER_LAMP={submitted:'is-warn is-pulse',quoted:'is-info',accepted:'is-info',allocated:'is-info',shipped:'is-info',delivered:'is-ok',cancelled:'is-off',declined:'is-err',rejected:'is-off'};
const Lamp=({status})=><span className={'ck-lamp '+(ORDER_LAMP[status]||'is-off')}>{dealerOrderStatus[status]||status}</span>;

export default function DealerOrdersAdmin({ user, active = true }) {
  const [orders,setOrders]=useState([]),[warehouses,setWarehouses]=useState([]),[quote,setQuote]=useState(null),[allocationOrder,setAllocationOrder]=useState(null),[allocationWarehouses,setAllocationWarehouses]=useState({}),[paymentOrder,setPaymentOrder]=useState(null),[payment,setPayment]=useState(null),[invoiceOrder,setInvoiceOrder]=useState(null),[invoice,setInvoice]=useState(null),[receivableFilter,setReceivableFilter]=useState('unpaid'),[currency,setCurrency]=useState(''),[note,setNote]=useState(''),[message,setMessage]=useState(''),[reloadError,setReloadError]=useState(''),[busy,setBusy]=useState(false),[ordersNeedRefresh,setOrdersNeedRefresh]=useState(false);
  const [detail,setDetail]=useState(null);
  const [today,setToday]=useState(localToday);
  const loadVersion=useRef(0);
  const reload=async()=>{const version=++loadVersion.current;const [rows,stockrooms]=await Promise.all([portalRequest('/api/portal-management/dealer-orders'),portalRequest('/api/warehouses')]);if(version!==loadVersion.current)return;setOrders(rows);setWarehouses(stockrooms.filter(w=>w.status==='启用'&&['国内仓','海外仓'].includes(w.kind)));setOrdersNeedRefresh(false)};
  useEffect(()=>{if(user.role!=='admin'||!active)return;reload().catch(e=>setMessage(e.message));return()=>{loadVersion.current++}},[user.role,active]);
  useEffect(()=>{const refreshToday=()=>setToday(current=>{const next=localToday();return current===next?current:next});const timer=window.setInterval(refreshToday,60_000);window.addEventListener('focus',refreshToday);document.addEventListener('visibilitychange',refreshToday);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refreshToday);document.removeEventListener('visibilitychange',refreshToday)}},[]);
  const run=async fn=>{setBusy(true);setMessage('');setReloadError('');try{await fn()}catch(e){setMessage(e.message);setBusy(false);return}setOrdersNeedRefresh(true);try{await reload();setMessage('订货申请已更新。')}catch(e){setMessage('操作已保存，但订单资料刷新失败；刷新成功前已暂停订单操作。');setReloadError(e.message)}finally{setBusy(false)}};
  const retryReload=async()=>{setBusy(true);setReloadError('');try{await reload();setMessage('经销商订单列表已刷新。')}catch(e){setReloadError(e.message)}finally{setBusy(false)}};
  const closeDrawer=()=>{setDetail(null);setQuote(null);setAllocationOrder(null);setPaymentOrder(null);setPayment(null);setInvoiceOrder(null);setInvoice(null)};
  const beginQuote=order=>{setDetail(null);setQuote({...order,items:order.items.map(item=>({...item,price:''}))});setCurrency('');setNote('')};
  const submitQuote=async e=>{e.preventDefault();if(!quote)return;await run(async()=>{await portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(quote.id)+'/quote','POST',{currency,note,items:quote.items.map(item=>({id:item.id,price:item.price}))});closeDrawer()})};
  const beginAllocation=order=>{setDetail(null);setAllocationOrder(order);setAllocationWarehouses(Object.fromEntries(order.items.map(item=>[item.id,''])))};
  const submitAllocation=async e=>{e.preventDefault();if(!allocationOrder)return;await run(async()=>{await portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(allocationOrder.id)+'/allocate','POST',{items:allocationOrder.items.map(item=>({itemId:item.id,warehouseId:allocationWarehouses[item.id]}))});closeDrawer()})};
  const beginPayment=order=>{setDetail(null);setPaymentOrder(order);setPayment({paymentId:uuidv7(),amount:'',reference:'',note:''})};
  const submitPayment=async e=>{e.preventDefault();if(!paymentOrder||!payment)return;await run(async()=>{await portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(paymentOrder.id)+'/payments','POST',payment);closeDrawer()})};
  const beginInvoice=order=>{setDetail(null);setInvoiceOrder(order);setInvoice({id:uuidv7(),invoiceNumber:'',issuedOn:localToday(),dueOn:'',note:''})};
  const submitInvoice=async e=>{e.preventDefault();if(!invoiceOrder||!invoice)return;await run(async()=>{await portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(invoiceOrder.id)+'/invoices','POST',invoice);closeDrawer()})};
  const receivables=orders.filter(order=>order.invoice).map(order=>({...order,balanceCents:amountCents(order.invoice.totalAmount)-amountCents(order.returnCreditTotal)-amountCents(order.paidTotal)+amountCents(order.refundTotal)}));
  const filteredReceivables=receivables.filter(order=>receivableFilter==='all'||(receivableFilter==='unpaid'&&order.balanceCents>0n)||(receivableFilter==='overdue'&&order.balanceCents>0n&&order.invoice.dueOn&&order.invoice.dueOn<today)||(receivableFilter==='settled'&&order.balanceCents<=0n));
  const receivableTotals=Object.fromEntries([...new Set(receivables.map(order=>order.currency))].map(code=>[code,receivables.filter(order=>order.currency===code).reduce((sum,order)=>sum+order.balanceCents,0n)]));
  const overdueCount=receivables.filter(order=>order.balanceCents>0n&&order.invoice.dueOn&&order.invoice.dueOn<today).length;
  const pendingCount=orders.filter(order=>['submitted','quoted','accepted','allocated','declined'].includes(order.status)).length;
  if(user.role!=='admin')return null;
  const drawerOrder=quote||allocationOrder||paymentOrder||invoiceOrder||detail;
  const isErr=/失败|不能|无效|超过|不足|暂停/.test(message);
  const reversePayment=(order,row)=>{const reason=window.prompt('冲正原因（冲正后该笔收款不再计入已收）');if(reason&&reason.trim())run(()=>portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(order.id)+'/payments/'+encodeURIComponent(row.id)+'/reverse','POST',{reason}))};
  const rejectOrder=order=>{const reason=window.prompt('拒绝原因');if(reason&&reason.trim())run(()=>portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(order.id)+'/reject','POST',{note:reason}))};
  const cancelOrder=order=>{const reason=window.prompt('取消订单原因');if(reason&&reason.trim())run(()=>portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(order.id)+'/cancel','POST',{note:reason}))};
  const shipOrder=order=>{const carrier=window.prompt('承运商');if(!carrier?.trim())return;const trackingNo=window.prompt('运单号');if(trackingNo?.trim())run(()=>portalRequest('/api/portal-management/dealer-orders/'+encodeURIComponent(order.id)+'/ship','POST',{carrier,trackingNo}))};

  const detailBody=order=>order&&<>
    <div className="ck-kv">
      <div><b>{order.username}</b> · <Lamp status={order.status}/> · <span className="ck-mono ck-dim">{order.id.slice(0,8)}</span></div>
      <div className="ck-dim">{new Date(order.createdAt).toLocaleString('zh-CN')}{order.note?' · '+order.note:''}</div>
      {order.currency&&order.orderTotal!=null&&order.paidTotal!=null&&<div>订单 <b>{order.currency} {order.orderTotal}</b> · 退货抵扣 {order.currency} {order.returnCreditTotal||'0.00'} · 已收 {order.currency} {order.paidTotal} · 已退款 {order.currency} {order.refundTotal||'0.00'} · 未结 <b>{order.currency} {formatCents(dealerBalanceCents(order))}</b></div>}
      {order.trackingNo&&<div>物流：{order.carrier} · <span className="ck-mono">{order.trackingNo}</span></div>}
      {order.receivedAt&&<div>签收：{new Date(order.receivedAt).toLocaleString('zh-CN')}{order.receiptNote?' · '+order.receiptNote:''}</div>}
      {order.adminNote&&<div>处理说明：{order.adminNote}</div>}
      {order.cancelNote&&<div>取消原因：{order.cancelNote}</div>}
      {order.dealerResponseNote&&<div>经销商回复：{order.dealerResponseNote}</div>}
    </div>
    {order.invoice&&<>
      <div className="ck-section">发票与对账 · {order.invoice.invoiceNumber}</div>
      <div className="ck-kv">
        <div>开票 {order.invoice.issuedOn}{order.invoice.dueOn?' · 到期 '+order.invoice.dueOn:''} · 登记人 {order.invoice.recordedBy}</div>
        <div>发票金额 <b>{order.invoice.currency} {order.invoice.totalAmount}</b> · 退货抵扣 {order.currency} {order.returnCreditTotal} · 已收 {order.currency} {order.paidTotal} · 已退款 {order.currency} {order.refundTotal}</div>
        <div>当前应收余额：<b>{order.currency} {formatCents(amountCents(order.invoice.totalAmount)-amountCents(order.returnCreditTotal)-amountCents(order.paidTotal)+amountCents(order.refundTotal))}</b></div>
        {order.invoice.note&&<div className="ck-dim">备注：{order.invoice.note}</div>}
      </div>
      <table className="ck-table"><thead><tr><th>发票商品</th><th className="num">数量</th><th className="num">单价</th><th className="num">金额</th></tr></thead><tbody>{order.invoice.items.map((item,index)=><tr key={index}><td>{item.sku} · {item.productName}</td><td className="num">{item.quantity}</td><td className="num">{order.currency} {item.unitPrice}</td><td className="num">{order.currency} {item.lineTotal}</td></tr>)}</tbody></table>
    </>}
    <div className="ck-section">订货明细</div>
    <table className="ck-table"><thead><tr><th>SKU</th><th>产品</th><th className="num">数量</th><th className="num">报价</th><th>配货仓</th></tr></thead><tbody>{order.items.map(item=><tr key={item.id}><td className="ck-mono">{item.sku}</td><td>{item.productName}</td><td className="num">{item.quantity}</td><td className="num">{item.quotedUnitPrice==null?<span className="ck-dim">待报价</span>:order.currency+' '+item.quotedUnitPrice}</td><td className="ck-dim">{item.warehouseName||'—'}</td></tr>)}</tbody></table>
    {order.payments?.length>0&&<>
      <div className="ck-section">收款记录</div>
      <table className="ck-table"><thead><tr><th>收款时间</th><th className="num">金额</th><th>银行流水/参考号</th><th>登记人</th><th style={{textAlign:'right'}}>状态/操作</th></tr></thead><tbody>{order.payments.map(row=><tr key={row.id}><td className="ck-dim">{new Date(row.receivedAt).toLocaleString('zh-CN')}</td><td className="num">{order.currency} {row.amount}</td><td className="ck-mono">{row.reference||'—'}</td><td className="ck-dim">{row.recordedBy}</td><td style={{textAlign:'right'}}>{row.reversed?<span className="ck-lamp is-off" title={row.reversalReason}>已冲正</span>:<button type="button" className="ck-btn is-sm is-danger" disabled={busy||ordersNeedRefresh} onClick={()=>reversePayment(order,row)}>冲正</button>}</td></tr>)}</tbody></table>
    </>}
    <div className="ck-section">处理操作</div>
    <div className="ck-row">
      {['submitted','declined'].includes(order.status)&&<button type="button" className="ck-btn is-primary" disabled={busy||ordersNeedRefresh} onClick={()=>beginQuote(order)}>{order.status==='declined'?'重新报价':'填写报价'}</button>}
      {order.status==='submitted'&&<button type="button" className="ck-btn is-danger" disabled={busy||ordersNeedRefresh} onClick={()=>rejectOrder(order)}>拒绝申请</button>}
      {['submitted','quoted','accepted','allocated','declined'].includes(order.status)&&<button type="button" className="ck-btn is-danger" disabled={busy||ordersNeedRefresh} onClick={()=>cancelOrder(order)}>取消订单并释放预占</button>}
      {order.status==='accepted'&&<button type="button" className="ck-btn is-primary" disabled={busy||ordersNeedRefresh} onClick={()=>beginAllocation(order)}>选择仓库并预占库存</button>}
      {order.status==='allocated'&&<button type="button" className="ck-btn is-primary" disabled={busy||ordersNeedRefresh} onClick={()=>shipOrder(order)}>确认发运并出库</button>}
      {order.status==='delivered'&&dealerBalanceCents(order)>0n&&<button type="button" className="ck-btn is-primary" disabled={busy||ordersNeedRefresh} onClick={()=>beginPayment(order)}>登记到账</button>}
      {order.status==='delivered'&&!order.invoice&&<button type="button" className="ck-btn is-primary" disabled={busy||ordersNeedRefresh} onClick={()=>beginInvoice(order)}>登记已开具发票</button>}
      {!['submitted','declined','quoted','accepted','allocated','delivered'].includes(order.status)&&<span className="ck-note">当前状态无可执行操作。</span>}
    </div>
  </>;

  return <>
    <div className="ck-instruments" role="group" aria-label="订货关键指标">
      <div className="ck-inst"><div className="ck-inst__label">订货申请</div><div className="ck-inst__num">{orders.length}</div></div>
      <div className={'ck-inst'+(pendingCount?' is-warn':'')}><div className="ck-inst__label">待处理</div><div className="ck-inst__num">{pendingCount}</div></div>
      <div className={'ck-inst'+(overdueCount?' is-err':' is-info')}><div className="ck-inst__label">逾期发票</div><div className="ck-inst__num">{overdueCount}</div></div>
      {Object.entries(receivableTotals).map(([code,total])=><div key={code} className="ck-inst"><div className="ck-inst__label">{code} 应收余额</div><div className="ck-inst__num">{formatCents(total)}</div></div>)}
      {!Object.keys(receivableTotals).length&&<div className="ck-inst"><div className="ck-inst__label">应收余额</div><div className="ck-inst__num ck-dim">—</div></div>}
    </div>
    <div className="ck-toolbar">
      {message&&<span className={'ck-flash'+(isErr?' is-err':'')} role="status">{message}</span>}
      {reloadError&&<span className="ck-flash is-err" role="alert">列表刷新失败：{reloadError} <button type="button" className="ck-btn is-sm" disabled={busy} onClick={retryReload}>重试刷新</button></span>}
      <div className="ck-toolbar__spacer" />
      <label className="padmin-inline-field">对账筛选 <select value={receivableFilter} onChange={e=>setReceivableFilter(e.target.value)}><option value="unpaid">未结清</option><option value="overdue">已逾期</option><option value="settled">已结清/贷方余额</option><option value="all">全部发票</option></select></label>
    </div>
    <div className="ck-gridwrap">
      <section className="padmin-panel" style={{marginBottom:14}}>
        <div className="padmin-panel__head"><h3>经销商应收对账</h3><span>{filteredReceivables.length} 条 · 发票登记后自动生成</span></div>
        {filteredReceivables.length>0?<div className="padmin-panel__scroll"><table className="table"><thead><tr><th>经销商</th><th>发票号码</th><th>订单</th><th>开票日期</th><th>到期日期</th><th>发票金额</th><th>退货抵扣</th><th>已收款</th><th>已退款</th><th>余额</th><th>状态</th></tr></thead><tbody>{filteredReceivables.map(order=>{const overdue=order.balanceCents>0n&&order.invoice.dueOn&&order.invoice.dueOn<today;return <tr key={order.invoice.id} className="order-openable" title="双击打开订单详情" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>{closeDrawer();setDetail(order)})}><td>{order.username}</td><td className="ck-mono">{order.invoice.invoiceNumber}</td><td className="ck-mono ck-dim">{order.id.slice(0,8)}</td><td className="ck-dim">{order.invoice.issuedOn}</td><td className="ck-dim">{order.invoice.dueOn||'—'}</td><td>{order.currency} {order.invoice.totalAmount}</td><td>{order.currency} {order.returnCreditTotal}</td><td>{order.currency} {order.paidTotal}</td><td>{order.currency} {order.refundTotal}</td><td><b>{order.currency} {formatCents(order.balanceCents)}</b></td><td><span className={'ck-lamp '+(overdue?'is-err':order.balanceCents>0n?'is-warn':order.balanceCents<0n?'is-info':'is-ok')}>{overdue?'已逾期':order.balanceCents>0n?'待付款':order.balanceCents<0n?'贷方余额':'已结清'}</span></td></tr>})}</tbody></table></div>:<div className="padmin-empty"><strong>暂无对账记录</strong>订单签收并登记发票后，会自动生成应收对账。</div>}
      </section>
      <div className="ck-grid">
        <table className="ck-table"><thead><tr><th>订单</th><th>经销商</th><th>状态</th><th className="num">订单金额</th><th className="num">未结</th><th>发票</th><th>提交时间</th><th style={{textAlign:'right'}}>操作</th></tr></thead><tbody>
          {orders.map(order=><tr key={order.id} className="order-openable" title="双击打开订单详情" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>{closeDrawer();setDetail(order)})}>
            <td className="ck-mono ck-dim">{order.id.slice(0,8)}</td>
            <td className="ck-strong">{order.username}</td>
            <td><Lamp status={order.status}/></td>
            <td className="num">{order.currency&&order.orderTotal!=null?order.currency+' '+order.orderTotal:'—'}</td>
            <td className="num">{order.currency&&order.orderTotal!=null&&order.paidTotal!=null?<b>{order.currency} {formatCents(dealerBalanceCents(order))}</b>:'—'}</td>
            <td className="ck-mono ck-dim">{order.invoice?order.invoice.invoiceNumber:'—'}</td>
            <td className="ck-dim">{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
            <td style={{textAlign:'right'}}><button type="button" className="ck-link" onClick={()=>{closeDrawer();setDetail(order)}}>处理</button></td>
          </tr>)}
          {!orders.length&&<tr><td colSpan={8}><div className="ck-empty"><b>暂无订货申请</b>经销商在门户提交订货后会显示在这里，可依次完成报价、配货、发运与收款。</div></td></tr>}
        </tbody></table>
      </div>
    </div>

    {drawerOrder&&<>
      <div className="ck-scrim" onClick={()=>{if(!busy)closeDrawer()}} aria-hidden="true"/>
      {detail&&!quote&&!allocationOrder&&!paymentOrder&&!invoiceOrder
        ?<aside className="ck-drawer" role="dialog" aria-modal="true" aria-label="订单处理面板">
          <div className="ck-drawer__head"><div><div className="ck-drawer__title">订货处理 · {detail.username}</div><div className="ck-drawer__sub">DEALER ORDER OPS</div></div><button type="button" className="ck-drawer__close" onClick={closeDrawer} aria-label="关闭面板">×</button></div>
          <div className="ck-drawer__body">{detailBody(detail)}</div>
          <div className="ck-drawer__foot"><button type="button" className="ck-btn" onClick={closeDrawer}>关闭</button></div>
        </aside>
        :<form className="ck-drawer" onSubmit={quote?submitQuote:allocationOrder?submitAllocation:paymentOrder?submitPayment:submitInvoice}>
          <fieldset disabled={busy} style={{display:'contents'}}>
            <div className="ck-drawer__head"><div><div className="ck-drawer__title">{quote?'填写报价':allocationOrder?'分配库存':paymentOrder?'登记到账':'登记已开具发票'} · {drawerOrder.username}</div><div className="ck-drawer__sub">DEALER ORDER OPS</div></div><button type="button" className="ck-drawer__close" onClick={closeDrawer} aria-label="关闭面板">×</button></div>
            <div className="ck-drawer__body">
              {quote&&<>
                <div className="ck-field"><span>报价币种</span><select className="ck-input" required value={currency} onChange={e=>setCurrency(e.target.value)}><option value="">选择币种</option><option value="EUR">EUR</option><option value="CNY">CNY</option></select></div>
                <table className="ck-table"><thead><tr><th>SKU</th><th className="num">数量</th><th className="num">单价</th></tr></thead><tbody>{quote.items.map((item,index)=><tr key={item.id}><td>{item.sku} · {item.productName}</td><td className="num">{item.quantity}</td><td className="num"><input className="ck-input" style={{width:130}} type="number" min="0" step="0.01" required value={item.price} onChange={e=>setQuote({...quote,items:quote.items.map((line,i)=>i===index?{...line,price:e.target.value}:line)})}/></td></tr>)}</tbody></table>
                <div className="ck-field"><span>给经销商的报价说明</span><textarea className="ck-input" rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></div>
              </>}
              {allocationOrder&&allocationOrder.items.map(item=><div className="ck-field" key={item.id}><span>{item.sku} · {item.productName} · {item.quantity} 件</span><select className="ck-input" required value={allocationWarehouses[item.id]||''} onChange={e=>setAllocationWarehouses({...allocationWarehouses,[item.id]:e.target.value})}><option value="">选择仓库</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}</select></div>)}
              {paymentOrder&&payment&&<>
                <div className="ck-kv">订单 {paymentOrder.currency} {paymentOrder.orderTotal} · 退货抵扣 {paymentOrder.currency} {paymentOrder.returnCreditTotal||'0.00'} · 已收 {paymentOrder.currency} {paymentOrder.paidTotal} · 已退款 {paymentOrder.currency} {paymentOrder.refundTotal||'0.00'} · 当前未结 <b>{paymentOrder.currency} {formatCents(dealerBalanceCents(paymentOrder))}</b></div>
                <div className="ck-field"><span>到账金额 ({paymentOrder.currency})</span><input className="ck-input" type="number" min="0.01" max={formatCents(dealerBalanceCents(paymentOrder))} step="0.01" required value={payment.amount} onChange={e=>setPayment({...payment,amount:e.target.value})}/></div>
                <div className="ck-field"><span>银行流水/参考号</span><input className="ck-input" maxLength={120} value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></div>
                <div className="ck-field"><span>说明</span><textarea className="ck-input" rows={2} maxLength={2000} value={payment.note} onChange={e=>setPayment({...payment,note:e.target.value})}/></div>
              </>}
              {invoiceOrder&&invoice&&<>
                <div className="ck-row">
                  <div className="ck-field"><span>发票号码</span><input className="ck-input" required maxLength={120} value={invoice.invoiceNumber} onChange={e=>setInvoice({...invoice,invoiceNumber:e.target.value})}/></div>
                  <div className="ck-field"><span>开票日期</span><input className="ck-input" type="date" required value={invoice.issuedOn} onChange={e=>setInvoice({...invoice,issuedOn:e.target.value})}/></div>
                  <div className="ck-field"><span>到期日期（可选）</span><input className="ck-input" type="date" min={invoice.issuedOn} value={invoice.dueOn} onChange={e=>setInvoice({...invoice,dueOn:e.target.value})}/></div>
                </div>
                <div className="ck-kv">发票金额：<b>{invoiceOrder.currency} {invoiceOrder.orderTotal}</b></div>
                <div className="ck-field"><span>备注</span><textarea className="ck-input" rows={2} maxLength={2000} value={invoice.note} onChange={e=>setInvoice({...invoice,note:e.target.value})}/></div>
              </>}
            </div>
            <div className="ck-drawer__foot">
              <button type="button" className="ck-btn" disabled={busy} onClick={closeDrawer}>取消</button>
              <button className="ck-btn is-primary" disabled={busy||(quote?!currency:false)}>{quote?'发送报价':allocationOrder?'确认并预占':paymentOrder?'保存收款':'保存发票并生成对账'}</button>
            </div>
          </fieldset>
        </form>}
    </>}
  </>;
}
