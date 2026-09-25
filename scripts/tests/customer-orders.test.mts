import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PATCH } from '../../app/api/orders/customer/route';

const userId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';
const version = '2026-09-25T14:00:00.000001+00:00';
const fixture = () => ({id:orderId,user_id:userId,estado:'NUEVO',hidden_by_admin:false,updated_at:version,notes:'Retira por el local',total_estimated:26000,items:[{sku:'A51',nombre:'Placa A51',cantidad:1,precio_unitario:6000,subtotal:6000},{sku:'BAT13',nombre:'Batería 13',cantidad:1,precio_unitario:20000,subtotal:20000}]});
let order = fixture(); let writes=0; let race=false;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url!, 'http://localhost');
  res.setHeader('Content-Type','application/json');
  if(url.pathname==='/auth/v1/user') {
    if(req.headers.authorization !== 'Bearer valid-user') {res.statusCode=401;res.end(JSON.stringify({message:'Invalid JWT'}));return;}
    res.end(JSON.stringify({id:userId,aud:'authenticated',role:'authenticated',email:'test@example.invalid'}));return;
  }
  assert.equal(url.pathname,'/rest/v1/whatsapp_orders');
  assert.equal(url.searchParams.get('id'),`eq.${orderId}`);
  assert.equal(url.searchParams.get('user_id'),`eq.${userId}`);
  assert.equal(url.searchParams.get('hidden_by_admin'),'eq.false');
  if(req.method==='GET') {
    assert.equal(req.headers.authorization,'Bearer valid-user');
    res.end(JSON.stringify(order.user_id===userId&&!order.hidden_by_admin?[order]:[]));return;
  }
  assert.equal(req.method,'PATCH');assert.equal(req.headers.apikey,'server-only-key');
  assert.equal(url.searchParams.get('estado'),'eq.NUEVO');
  assert.equal(url.searchParams.get('updated_at'),`eq.${version}`);
  let raw='';for await (const c of req) raw+=c;
  writes++;
  if(race){res.end('[]');return;}
  order={...order,...JSON.parse(raw),updated_at:'2026-09-25T14:01:00+00:00'};
  res.end(JSON.stringify([order]));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${address.port}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='server-only-key';
const request=async(body:unknown,token:string|null='valid-user')=>{
 const headers:Record<string,string>={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
 return PATCH(new Request('http://localhost/api/orders/customer',{method:'PATCH',headers,body:JSON.stringify(body)}));
};
const input=(action='remove_item')=>({orderId,action,itemIndex:0,expectedUpdatedAt:version});
try {
 assert.equal((await request(input(),null)).status,401);
 assert.equal((await request(input(),'invalid-user')).status,401);
 for(const body of [null,[],{}, {...input(),action:['cancel']},{...input(),itemIndex:-1},{...input(),itemIndex:0.5}])assert.equal((await request(body)).status,400);
 order.user_id='33333333-3333-4333-8333-333333333333';assert.equal((await request(input())).status,404);
 order=fixture();order.hidden_by_admin=true;assert.equal((await request(input())).status,404);
 for(const state of ['CONFIRMADO','PREPARADO','ENTREGADO','CANCELADO']){order=fixture();order.estado=state;assert.equal((await request(input())).status,409);}
 order=fixture();assert.equal((await request({...input(),expectedUpdatedAt:'old'})).status,409);
 assert.equal((await request({...input(),itemIndex:2})).status,409);assert.equal(writes,0);
 let response=await request({...input(),total_estimated:1,items:[],user_id:'fake'});assert.equal(response.status,200);
 assert.equal(order.total_estimated,20000);assert.equal(order.items.length,1);assert.equal(order.items[0]?.sku,'BAT13');assert.match(order.notes,/Cliente quitó 1× Placa A51/);assert.match(order.notes,/Retira por el local/);
 // Repeated/stale click cannot remove the next item accidentally.
 assert.equal((await request(input())).status,409);
 order=fixture();order.items=order.items.slice(0,1);order.total_estimated=6000;
 assert.equal((await request(input())).status,200);assert.equal(order.estado,'CANCELADO');assert.equal(order.items.length,1);assert.equal(order.total_estimated,6000);
 order=fixture();assert.equal((await request(input('cancel'))).status,200);assert.equal(order.estado,'CANCELADO');assert.equal(order.items.length,2);assert.equal(order.total_estimated,26000);
 order=fixture();race=true;assert.equal((await request(input())).status,409);assert.equal(order.items.length,2);
 console.log('PASS: authentication, ownership, hidden orders, status gates, validation, totals, audit trail, cancellation and concurrent/stale edits.');
} finally {server.close();server.closeAllConnections();}
