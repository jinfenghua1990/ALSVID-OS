import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {api} from '../api.js';

/*
 * 库存中心 · 整车资产台账
 * 回答一个 SKU 级库存答不了的问题：这一台车现在算谁的。
 * 四态：STOCK 实体仓在库 / VIRTUAL 虚拟仓待出库 / IN_TRANSIT 国际在途 / CUSTOMER 买方持有。
 * 状态来自销售订单推进：完工交货 → 预占/在库，出运 → 在途，妥投 → 买方持有。
 */

const OWNERS=[
  {key:'STOCK',label:'实体仓在库',tone:'on',note:'已入库、可直接出库'},
  {key:'VIRTUAL',label:'虚拟仓待出库',tone:'plan',note:'已完工、被销售订单预占'},
  {key:'IN_TRANSIT',label:'国际在途',tone:'on',note:'已出运、尚未签收'},
  {key:'CUSTOMER',label:'买方持有',tone:'',note:'客户已签收、订单结案'},
];
const OWNER_MAP=Object.fromEntries(OWNERS.map(row=>[row.key,row]));
const day=value=>value?new Date(value).toLocaleDateString('zh-CN'):'—';
const money=(value,currency)=>{const n=Number(value||0);const symbol={CNY:'¥',EUR:'€',USD:'$'}[currency]||'';return `${symbol}${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`};

