import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { GoogleSheetsReader, sheetsConfigFromEnv } from '@/scripts/lib/sheets-client';
import { salesFromRows, summarizeSales } from '@/lib/sales/summary';
import { readSalesWithGoogleToken, SheetsAccessError } from '@/lib/sales/google-sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store' };
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}
export async function GET(request: Request) {
  try {
    // Authorize before inspecting Google credentials or reading any sales.
    if (!await requireAdmin(request)) return reply({ error: 'No autorizado.' }, 401);
    const config = sheetsConfigFromEnv();
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) return reply({ error: 'Falta identificar la planilla de ventas en el servidor.' }, 503);
    const googleToken = request.headers.get('x-google-access-token');
    if (!config && !googleToken) {
      return reply({ needsGoogleConnection: true, error: 'Conectá tu cuenta Google para leer las ventas de tu planilla privada.' }, 428);
    }
    const [repuestos, insumos] = config
      ? await Promise.all([
          new GoogleSheetsReader({ ...config, range: "'Ventas'!A3:L" }).read(),
          new GoogleSheetsReader({ ...config, range: "'VENTAS INSUMOS'!A1:I" }).read(),
        ])
      : await readSalesWithGoogleToken(spreadsheetId, googleToken!);
    return reply(summarizeSales([...salesFromRows(repuestos), ...salesFromRows(insumos)]));
  } catch (error) {
    if (error instanceof SheetsAccessError) {
      if (error.serviceDisabled) return reply({ error: 'Google Sheets API está deshabilitada en el proyecto Google del inicio de sesión. Hay que habilitarla en Google Cloud para leer las ventas.' }, 503);
      if (error.status === 401 || error.status === 403) {
        return reply({ needsGoogleConnection: true, error: 'Volvé a conectar Google y autorizá la lectura de Sheets con la cuenta que tiene acceso a tu planilla.' }, 428);
      }
      if (error.status === 404) return reply({ error: 'La cuenta Google no encuentra la planilla de Loop. Usá la cuenta que tiene acceso a ella.' }, 404);
    }
    // Log no credentials, user data, request headers, or upstream response body.
    console.error('[admin/sales] no se pudieron leer las ventas');
    return reply({ error: 'No se pudieron leer las ventas de la planilla. Intentá actualizar.' }, 500);
  }
}
