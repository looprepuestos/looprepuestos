import { rowsFromValues } from '@/scripts/lib/sheets-client';

export class SheetsAccessError extends Error {
  constructor(public readonly status: number, public readonly serviceDisabled = false) {
    super('No se pudo leer la planilla privada.');
  }
}

/** Only the two sales tabs are read; no Google token is logged or returned. */
export async function readSalesWithGoogleToken(spreadsheetId: string, token: string) {
  async function read(range: string) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: { details?: { reason?: string }[]; errors?: { reason?: string }[] } } | null;
      const disabled = failure?.error?.details?.some(d => d.reason === 'SERVICE_DISABLED')
        || failure?.error?.errors?.some(d => d.reason === 'accessNotConfigured');
      throw new SheetsAccessError(response.status, Boolean(disabled));
    }
    const payload = await response.json() as { values?: string[][] };
    return rowsFromValues(payload.values ?? []);
  }
  return Promise.all([read("'Ventas'!A3:L"), read("'VENTAS INSUMOS'!A1:I")]);
}