export default function VehicleAssetPage({active=true}){
  const [data,setData]=useState(null);
  const [owner,setOwner]=useState('');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{ setData(await api.salesOrderAssets({owner,q:query})); }
    catch(e){ setError(e.message||'资产台账读取失败'); }
    finally{ setLoading(false); }
  },[owner,query]);
  useEffect(()=>{ if(!active)return; const timer=setTimeout(load,query?250:0); return ()=>clearTimeout(timer); },[active,load,query]);

  const compact=value=>{const n=Number(value||0);return Math.abs(n)>=10000?`¥${(n/10000).toFixed(1)}万`:`¥${Math.round(n).toLocaleString('zh-CN')}`};
  const exportAssets=()=>{const header=['VIN','电机号','车型','SKU','归属','生产单','销售订单','客户','采购成本CNY','头程运费CNY','落仓成本CNY','批次','库龄天数'];const lines=rows.map(r=>[r.vin,r.motor_number,r.model,r.sku_code,r.owner_state,r.order_no,r.sales_order_no,r.customer_name,r.factory_cost_cny,r.freight_cost_cny,r.landed_cost_cny,r.batch,r.in_stock_days].map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(','));const blob=new Blob([[header.join(','),...lines].join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`整车序列号台账-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(url)};
  const rows=data?.rows||[];
  const counts=data?.counts||{};
  const total=rows.length;
  const moved=OWNERS.reduce((sum,item)=>sum+(counts[item.key]||0),0);

  const byWarehouse=useMemo(()=>{
    const map=new Map();
    for(const row of rows){
      if(row.owner_state!=='STOCK')continue;
      const key=row.warehouse_name||'未落仓';
      map.set(key,(map.get(key)||0)+1);
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]);
  },[rows]);

  return <div className="page">
    <header className="prod-head">
      <div>
        <div className="prod-head__eyebrow">VEHICLE ASSET LEDGER</div>
        <h2>整车台账</h2>
        <p className="hint">按 VIN 逐台追踪「这台车算谁的」：实体仓在库、虚拟仓待出库、国际在途、买方持有。状态随销售订单推进自动流转。</p>
      </div>
      <div className="prod-head__actions">
        <label className="field" style={{maxWidth:280}}><input type="search" placeholder="VIN / SKU / 生产单 / 销售单 / 客户" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <button className="btn" onClick={exportAssets} disabled={!rows.length}>导出台账</button><button className="btn" disabled={loading} onClick={load}>{loading?'刷新中…':'刷新'}</button>
      </div>
    </header>

    {error&&<p className="error-text" role="alert">{error}</p>}

    {data?.summary&&<section className="metric-grid legacy-asset-kpi" aria-label="8090 整车序列号总览">
      <article className="metric-card"><span className="metric-label">序列号总数</span><strong>{data.summary.total}<small style={{fontSize:12,marginLeft:4}}>台</small></strong><span className="hint">{data.summary.skuCount} 个 SKU · {data.summary.batchCount} 个批次</span></article>
      <article className="metric-card"><span className="metric-label">公司持有资产</span><strong>{data.summary.heldUnits}<small style={{fontSize:12,marginLeft:4}}>台</small></strong><span className="hint">未转移买方：在库 + 在途 + 虚拟仓</span></article>
      <article className="metric-card"><span className="metric-label">持有资产落仓成本</span><strong>{compact(data.summary.heldLandedCost)}</strong><span className="hint">采购 + 头程运费已沉淀</span></article>
      <article className="metric-card"><span className="metric-label">单台平均落仓成本</span><strong>{compact(data.summary.avgLandedCost)}</strong><span className="hint">全部 {data.summary.total} 台口径</span></article>
    </section>}

    <section className="metric-grid" aria-label="资产归属总览">
      {OWNERS.map(item=><article className="metric-card" key={item.key} style={owner===item.key?{borderColor:'var(--accent)'}:undefined} onClick={()=>setOwner(owner===item.key?'':item.key)} role="button" tabIndex={0} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')setOwner(owner===item.key?'':item.key)}}>
        <span className="metric-label">{item.label}</span>
        <strong>{counts[item.key]||0}</strong>
        <span className="hint">{item.note}</span>
      </article>)}
      <article className="metric-card"><span className="metric-label">VIN 总数</span><strong>{moved}</strong><span className="hint">当前筛选后 {total} 台</span></article>
      <article className="metric-card"><span className="metric-label">实体仓分布</span><strong>{byWarehouse.length}</strong><span className="hint">{byWarehouse[0]?`最多：${byWarehouse[0][0]} ${byWarehouse[0][1]} 台`:'暂无在库车辆'}</span></article>
    </section>

    <section className="card">
      <div className="row" style={{flexWrap:'wrap'}}>
        <button type="button" className={'btn small'+(owner===''?' primary':'')} onClick={()=>setOwner('')}>全部 {total}</button>
        {OWNERS.map(item=><button key={item.key} type="button" className={'btn small'+(owner===item.key?' primary':'')} onClick={()=>setOwner(owner===item.key?'':item.key)}>{item.label} {counts[item.key]||0}</button>)}
        <span style={{flex:1}}/>
        <span className="hint">共 {rows.length} 台</span>
      </div>

      {loading?<p role="status">正在读取资产台账…</p>:(rows.length?<div className="table-scroll"><table className="table">
        <thead><tr><th>VIN</th><th>车型 / SKU</th><th>归属</th><th>资产状态</th><th>所在仓</th><th>生产单</th><th>销售订单 / 客户</th><th>采购成本</th><th>头程运费</th><th>落仓成本</th><th>批次 / 库龄</th><th>出运</th><th>交付</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}>
          <td><strong>{row.vin}</strong><small className="block">{row.motor_number||'无电机号'}</small><small className="block">{row.factory||'—'}</small></td>
          <td>{row.model||'—'}<small className="block"><span className="tag sku">{row.sku_code||'—'}</span></small></td>
          <td><span className={'tag '+(OWNER_MAP[row.owner_state]?.tone||'')}>{OWNER_MAP[row.owner_state]?.label||row.owner_state}</span></td>
          <td>{row.asset_status}</td>
          <td>{row.warehouse_name||'—'}<small className="block">{row.warehouse_code||''}</small></td>
          <td>{row.order_no||'—'}</td>
          <td>{row.sales_order_no||'—'}<small className="block">{row.customer_name||''}{row.consignee_country?` · ${row.consignee_country}`:''}</small></td>
          <td className="num">{money(row.factory_cost_cny,'CNY')}</td>
          <td className="num">{Number(row.freight_cost_cny)>0?money(row.freight_cost_cny,'CNY'):'—'}</td>
          <td className="num"><strong>{money(row.landed_cost_cny,'CNY')}</strong></td>
          <td>{row.batch||'—'}<small className="block">{row.in_stock_days!=null?`登记 ${row.in_stock_days} 天`:'—'}</small></td>
          <td>{day(row.shipped_at)}<small className="block">{row.tracking_no||''}</small></td>
          <td>{day(row.delivered_at)}</td>
        </tr>)}</tbody>
      </table></div>:<p className="hint">还没有车辆资产。在「B2B渠道」把订单推进到「完工交货」并登记 VIN，这里就会出现这台车，并随出运/妥投自动改变归属。</p>)}
    </section>
  </div>;
}
