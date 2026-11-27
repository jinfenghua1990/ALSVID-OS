'use strict';
const ROLES=['company_admin','procurement','finance','store_manager','store_staff','service'];
const permissions={
 legacy:['catalog','order_read','order_write','receive','vin','service','appointment_read','slot_write','appointment_write'],
 company_admin:['catalog','order_read','order_write','receive','vin','service','appointment_read','slot_write','appointment_write','staff'],
 procurement:['catalog','order_read','order_write','receive'],
 finance:['order_read'],
 store_manager:['vin','service','appointment_read','slot_write','appointment_write'],
 store_staff:['appointment_read','appointment_write'],
 service:['vin','service'],
 pending:[]
};
function grants(role){return permissions[role]||[]}
function mayAccessDealerApi(role,method,path){
 if(path==='/api/portal/password'&&method==='POST')return true;
 const read=['GET','HEAD'].includes(method);
 const prefix='/api/portal/dealer/center/';
 if(!path.startsWith(prefix))return role==='legacy';
 const p=path.slice(prefix.length),g=grants(role);
 if(read&&p==='profile')return true;
 if(read&&p==='catalog')return g.includes('catalog');
 if(read&&p==='orders')return g.includes('order_read');
 if(method==='POST'&&p==='orders')return g.includes('order_write');
 if(method==='POST'&&/^orders\/[0-9a-f-]{36}\/respond$/i.test(p))return g.includes('order_write');
 if(method==='POST'&&/^orders\/[0-9a-f-]{36}\/receive$/i.test(p))return g.includes('receive');
 if((read&&p==='vehicles')||((read||method==='POST')&&p==='vehicle-requests'))return g.includes('vin');
 if((read||method==='POST')&&p==='service-requests')return g.includes('service');
 if(read&&p==='store-appointments')return g.includes('appointment_read');
 if(method==='POST'&&(p==='store-appointments/slots'||/^store-appointments\/slots\/[0-9a-f-]{36}\/close$/i.test(p)))return g.includes('slot_write');
 if(method==='POST'&&/^store-appointments\/[0-9a-f-]{36}\/status$/i.test(p))return g.includes('appointment_write');
 if(read&&p==='staff')return g.includes('staff');
 if(method==='POST'&&/^staff\/[0-9a-f-]{36}\/role$/i.test(p))return g.includes('staff');
 return false;
}
module.exports={ROLES,grants,mayAccessDealerApi};
