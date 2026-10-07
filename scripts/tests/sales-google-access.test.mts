import assert from 'node:assert/strict';
import { readSalesWithGoogleToken, SheetsAccessError } from '../../lib/sales/google-sheets';
const originalFetch = globalThis.fetch;
const requests: {url:string;init?:RequestInit}[] = [];
try {
 globalThis.fetch = async (input,init) => {
  requests.push({url:String(input),init});
  return new Response(JSON.stringify({values:[['Fecha','Producto','Cant.','Precio Cobrado'],['06/10/2026','A12','2','17.200']]}),{status:200});
 };
 const rows=await readSalesWithGoogleToken('private-loop-sheet','temporary-test-token');
 assert.equal(rows.length,2);
 assert.equal(rows[0]?.[0]?.Producto,'A12');
 assert.equal(requests.length,2);
 for(const request of requests){
  const url = new URL(request.url);
  assert.equal(url.hostname,'sheets.googleapis.com');
  assert.ok(!request.url.includes('temporary-test-token'));
  assert.equal(request.init?.cache,'no-store');
  assert.equal((request.init?.headers as Record<string,string>).Authorization,'Bearer temporary-test-token');
  assert.ok(url.pathname.includes(encodeURIComponent('Ventas')) || url.pathname.includes(encodeURIComponent('VENTAS INSUMOS')));
 }
 globalThis.fetch = async () => new Response('upstream-private-error-do-not-display',{status:403});
 await assert.rejects(readSalesWithGoogleToken('private-loop-sheet','temporary-test-token'),e => e instanceof SheetsAccessError && e.status===403 && !e.message.includes('upstream-private'));
 console.log('Google sales read: private endpoint, token handling, both tabs, denied access OK');
}finally{globalThis.fetch=originalFetch;}
