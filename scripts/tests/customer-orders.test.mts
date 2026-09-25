import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PATCH } from '../../app/api/orders/customer/route';
const userId='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
const version='2026-09-25T14:00:00.000001+00:00';
let calls=0;let rpcError:string|null=null;let lastBody:Record<string,unknown>={};
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url==='/auth/v1/user'){
  if(req.headers.authorization!=='Bearer valid-user'){res.statusCode=401;res.end(JSON.stringify({message:'Invalid JWT'}));return;}
  res.end(JSON.stringify({id:userId,aud:'authenticated',role:'authenticated'}));return;
 }
 assert.equal(req.url,'/rest/v1/rpc/change_customer_order');assert.equal(req.method,'POST');
 assert.equal(req.headers.authorization,'Bearer valid-user');assert.equal(req.headers.apikey,'public-key');
 let raw='';for await(const c of req)raw+=c;lastBody=JSON.parse(raw);calls++;
 if(rpcError){res.statusCode=Number(rpcError.slice(2));res.end(JSON.stringify({code:rpcError,message:'Controlled database error'}));return;}
 res.end(JSON.stringify({id:orderId,estado:lastBody.p_action==='cancel'?'CANCELADO':'NUEVO',total_estimated:20000}));
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw Error('Missing port');
process.env.NEXT_PUBLIC_SUPABASE_URL=`http://127.0.0.1:${address.port}`;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-key';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const request=(body:unknown,token:string|null='valid-user')=>{
 const headers:Record<string,string>={'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
 return PATCH(new Request('http://localhost/api/orders/customer',{method:'PATCH',headers,body:JSON.stringify(body)}));
};
const input={orderId,action:'remove_item',itemIndex:0,expectedUpdatedAt:version};
try{
 assert.equal((await request(input,null)).status,401);assert.equal((await request(input,'invalid')).status,401);
 for(const body of [null,[],{}, {...input,action:['cancel']},{...input,itemIndex:-1},{...input,itemIndex:0.5},{...input,expectedUpdatedAt:'bad-date'}])assert.equal((await request(body)).status,400);
 assert.equal(calls,0);
 assert.equal((await request({...input,total_estimated:1,items:[],user_id:'fake'})).status,200);
 assert.deepEqual(lastBody,{p_order_id:orderId,p_action:'remove_item',p_item_index:0,p_expected_updated_at:version});
 const response=await request({...input,action:'cancel'});assert.equal(response.status,200);assert.equal((await response.json()).order.estado,'CANCELADO');assert.equal(lastBody.p_item_index,null);
 for(const code of ['PT400','PT401','PT404','PT409']){rpcError=code;assert.equal((await request(input)).status,Number(code.slice(2)));}
 console.log('PASS: route authentication, validation, safe RPC parameters, no service key, cancellation and database conflict handling.');
}finally{server.close();server.closeAllConnections();}
