import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {uuidv7} from '../uuidv7.js';
import {createRequestIds} from '../request-ids.js';

const today=()=>new Date().toISOString().slice(0,10);
  const fmt=(value,currency)=>{const [whole,fraction='']=String(value??'0').split('.');const grouped=BigInt(whole||0).toLocaleString('zh-CN');const decimals=fraction.replace(/0+$/,'');return `${currency||''} ${grouped}${decimals?`.${decimals}`:''}`};
/** 账龄接口已经把各币种折成 CNY，这里统一用 ¥ 显示；超过万元用紧凑写法，KPI 卡里好读 */
const cny=(value)=>{const n=Number(value||0);if(Math.abs(n)>=10000)return `¥${(n/10000).toFixed(1)}万`;return `¥${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`};
const stamp=value=>{if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value).slice(0,16);const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
/** 纯日期字段防御：接口若仍返回 date 对象，UTC slice 会少一天；这里按字面日期优先、Date 本地取年月日 */
const day=value=>{if(!value)return'—';if(value instanceof Date){const p=n=>String(n).padStart(2,'0');return `${value.getFullYear()}-${p(value.getMonth()+1)}-${p(value.getDate())}`}const m=/^(\d{4}-\d{2}-\d{2})/.exec(String(value));return m?m[1]:String(value).slice(0,10)};
const initial={partnerId:'',currency:'CNY',issueDate:today(),dueDate:'',externalReference:'',description:'',amount:'',note:'',sourceType:'MANUAL',sourceId:''};
// 账龄分析：6 档分桶（照 8090 OMS 口径）。健康账本也应有信息量，故把「30 天内到期」单列一档。
const AGING_TONE={ok:'var(--success)',info:'#3b82f6',warn:'#f59e0b',bad:'#dc2626'};
const AGING_LABEL={AR:'应收',AP:'应付'};

