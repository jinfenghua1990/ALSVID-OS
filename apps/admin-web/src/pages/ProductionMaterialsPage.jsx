import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';

export default function ProductionMaterialsPage({user,active=true}){
  const [orders,setOrders]=useState([]),[orderId,setOrderId]=useState(''),[materials,setMaterials]=useState([]),[warehouses,setWarehouses]=useState([]),[selectedWarehouses,setSelectedWarehouses]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[materialsNeedRefresh,setMaterialsNeedRefresh]=useState(true),[ordersReady,setOrdersReady]=useState(false),[ordersLoading,setOrdersLoading]=useState(true);
  const currentOrderId=useRef(orderId),loadVersion=useRef(0),setupLoadVersion=useRef(0);
  currentOrderId.current=orderId;
  const loadMaterials=async(targetOrderId)=>{const version=++loadVersion.current;setMaterialsNeedRefresh(true);const rows=await api.productionMaterials(targetOrderId);if(version===loadVersion.current&&targetOrderId===currentOrderId.current){setMaterials(rows);setSelectedWarehouses(Object.fromEntries(rows.map(m=>[m.id,m.warehouseId||''])));setMaterialsNeedRefresh(false)}};
  const loadSetup=async()=>{const version=++setupLoadVersion.current;setOrdersReady(false);setOrdersLoading(true);setError('');try{const [rows,locations]=await Promise.all([api.productionOrders(),api.warehouses()]);if(version!==setupLoadVersion.current)return;setOrders(rows);if(rows.length)setOrderId(current=>current||rows[0].id);setWarehouses(locations.filter(w=>w.status==='启用'&&['国内仓','海外仓'].includes(w.kind)));setOrdersReady(true)}catch(e){if(version===setupLoadVersion.current)setError(e.message)}finally{if(version===setupLoadVersion.current)setOrdersLoading(false)}};
  useEffect(()=>{
    if(!active){setupLoadVersion.current++;return}
    loadSetup();
    return()=>{setupLoadVersion.current++;loadVersion.current++};
  },[active]);
  useEffect(()=>{
    if(!active){loadVersion.current++;return}
    setMaterials([]);setSelectedWarehouses({});setError('');
    if(!orderId){loadVersion.current++;return;}
    loadMaterials(orderId).catch(e=>{if(orderId===currentOrderId.current)setError(e.message)});
  },[active,orderId]);
  const change=async(m,supplyParty,warehouseId=selectedWarehouses[m.id])=>{
    if(busy||materialsNeedRefresh||!ordersReady)return;
    if(supplyParty==='工厂'&&m.supplyParty==='工厂')return;
    if(supplyParty==='ALSVID'&&!warehouseId){setError('ALSVID 供料前请先选择出料仓');return;}
    setError('');setBusy(true);setMaterialsNeedRefresh(true);
    try{
      try{await api.updateProductionMaterial(orderId,m.id,supplyParty,warehouseId)}catch(e){setError(e.message);try{await loadMaterials(currentOrderId.current)}catch(refreshError){setError(`${e.message}；物料列表读取失败：${refreshError.message}`)}return}
      try{await loadMaterials(currentOrderId.current)}catch(e){setError(`${supplyParty==='工厂'?'供料方':'供料仓'}已保存，但物料列表刷新失败：${e.message}`)}
    }finally{setBusy(false)}
  };
  const selectWarehouse=(m,warehouseId)=>{
    setSelectedWarehouses(current=>({...current,[m.id]:warehouseId}));
    if(m.supplyParty==='ALSVID')change(m,'ALSVID',warehouseId);
  };
  return <div className="card"><h2 /><p className="hint" /><div className="field"><label>生产订单</label><select disabled={busy||!ordersReady} value={orderId} onChange={e=>setOrderId(e.target.value)}><option value="">选择生产订单</option>{orders.map(o=><option key={o.id} value={o.id}>{o.orderNo} · {o.sku}</option>)}</select></div>{ordersLoading&&<p className="hint" />}{error&&<p className="error-text">{error}</p>}{!ordersLoading&&!ordersReady&&<button type="button" className="btn small" onClick={loadSetup}>重新读取生产订单和仓库</button>}{materialsNeedRefresh&&orderId&&<button type="button" className="btn small" disabled={busy} onClick={()=>{setError('');loadMaterials(orderId).catch(e=>setError(e.message))}}>重新读取物料</button>}{busy&&<p className="hint" />}<table className="table"><thead><tr><th>分区</th><th>物料 SKU</th><th>物料名称</th><th>每车数量</th><th>供料方</th><th>ALSVID 出料仓</th><th>预占数量</th></tr></thead><tbody>{materials.map(m=><tr key={m.id}><td>{m.section}</td><td>{m.sku}</td><td>{m.product}</td><td>{m.quantity} {m.unit}</td><td><select disabled={user.role!=='admin'||busy||materialsNeedRefresh||!ordersReady} value={m.supplyParty} onChange={e=>change(m,e.target.value)}><option>工厂</option><option>ALSVID</option></select></td><td><select disabled={user.role!=='admin'||busy||materialsNeedRefresh||!ordersReady} value={selectedWarehouses[m.id]||''} onChange={e=>selectWarehouse(m,e.target.value)}><option value="">选择出料仓</option>{warehouses.map(w=><option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}</select></td><td>{m.supplyParty==='ALSVID'?`${m.reservedQuantity||0} · ${m.reservationStatus||'未预占'}`:'—'}</td></tr>)}</tbody></table></div>;
}
