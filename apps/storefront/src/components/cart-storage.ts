import { uuidv7 } from '@/lib/uuid';
export const guestCartKey = 'alsvid-guest-cart-v1';
export const cartChangedEvent = 'alsvid-cart-changed';
const pendingKey = 'alsvid-guest-cart-merge-v1';
export type StoredCartItem={productId:string;sku:string;currency:string;quantity:number};
type Cart={revision:number;items:StoredCartItem[];mergeId?:string};
type Batch={id:string;accountId:string;items:StoredCartItem[]};
function validItem(row:any):row is StoredCartItem{
 return Boolean(row&&typeof row.productId==='string'&&typeof row.sku==='string'&&['EUR','CNY'].includes(row.currency)&&Number.isSafeInteger(row.quantity)&&row.quantity>0&&row.quantity<=100);
}
export function readGuestCart():StoredCartItem[] {
  try {
    const rows = JSON.parse(localStorage.getItem(guestCartKey) || '[]');
    return Array.isArray(rows) ? rows.filter(validItem).slice(0,50) : [];
  } catch { return []; }
}
export function guestCartQuantity(){try{return pending()?0:readGuestCart().reduce((total,item)=>total+item.quantity,0)}catch{return 0}}
export function notifyCartChanged(){window.dispatchEvent(new Event(cartChangedEvent))}
function pending():Batch|null{
 const raw=localStorage.getItem(pendingKey);if(!raw)return null;
 const b=JSON.parse(raw);
 if(typeof b?.id!=='string'||typeof b?.accountId!=='string'||!Array.isArray(b.items)||!b.items.length||!b.items.every(validItem))throw Error('invalid pending cart');
 return b;
}
let queue:Promise<unknown>=Promise.resolve();
// Web Locks coordinates tabs on secure origins; same-tab fallback for older/insecure browsers.
function locked<T>(fn:()=>Promise<T>|T):Promise<T>{
 if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request('alsvid-guest-cart',()=>Promise.resolve(fn()));
 const result=queue.then(fn,fn);queue=result.then(()=>undefined,()=>undefined);return result;
}
export function assertGuestCartEditable(){if(pending())throw Error('pending_merge')}
export function updateGuestCart(fn:(rows:StoredCartItem[])=>StoredCartItem[]){
 return locked(()=>{assertGuestCartEditable();const next=fn(readGuestCart());localStorage.setItem(guestCartKey,JSON.stringify(next));return next});
}
export function clearGuestCartIfUnchanged(items:StoredCartItem[]){
 return locked(()=>{assertGuestCartEditable();if(JSON.stringify(readGuestCart())===JSON.stringify(items))localStorage.removeItem(guestCartKey)});
}
async function requestCart(accountId:string,batch?:Batch):Promise<Cart>{
 const response=await fetch('/api/portal/storefront/cart'+(batch?'':'?expectedAccountId='+encodeURIComponent(accountId)),batch?{method:'PUT',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedAccountId:accountId,mergeId:batch.id,items:batch.items})}:{cache:'no-store'});
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(Error(body?.error||'cart unavailable'),{definitiveRejection:response.status===409&&body?.code==='CART_MERGE_REJECTED'});
 if(!Array.isArray(body?.items)||!body.items.every(validItem)||!Number.isSafeInteger(body.revision)||batch&&body.mergeId!==batch.id)throw Error('invalid cart acknowledgement');
 return body;
}
// A pending batch survives network failures and reloads. A different account must not inherit it.
export function synchronizeOwnerCart(accountId:string):Promise<Cart>{
 return locked(async()=>{
  let batch=pending();
  const guest=readGuestCart();
  if(batch&&batch.accountId!==accountId)throw Error('pending_merge');
  if(!batch&&guest.length){
   batch={id:uuidv7(),accountId,items:guest};
   localStorage.setItem(pendingKey,JSON.stringify(batch));
  }
  if(!batch)return requestCart(accountId);
  let result:Cart;
  try{result=await requestCart(accountId,batch)}catch(e){
   // Only an explicit server rollback acknowledgement unlocks editing. Unknown network outcomes keep the batch.
   if((e as {definitiveRejection?:boolean})?.definitiveRejection&&pending()?.id===batch.id)localStorage.removeItem(pendingKey);
   throw e;
  }
  // Never remove newer local data. In a conflicting legacy tab, retain it and stop.
  if(JSON.stringify(readGuestCart())!==JSON.stringify(batch.items)&&readGuestCart().length)throw Error('pending_merge');
  localStorage.removeItem(guestCartKey);
  localStorage.removeItem(pendingKey);
  return result;
 });
}
