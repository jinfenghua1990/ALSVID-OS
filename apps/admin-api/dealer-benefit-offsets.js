'use strict';
// These are non-cash credits. All writes to an order must serialize on its row.
const activeOffsetTotal=(column,param)=>`COALESCE((SELECT sum(x.amount) FROM dealer_benefit_offsets x WHERE x.${column}=${param} AND NOT EXISTS(SELECT 1 FROM dealer_benefit_offset_reversals z WHERE z.offset_id=x.id)),0)`;
async function reverseOrderOffsets(c,orderId,reason,actor){
 const rows=(await c.query(`INSERT INTO dealer_benefit_offset_reversals(offset_id,note,created_by)
 SELECT x.id,$2,$3 FROM dealer_benefit_offsets x WHERE x.order_id=$1
 AND NOT EXISTS(SELECT 1 FROM dealer_benefit_offset_reversals z WHERE z.offset_id=x.id)
 ON CONFLICT(offset_id) DO NOTHING RETURNING offset_id`,[orderId,reason,actor])).rows;
 for(const row of rows)await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[actor,'dealer.benefit.offset.return_reverse','dealer-benefits/'+row.offset_id,JSON.stringify({orderId,reason})]);
 return rows;
}
module.exports={activeOffsetTotal,reverseOrderOffsets};
