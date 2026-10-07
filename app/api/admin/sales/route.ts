import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { GoogleSheetsReader, sheetsConfigFromEnv } from '@/scripts/lib/sheets-client';
import { salesFromRows, summarizeSales } from '@/lib/sales/summary';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 try {
  if (!await requireAdmin(request)) return NextResponse.json({error:'No autorizado.'},{status:401});
  const config=sheetsConfigFromEnv();
  if(!config) return NextResponse.json({error:'Falta configurar la conexión con Google Sheets.'},{status:503});
  const [repuestos,insumos] = await Promise.all([
   new GoogleSheetsReader({...config,range:"'Ventas'!A3:L"}).read(),
   new GoogleSheetsReader({...config,range:"'VENTAS INSUMOS'!A1:I"}).read(),
  ]);
  return NextResponse.json(summarizeSales([...salesFromRows(repuestos),...salesFromRows(insumos)]),{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){console.error('[admin/sales]',error);return NextResponse.json({error:'No se pudieron leer las ventas de la planilla. Intentá actualizar.'},{status:500});}
}
