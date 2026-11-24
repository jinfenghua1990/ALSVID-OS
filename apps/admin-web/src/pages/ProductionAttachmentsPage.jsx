import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
export default function ProductionAttachmentsPage({ user, active=true, initialOrderId='' }) {
  const [orders,setOrders]=useState([]),[orderId,setOrderId]=useState(initialOrderId),[files,setFiles]=useState([]);
  const [orderError,setOrderError]=useState(''),[fileError,setFileError]=useState(''),[uploadError,setUploadError]=useState('');
  const [ordersLoading,setOrdersLoading]=useState(true),[filesLoading,setFilesLoading]=useState(false),[busy,setBusy]=useState(false),[refreshKey,setRefreshKey]=useState(0);
  const orderLoadSequence=useRef(0);
  const loadOrders=async()=>{const sequence=++orderLoadSequence.current;setOrdersLoading(true);setOrderError('');try{const rows=await api.productionOrders();if(sequence!==orderLoadSequence.current)return;setOrders(rows);if(rows.length)setOrderId(current=>current||rows[0].id)}catch(e){if(sequence===orderLoadSequence.current)setOrderError(e.message)}finally{if(sequence===orderLoadSequence.current)setOrdersLoading(false)}};
  useEffect(()=>{if(!active){orderLoadSequence.current++;return}loadOrders();return()=>{orderLoadSequence.current++}},[active]);
  useEffect(()=>{let current=true;setFiles([]);setFileError('');if(!active){setFilesLoading(false);return()=>{current=false}}if(!orderId){setFilesLoading(false);return()=>{current=false}}setFilesLoading(true);api.productionAttachments(orderId).then(rows=>{if(current)setFiles(rows)}).catch(e=>{if(current)setFileError(e.message)}).finally(()=>{if(current)setFilesLoading(false)});return()=>{current=false}},[active,orderId,refreshKey]);
  const upload=async e=>{const file=e.target.files?.[0];if(!file||!orderId)return;setBusy(true);setUploadError('');try{await api.uploadProductionAttachment(orderId,file);setRefreshKey(x=>x+1)}catch(err){setUploadError(err.message)}finally{setBusy(false);e.target.value=''}};
  return <div className="card"><h2 /><p className="hint" />
    <div className="field"><label>生产订单</label><select disabled={busy||ordersLoading} value={orderId} onChange={e=>{setFiles([]);setUploadError('');setOrderId(e.target.value)}}><option value="">选择生产订单</option>{orders.map(o=><option key={o.id} value={o.id}>{o.orderNo} · {o.sku}</option>)}</select></div>
    {ordersLoading&&<p className="hint" />}{orderError&&<p className="error-text" role="alert">生产订单读取失败：{orderError} <button type="button" className="btn small" disabled={ordersLoading} onClick={loadOrders}>重新加载</button></p>}{!ordersLoading&&!orderError&&!orders.length&&<p className="hint" />}
    {user.role==='admin'&&orderId&&<div className="field"><label>选择附件</label><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={upload}/></div>}
    {uploadError&&<p className="error-text" role="alert">附件上传失败：{uploadError}</p>}{orderId&&fileError&&<p className="error-text" role="alert">附件列表读取失败：{fileError} <button type="button" className="btn small" disabled={filesLoading} onClick={()=>setRefreshKey(x=>x+1)}>重新加载</button></p>}
    {orderId&&filesLoading&&<p className="hint" />}{orderId&&!filesLoading&&!fileError&&!files.length&&<p className="hint" />}
    {orderId&&files.length>0&&<table className="table"><thead><tr><th>文件名</th><th>分类</th><th>类型</th><th>大小</th><th>上传人</th><th>上传时间</th><th></th></tr></thead><tbody>{files.map(f=><tr key={f.id}><td>{f.fileName}</td><td>{f.category||'其他'}</td><td>{f.contentType}</td><td>{Math.ceil(f.fileSize/1024)} KB</td><td>{f.uploadedBy}</td><td>{new Date(f.createdAt).toLocaleString('zh-CN')}</td><td><a href={`/api/production-orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(f.id)}`}>下载</a></td></tr>)}</tbody></table>}
  </div>;
}
