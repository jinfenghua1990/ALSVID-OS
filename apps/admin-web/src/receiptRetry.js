export function readPending(pending,id){return pending?.[id]||null;}
export function prepareReceipt(pending,id,payload){return readPending(pending,id)||payload;}
export function clearPending(pending,id,receiptId){const old=readPending(pending,id);if(!old||old.receiptId!==receiptId)return pending;const next={...pending};delete next[id];return next;}
export function isDefiniteRejection(error){return error?.status===400&&error.message==='签收数量超过本批剩余发运数量';}