function AgingSide({title,note,data}){
  // 接口形状变动或返回空时必须自己兜住：这里一旦抛错，React 会整棵卸载，整个财务页白屏
  const d=data&&typeof data==='object'?data:{};
  const buckets=Array.isArray(d.buckets)?d.buckets:[];
  const topPartners=Array.isArray(d.topPartners)?d.topPartners:[];
  const amount=value=>Number(value||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const total=Number(d.total||0)||1;
  const maxDays=Number(d.maxOverdueDays||0);
  const riskNote=maxDays>90?'已达坏账警戒':maxDays>0?'仍在催收窗口':'账本健康';
  return <div className="ag-side">
    <div className="ag-head">
      <div><div className="ag-title">{title}</div><div className="ag-note">{note}</div></div>
      <div className="ag-total"><b>{cny(d.total)}</b><span>{d.count??(Array.isArray(d.rows)?d.rows.length:0)} 笔未结</span></div>
    </div>
    <div className="ag-bar">{buckets.filter(b=>Number(b.amount)>0).map(b=><span key={b.key} className="ag-seg" style={{width:`${(Number(b.amount||0)/total)*100}%`,background:AGING_TONE[b.tone]||'#cbd5e1'}} title={`${b.label} ¥${amount(b.amount)}`}/>)}{!buckets.some(b=>Number(b.amount)>0)&&<span className="ag-seg" style={{width:'100%',background:'var(--line)'}}/>}</div>
    <div className="ag-legend">{buckets.map(b=><div className="ag-row" key={b.key}>
      <span className="ag-dot" style={{background:AGING_TONE[b.tone]||'#cbd5e1'}}/>
      <span className="ag-name">{b.label}</span><span className="ag-cnt">{b.count} 笔</span>
      <span className="ag-amt mono">{Number(b.amount)>0?`¥${amount(b.amount)}`:'—'}</span>
      <span className="ag-ratio">{Number(b.amount)>0?`${b.ratio}%`:''}</span>
    </div>)}</div>
    <div className="ag-metrics">
      <div className={'ag-metric'+(Number(d.overdueAmount)>0?' is-risk':'')}><span>逾期金额</span><b>{Number(d.overdueAmount)>0?cny(d.overdueAmount):'无逾期'}</b><em>{d.overdueCount??0} 笔 · 占比 {d.overdueRatio??0}%</em></div>
      <div className="ag-metric"><span>加权平均逾期</span><b>{d.avgOverdueDays??0} 天</b><em>按金额加权</em></div>
      <div className="ag-metric"><span>最长逾期</span><b>{maxDays} 天</b><em>{riskNote}</em></div>
      <div className="ag-metric"><span>30 天内到期</span><b>{cny(d.dueSoonAmount)}</b><em>{d.dueSoonCount??0} 笔待付/待收</em></div>
    </div>
    {topPartners.length>0&&<div className="ag-partners"><div className="ag-p-head">逾期金额最大往来单位</div>{topPartners.map(p=><div className="ag-p-row" key={p.partner}><span className="ag-p-name">{p.partner}</span><span className="ag-p-days">最长 {p.maxDays} 天</span><span className="mono">¥{amount(p.amount)}</span></div>)}</div>}
  </div>;
}

export default function FinancePage({active=true}){
 const [data,setData]=useState(null),[costs,setCosts]=useState([]),[sales,setSales]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState(initial);
 const [aging,setAging]=useState(null),[agingAsOf,setAgingAsOf]=useState('');
 const [obligationCategory,setObligationCategory]=useState('ALL'); // ALL / AR / AP / FREIGHT
 const sequence=useRef(0);
 const settlementKeys=useRef(new Map());
 const financeRequestIds=useRef(createRequestIds());
 // 账龄接口偶发失败（Neon 跨境抖动）时自动重试，避免用户看到「暂不可用」误以为页面缺账龄分析
 const loadAging=useCallback(async (asOf,attempt=0)=>{try{const r=await api.financeAging(asOf||'');setAging(r?.data??r??null)}catch(_){if(attempt<2)setTimeout(()=>loadAging(asOf,attempt+1),1500);else setAging(null)}},[]);
 const load=useCallback(async()=>{const n=++sequence.current;setError('');try{const [summary,production,orderSummary]=await Promise.all([api.financeSummary(),api.productionCosts(),api.salesOrderSummary().catch(()=>null)]);if(n===sequence.current){setData(summary.data);setCosts(production);setSales(orderSummary?.data??orderSummary??null)}}catch(e){if(n===sequence.current)setError(e.message||'财务数据读取失败')}},[]);
 // 账龄基准日可独立推演，不跟着主数据一起重拉
 useEffect(()=>{if(active)loadAging(agingAsOf)},[active,agingAsOf,loadAging]);
 useEffect(()=>{if(!active){sequence.current++;return}load();return()=>{sequence.current++}},[active,load]);
 const run=async fn=>{if(busy)return;setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e.message||'操作失败')}finally{setBusy(false)}};
 const requestIdFor=(name,payload)=>financeRequestIds.current.get(name,payload);
 const clearRequestId=(name,payload)=>financeRequestIds.current.clear(name,payload);
 const settleObligation=o=>run(async()=>{const storageKey=`alsvid:finance-settle:${o.id}`;let key=settlementKeys.current.get(o.id);if(!key){try{key=sessionStorage.getItem(storageKey)}catch{}key=key||uuidv7();settlementKeys.current.set(o.id,key);try{sessionStorage.setItem(storageKey,key)}catch{}}await api.settleFinanceObligation(o.id,{idempotencyKey:key});settlementKeys.current.delete(o.id);try{sessionStorage.removeItem(storageKey)}catch{}});
 const ask=label=>window.prompt(label);
 const partnerOptions=data?.references.partners||[];
 const categoryOf=o=>o.category||(o.direction==='AR'?'AR':'AP');
 const allObligations=(Array.isArray(data?.obligations)?data.obligations:[]).filter(o=>o.settlement_status!=='VOID');
 const agingRows=new Map([...(aging?.receivable?.rows||[]),...(aging?.payable?.rows||[])].map(r=>[r.id,r]));
 const agingCell=o=>{if(['SETTLED','VOID'].includes(o.settlement_status))return <span className="hint">—</span>;const a=agingRows.get(o.id);if(!a)return <span className="hint">—</span>;if(Number(a.overdueDays)>0)return <span className={'aging-tag '+(Number(a.overdueDays)>60?'bad':'warn')}>逾期 {a.overdueDays} 天</span>;return <span className={'aging-tag '+(Number(a.daysToDue)<=30?'info':'ok')}>{a.daysToDue} 天后到期</span>};
 const statusLabel={SETTLED:'已结',OPEN:'未结',PARTIALLY_SETTLED:'部分核销',VOID:'已作废'};
 const categoryCounts={ALL:allObligations.length,
   AR:allObligations.filter(o=>categoryOf(o)==='AR').length,
   AP:allObligations.filter(o=>categoryOf(o)==='AP').length,
   FREIGHT:allObligations.filter(o=>categoryOf(o)==='FREIGHT').length};
 const shownObligations=obligationCategory==='ALL'?allObligations:allObligations.filter(o=>categoryOf(o)===obligationCategory);
 const sources=type=>type==='PROCUREMENT_PO'?data?.references.purchaseOrders||[]:type==='COMMERCE_ORDER'?data?.references.commerceOrders||[]:type==='LOGISTICS_SHIPMENT'?data?.references.shipments||[]:[];
 const sourceLabel=(type,row)=>type==='PROCUREMENT_PO'?`${row.po_number} · ${row.supplier_name}`:type==='COMMERCE_ORDER'?`${row.order_number} · ${row.status}`:`${row.shipment_no} · ${row.status}`;
 const field=(label,key,type='text',required=true)=><label>{label}<input type={type} step={type==='number'?(key==='rate'?'0.000000000001':'0.000001'):undefined} required={required} value={form[key]??''} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
 const partnerSelect=<label>合作方<select required value={form.partnerId} onChange={e=>setForm({...form,partnerId:e.target.value})}><option value="">请选择</option>{partnerOptions.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>;
 const sourceFields=<><label>业务来源<select value={form.sourceType||'MANUAL'} onChange={e=>setForm({...form,sourceType:e.target.value,sourceId:''})}><option value="MANUAL">手工</option><option value="PROCUREMENT_PO">采购订单</option><option value="COMMERCE_ORDER">商城订单</option><option value="LOGISTICS_SHIPMENT">发货单</option></select></label>{form.sourceType&&form.sourceType!=='MANUAL'&&<label>来源单<select required value={form.sourceId||''} onChange={e=>setForm({...form,sourceId:e.target.value})}><option value="">请选择</option>{sources(form.sourceType).map(row=><option key={row.id||row.entity_uuid} value={row.id||row.entity_uuid}>{sourceLabel(form.sourceType,row)}</option>)}</select></label>}</>;
 const createDocument=e=>{e.preventDefault();run(async()=>{const payload={documentType:form.documentType||'SUPPLIER_INVOICE',partnerId:form.partnerId,currency:form.currency,issueDate:form.issueDate,dueDate:form.dueDate||null,externalReference:form.externalReference,sourceType:form.sourceType||'MANUAL',sourceId:form.sourceType==='MANUAL'?null:form.sourceId,note:form.note,lines:[{category:'OTHER',description:form.description||'财务单据',netAmount:form.amount,taxAmount:'0',quantity:'1',unitPrice:form.amount,shipmentUuid:form.sourceType==='LOGISTICS_SHIPMENT'?form.sourceId:null}]};await api.createFinanceDocument({...payload,id:requestIdFor('document',payload)});clearRequestId('document',payload);setForm(initial)})};
 const createObligation=e=>{e.preventDefault();run(async()=>{const payload={direction:form.obligationCategory==='AR'?'AR':'AP',partnerId:form.partnerId,currency:form.currency,amount:form.amount,dueDate:form.dueDate||null,sourceType:form.sourceType||'MANUAL',sourceId:form.sourceType==='MANUAL'?null:form.sourceId,note:(form.obligationCategory==='FREIGHT'?'运费 · '+(form.note||''):form.note)};await api.createFinanceObligation({...payload,id:requestIdFor('obligation',payload)});clearRequestId('obligation',payload);setForm(initial)})};
 const createPayment=e=>{e.preventDefault();run(async()=>{const payload={direction:form.direction||'OUTBOUND',partnerId:form.partnerId||null,currency:form.currency,amount:form.amount,valueDate:form.issueDate,provider:form.provider||'MANUAL',externalReference:form.externalReference,note:form.note};await api.createFinancePayment({...payload,idempotencyKey:requestIdFor('payment',payload)});clearRequestId('payment',payload);setForm(initial)})};
 const submitFx=e=>{e.preventDefault();run(()=>api.createFinanceFxRate({baseCurrency:form.baseCurrency,quoteCurrency:form.quoteCurrency,rate:form.rate,effectiveAt:new Date(form.effectiveAt).toISOString(),source:form.source||'MANUAL',externalReference:form.externalReference}))};
 const submitAllocation=e=>{e.preventDefault();const payload={paymentId:form.paymentId,obligationId:form.obligationId,paymentAmount:form.paymentAmount,obligationAmount:form.obligationAmount,fxRateId:form.fxRateId||null,note:form.note};run(async()=>{await api.allocateFinancePayment({...payload,idempotencyKey:requestIdFor('allocation',payload)});clearRequestId('allocation',payload)})};
 const createLanded=e=>{e.preventDefault();run(()=>api.createLandedCostBatch({shipmentUuid:form.shipmentUuid,currency:form.currency,allocationBasis:form.allocationBasis||'QUANTITY',note:form.note}))};
 return <div className="card">
  <div className="row" style={{alignItems:'flex-start',flexWrap:'wrap'}}>
   <div><div style={{fontSize:11,letterSpacing:'0.12em',color:'var(--text-sub)'}}>FINANCE RECONCILIATION</div><h2 style={{margin:'2px 0'}}>财务对账</h2><p className="hint">每笔出运都会自动生成应收、采购应付与运费应付；妥投后应收自动核销，生产单归档。</p></div>
   <span style={{flex:1}}/>
   <span className="tag on">已核销 {aging?.closedCount??0} 笔</span>
  </div>
  {error&&<p className="error-text" role="alert">{error} <button className="btn small" type="button" disabled={busy} onClick={load}>重新加载</button></p>}
  {/* 顶部三张 KPI：与 8090 财务对账同口径，金额全部折人民币 */}
  {aging&&<section className="metric-grid" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}} aria-label="财务总览">
   <article className="metric-card">
    <span className="metric-label">应收未结</span>
    <strong>{cny(aging.receivable?.total)}</strong>
    <span className="hint">客户应收账款（折人民币）</span>
   </article>
   <article className="metric-card">
    <span className="metric-label">应付未结</span>
    <strong>{cny(aging.payable?.total)}</strong>
    <span className="hint">工厂采购 + 国际运费</span>
   </article>
   <article className="metric-card">
    <span className="metric-label">综合毛利</span>
    <strong>{cny(sales?.metrics?.grossProfit)}<small style={{fontSize:12,marginLeft:6}}> {sales?.metrics?.grossMargin??0}%</small></strong>
    <span className="hint">已出运订单口径</span>
   </article>
  </section>}
  <section className="card" style={{marginBottom:16}}>
   <div className="row" style={{flexWrap:'wrap'}}>
    <h3 style={{margin:0}}>账龄分析</h3>
    <span className="hint">基准日 {aging?.asOf||'—'}{agingAsOf?' · 模拟推演':''} · 未结应收应付按逾期天数分六档</span>
    <span style={{flex:1}}/>
    {[['今天',''],['+30 天','30'],['+60 天','60'],['+90 天','90']].map(([label,offset])=><button key={label} type="button" className={'btn small'+(agingAsOf===offset?' primary':'')} onClick={()=>{const d=new Date();d.setDate(d.getDate()+Number(offset||0));setAgingAsOf(offset?d.toISOString().slice(0,10):'')}}>{label}</button>)}
    {agingAsOf&&<button type="button" className="btn small" onClick={()=>setAgingAsOf('')}>重置</button>}
   </div>
   {aging?<>
    <div className="row" style={{alignItems:'flex-start',gap:16,marginTop:12,flexWrap:'wrap'}}>
    <AgingSide title="应收账龄" note="客户欠款，按到期日划分" data={aging.receivable}/>
    <AgingSide title="应付账龄" note="工厂采购与头程运费欠款" data={aging.payable}/>
   </div>
   {(()=>{const rk=aging.receivable?.riskAmounts||{};const t=['LOW','MEDIUM','HIGH','CRITICAL'].reduce((s,k)=>s+Number(rk[k]||0),0);return t>0?<div className="ag-risk"><span className="ag-risk-label">应收坏账风险敞口</span>{[['LOW','低风险'],['MEDIUM','中风险'],['HIGH','高风险'],['CRITICAL','极高风险']].map(([k,label])=>Number(rk[k]||0)>0?<span key={k} className={'ag-risk-item '+(['HIGH','CRITICAL'].includes(k)?'bad':'warn')}>{label}<b className="mono">{cny(rk[k])}</b></span>:null)}</div>:null})()}
   </>:<p className="hint">账龄数据读取中或暂不可用。<button className="btn small" style={{marginLeft:8}} onClick={()=>loadAging(agingAsOf)}>重试</button></p>}
  </section>
  {!data?<p className="hint" role="status">正在读取财务台账…（首次启用需先部署本地迁移文件）</p>:<>
   <section className="metric-grid">{data.partnerBalances.map((b,i)=><article className="metric-card" key={`${b.partner_id}-${b.currency}-${b.direction}-${i}`}><span className="metric-label">{b.partner_name} · {b.direction==='AP'?'应付':'应收'}未结</span><strong>{fmt(b.outstanding_amount,b.currency)}</strong></article>)}</section>
   <div className="form-grid finance-forms mt16">
    <form className="card" onSubmit={createDocument}><h3>新建财务单据</h3>{partnerSelect}<label>类型<select value={form.documentType||'SUPPLIER_INVOICE'} onChange={e=>setForm({...form,documentType:e.target.value})}><option value="SUPPLIER_INVOICE">供应商发票</option><option value="CUSTOMER_INVOICE">客户发票</option><option value="SUPPLIER_CREDIT_NOTE">供应商贷项</option><option value="CUSTOMER_CREDIT_NOTE">客户贷项</option><option value="DEBIT_NOTE">借项通知</option><option value="OTHER">其他</option></select></label>{sourceFields}<label>币种<input required maxLength="3" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>{field('单据金额','amount','number')}{field('开票日期','issueDate','date')}{field('到期日期','dueDate','date',false)}{field('外部单号','externalReference','text',false)}{field('说明','description')}{field('备注','note','text',false)}<button className="btn primary" disabled={busy}>保存草稿</button></form>
    <form className="card" onSubmit={createObligation}><h3>登记应收 / 应付</h3>{partnerSelect}<label>类别<select value={form.obligationCategory||'AP'} onChange={e=>setForm({...form,obligationCategory:e.target.value})}><option value="AP">采购应付</option><option value="FREIGHT">运费应付</option><option value="AR">应收</option></select></label>{sourceFields}<label>币种<input required maxLength="3" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>{field('金额','amount','number')}{field('到期日期','dueDate','date',false)}{field('备注','note','text',false)}<button className="btn primary" disabled={busy}>登记</button></form>
    <form className="card" onSubmit={createPayment}><h3>登记收付款</h3>{partnerSelect}<label>方向<select value={form.direction||'OUTBOUND'} onChange={e=>setForm({...form,direction:e.target.value})}><option value="OUTBOUND">付款</option><option value="INBOUND">收款</option></select></label><label>币种<input required maxLength="3" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label>{field('金额','amount','number')}{field('到账 / 付款日期','issueDate','date')}{field('渠道','provider')}{field('外部流水号','externalReference','text',false)}{field('备注','note','text',false)}<button className="btn primary" disabled={busy}>登记收付款</button></form>
    <form className="card" onSubmit={submitFx}><h3>新增汇率</h3>{field('基准币种','baseCurrency')}{field('目标币种','quoteCurrency')}{field('汇率','rate','number')}{field('生效时间','effectiveAt','datetime-local')}{field('来源','source')}{field('外部编号','externalReference','text',false)}<button className="btn primary" disabled={busy}>保存汇率</button></form>
    <form className="card" onSubmit={submitAllocation}><h3>收付款核销</h3><label>未冲销收付款<select required value={form.paymentId||''} onChange={e=>setForm({...form,paymentId:e.target.value})}><option value="">请选择</option>{data.payments.filter(p=>p.allocation_status!=='REVERSED'&&Number(p.unallocated_amount)>0).map(p=><option key={p.id} value={p.id}>{p.payment_number} · {p.direction} · {fmt(p.unallocated_amount,p.currency)}</option>)}</select></label><label>未结应收应付<select required value={form.obligationId||''} onChange={e=>setForm({...form,obligationId:e.target.value})}><option value="">请选择</option>{data.obligations.filter(o=>Number(o.outstanding_amount)>0&&o.settlement_status!=='VOID').map(o=><option key={o.id} value={o.id}>{o.obligation_number} · {o.partner_name} · {fmt(o.outstanding_amount,o.currency)}</option>)}</select></label>{field('付款币种金额','paymentAmount','number')}{field('核销币种金额','obligationAmount','number')}<label>汇率（跨币种必选）<select value={form.fxRateId||''} onChange={e=>setForm({...form,fxRateId:e.target.value})}><option value="">同币种</option>{data.fxRates.map(x=><option key={x.id} value={x.id}>{x.base_currency}/{x.quote_currency} {x.rate}</option>)}</select></label>{field('备注','note','text',false)}<button className="btn primary" disabled={busy}>确认核销</button></form>
    <form className="card" onSubmit={createLanded}><h3>创建到岸成本批次</h3><label>发货单<select required value={form.shipmentUuid||''} onChange={e=>setForm({...form,shipmentUuid:e.target.value})}><option value="">请选择</option>{data.references.shipments.map(x=><option key={x.entity_uuid} value={x.entity_uuid}>{x.shipment_no} · {x.status}</option>)}</select></label><label>币种<input required maxLength="3" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></label><label>分摊基准<select value={form.allocationBasis||'QUANTITY'} onChange={e=>setForm({...form,allocationBasis:e.target.value})}><option value="QUANTITY">数量</option><option value="VALUE">价值</option><option value="WEIGHT">重量</option><option value="MANUAL">手工</option></select></label>{field('备注','note','text',false)}<button className="btn primary" disabled={busy}>创建批次</button></form>
   </div>
   <h3 className="mt16">财务单据</h3><table className="table"><thead><tr><th>编号</th><th>合作方</th><th>类型</th><th>日期</th><th>金额</th><th>状态 / 操作</th></tr></thead><tbody>{data.documents.map(d=><tr key={d.id}><td>{d.document_number}</td><td>{d.partner_name}</td><td>{d.document_type}</td><td>{day(d.issue_date)}</td><td>{fmt(d.total_amount,d.currency)}</td><td>{d.status} {d.status==='DRAFT'&&<button className="btn small" disabled={busy} onClick={()=>run(()=>api.financeDocumentAction(d.id,'verify',{expectedVersion:d.version}))}>核验</button>} {d.status==='VERIFIED'&&<><button className="btn small" disabled={busy} onClick={()=>run(()=>api.financeDocumentAction(d.id,'post',{expectedVersion:d.version}))}>入账</button><button className="btn small" disabled={busy} onClick={()=>run(()=>api.financeDocumentAction(d.id,'draft',{expectedVersion:d.version}))}>退回草稿</button></>} {['DRAFT','VERIFIED'].includes(d.status)&&<button className="btn small" disabled={busy} onClick={()=>{const reason=ask('请输入作废原因');if(reason)run(()=>api.financeDocumentAction(d.id,'void',{expectedVersion:d.version,reason}))}}>作废</button>}</td></tr>)}</tbody></table>
   <div className="row" style={{flexWrap:'wrap',gap:6,marginTop:16}}>
    <h3 style={{margin:0,marginRight:8}}>应收应付</h3>
    {[['ALL','全部'],['AR','应收'],['AP','采购应付'],['FREIGHT','运费应付']].map(([key,label])=><button key={key} type="button" className={'btn small'+(obligationCategory===key?' primary':'')} onClick={()=>setObligationCategory(key)}>{label} {categoryCounts[key]}</button>)}
   </div><table className="table"><thead><tr><th>单据</th><th>类型</th><th>往来单位</th><th>关联单号</th><th>金额</th><th>到期日</th><th>账龄</th><th>状态</th><th>备注</th><th>操作</th></tr></thead><tbody>{shownObligations.map(o=><tr key={o.id}>
    <td className="mono" style={{fontSize:11}}>{stamp(o.created_at)}</td>
    <td><span className={'tag '+(categoryOf(o)==='FREIGHT'?'sku':categoryOf(o)==='AR'?'on':'plan')}>{({AR:'应收',AP:'采购应付',FREIGHT:'运费'})[categoryOf(o)]||categoryOf(o)}</span></td>
    <td>{o.partner_name}</td><td className="mono" style={{fontSize:11.5}}>{o.reference_no||'—'}</td>
    <td className="mono">{fmt(o.original_amount,o.currency)}</td><td className="hint">{day(o.due_date)}</td>
    <td>{agingCell(o)}</td><td><span className={'tag '+(o.settlement_status==='SETTLED'?'on':'plan')}>{statusLabel[o.settlement_status]||o.settlement_status}</span></td>
    <td className="hint" style={{fontSize:11}}>{o.note||''}</td>
    <td>{o.settlement_status==='SETTLED'?<span className="hint">已核销</span>:<><button className="btn small" disabled={busy} onClick={()=>settleObligation(o)}>核销</button> <button className="btn small" disabled={busy} onClick={()=>{const reason=ask('请输入作废原因');if(reason)run(()=>api.voidFinanceObligation(o.id,{reason}))}}>作废</button></>}</td>
   </tr>)}{!shownObligations.length&&<tr><td className="empty-cell" colSpan="10">没有该类别的应收应付</td></tr>}</tbody></table>
   <h3 className="mt16">收付款</h3><table className="table"><thead><tr><th>编号</th><th>日期</th><th>方向</th><th>合作方</th><th>金额</th><th>未分配</th><th>状态 / 操作</th></tr></thead><tbody>{data.payments.map(p=><tr key={p.id}><td>{p.payment_number}</td><td>{day(p.value_date)}</td><td>{p.direction}</td><td>{p.partner_name||'—'}</td><td>{fmt(p.amount,p.currency)}</td><td>{fmt(p.unallocated_amount,p.currency)}</td><td>{p.allocation_status} {p.allocation_status!=='REVERSED'&&<button className="btn small" disabled={busy} onClick={()=>{const reason=ask('请输入冲销原因');if(reason)run(()=>api.reverseFinancePayment(p.id,{reason}))}}>冲销</button>}</td></tr>)}</tbody></table>
   <h3 className="mt16">核销记录</h3><table className="table"><thead><tr><th>付款编号</th><th>应收应付编号</th><th>付款金额</th><th>核销金额</th><th>状态 / 操作</th></tr></thead><tbody>{data.allocations.map(a=><tr key={a.id}><td>{a.payment_number}</td><td>{a.obligation_number}</td><td>{fmt(a.payment_amount,a.payment_currency||'')}</td><td>{fmt(a.obligation_amount,a.obligation_currency||'')}</td><td>{a.reversal_id?'已冲销':<button className="btn small" disabled={busy} onClick={()=>{const reason=ask('请输入核销更正原因');if(reason)run(()=>api.reverseFinanceAllocation(a.id,{reason}))}}>冲销核销</button>}</td></tr>)}</tbody></table>
   <h3 className="mt16">到岸成本批次</h3>{data.landedBatches.map(b=>{const components=data.landedComponents.filter(c=>c.batch_id===b.id);return <article className="card mt16" key={b.id}><h4>{b.batch_number} · {b.shipment_no} · {b.status}</h4><p>{b.currency} · 分摊基准：{b.allocation_basis}</p>{b.status==='DRAFT'&&<><form className="form-grid" onSubmit={e=>{e.preventDefault();const formElement=e.currentTarget,f=new FormData(formElement),payload={batchId:b.id,category:f.get('category'),amount:f.get('amount'),currency:f.get('currency'),batchCurrencyAmount:f.get('batchCurrencyAmount'),fxRateId:f.get('fxRateId')||null,capitalizable:f.get('capitalizable')==='on',note:f.get('note')};run(async()=>{await api.addLandedCostComponent(b.id,{...payload,idempotencyKey:requestIdFor('landed-component',payload)});clearRequestId('landed-component',payload);formElement.reset()})}}><label>费用类别<select name="category"><option value="GOODS">货物</option><option value="FREIGHT">运费</option><option value="INSURANCE">保险</option><option value="DUTY">关税</option><option value="IMPORT_VAT">进口增值税</option><option value="ANTI_DUMPING">反倾销税</option><option value="COUNTERVAILING">反补贴税</option><option value="OPERATIONAL_FEE">操作费</option><option value="OTHER">其他</option></select></label><label>原币种金额<input name="amount" type="number" min="0" step="0.000001" required/></label><label>原币种<input name="currency" defaultValue={b.currency} maxLength="3" required/></label><label>批次币种金额<input name="batchCurrencyAmount" type="number" min="0" step="0.000001" required/></label><label>汇率<select name="fxRateId"><option value="">无（同币种）</option>{data.fxRates.map(x=><option key={x.id} value={x.id}>{x.base_currency}/{x.quote_currency} · {x.rate}</option>)}</select></label><label><input type="checkbox" name="capitalizable" defaultChecked/>计入成本</label><label>备注<input name="note" maxLength="1000"/></label><button className="btn small" disabled={busy}>添加费用</button></form></>}{components.map(c=>{const allocations=data.landedAllocations.filter(a=>a.component_id===c.id);const available=data.references.cargo.filter(v=>v.shipment_uuid===b.shipment_uuid&&!allocations.some(a=>a.cargo_vin_uuid===v.id));return <section className="mt16" key={c.id}><strong>{c.category} · {fmt(c.amount,c.currency)} → {fmt(c.batch_currency_amount,b.currency)} {c.capitalizable?'· 计入成本':'· 不计入成本'}</strong>{b.status==='DRAFT'&&c.capitalizable&&available.length>0&&<form className="form-grid" onSubmit={e=>{e.preventDefault();const formElement=e.currentTarget,f=new FormData(formElement),payload={componentId:c.id,cargoVinUuid:f.get('vin'),allocatedAmount:f.get('amount'),basisValue:f.get('basis')||null};run(async()=>{await api.allocateLandedCost(c.id,{...payload,idempotencyKey:requestIdFor('landed-allocation',payload)});clearRequestId('landed-allocation',payload);formElement.reset()})}}><label>分配 VIN<select name="vin" required><option value="">请选择</option>{available.map(v=><option key={v.id} value={v.id}>{v.frame_number}</option>)}</select></label><label>分配金额（{b.currency}）<input name="amount" type="number" min="0" step="0.000001" required/></label><label>分摊基数<input name="basis" type="number" min="0" step="0.000001"/></label><button className="btn small" disabled={busy}>分配</button></form>}{allocations.map(a=><p className="hint" key={a.id}>{a.frame_number} · {fmt(a.allocated_amount,b.currency)}{a.basis_value?` · 基数 ${a.basis_value}`:''} {b.status==='DRAFT'&&<button className="btn small" type="button" disabled={busy} onClick={()=>{if(window.confirm('删除这条草稿分配？'))run(()=>api.deleteLandedCostAllocation(a.id))}}>移除</button>}</p>)}</section>})}{b.status==='DRAFT'&&<button className="btn small mt16" disabled={busy||components.length===0} onClick={()=>{if(window.confirm('确认审核并冻结此批次？资本化费用须完成全部 VIN 分配。'))run(()=>api.finalizeLandedCost(b.id))}}>审核冻结</button>}</article>})}
   <h3 className="mt16">生产成本台账</h3>{costs.length?<table className="table"><thead><tr><th>日期</th><th>来源</th><th>订单 / 发运</th><th>SKU</th><th>科目</th><th>金额</th><th>状态</th></tr></thead><tbody>{costs.map(c=><tr key={c.recordId}><td>{new Date(c.recordedAt).toLocaleDateString('zh-CN')}</td><td>{c.source}</td><td>{c.orderNo} / {c.shipmentNo||'—'}</td><td>{c.sku}</td><td>{c.costType}</td><td>{fmt(c.amount,c.currency)}</td><td>{c.status||'—'}</td></tr>)}</tbody></table>:<p className="hint">暂无生产成本记录</p>}
  </>}
 </div>;
}
