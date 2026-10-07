import assert from 'node:assert/strict';
import { GET } from '../../app/api/admin/sales/route';
const originalFetch=globalThis.fetch;
const keys=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','GOOGLE_SHEETS_SPREADSHEET_ID','GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'] as const;
const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
let role='TECNICO';
let googleReads=0;
try{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://sales-test.supabase.co';
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test-anon-key';
 process.env.GOOGLE_SHEETS_SPREADSHEET_ID='private-loop-sheet';
 delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
 delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
 globalThis.fetch=async(input)=>{
  const url=String(input);
  if(url.includes('/auth/v1/user'))return Response.json({id:'test-admin-id'});
  if(url.includes('/rest/v1/profiles'))return Response.json({id:'test-admin-id',role});
  if(url.includes('sheets.googleapis.com')){googleReads++;return Response.json({values:[['Fecha','Producto','Cant.','Precio Cobrado'],['06/10/2026','A12','2','17.200']]});}
  throw new Error('Unexpected test endpoint');
 };
 const publicResponse=await GET(new Request('https://loop.test/api/admin/sales'));
 assert.equal(publicResponse.status,401);
 const customer=await GET(new Request('https://loop.test/api/admin/sales',{headers:{Authorization:'Bearer test-token','X-Google-Access-Token':'test-google'}}));
 assert.equal(customer.status,401);
 assert.equal(googleReads,0);
 role='ADMIN';
 const noGoogle=await GET(new Request('https://loop.test/api/admin/sales',{headers:{Authorization:'Bearer test-token'}}));
 assert.equal(noGoogle.status,428);
 assert.equal((await noGoogle.json()).needsGoogleConnection,true);
 assert.equal(googleReads,0);
 const authorized=await GET(new Request('https://loop.test/api/admin/sales',{headers:{Authorization:'Bearer test-token','X-Google-Access-Token':'test-google'}}));
 assert.equal(authorized.status,200);
 assert.equal(googleReads,2);
 assert.equal(authorized.headers.get('Cache-Control'),'private, no-store');
 assert.ok(!JSON.stringify(await authorized.json()).includes('test-google'));
 console.log('Sales route: public/customer denied, admin consent required, authorized read private OK');
}finally{
 globalThis.fetch=originalFetch;
 for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
}
