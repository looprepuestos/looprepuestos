import { createClient } from "@supabase/supabase-js";
import { mapCatalog, computeRowHash, type CsvRow } from "@/scripts/lib/catalog-mapper";
import { GoogleSheetsReader, sheetsConfigFromEnv } from "@/scripts/lib/sheets-client";

/** Resultado de la RPC apply_sheet_sync (fila de sync_logs). */
export interface SyncLog {
  sync_id: string;
  estado: "ok" | "abortado" | "error";
  motivo: string | null;
  filas_leidas: number;
  skus_vistos: number;
  creados: number;
  actualizados: number;
  sin_cambios: number;
  saltados_invalidos: number;
  despublicados: number;
  duracion_ms: number | null;
  [k: string]: unknown;
}

/** Arma el payload puro para la RPC: separa SKU vistos de filas válidas. */
function buildPayload(rows: CsvRow[], fuente: string, force: boolean) {
  const { records, rejected } = mapCatalog(rows);
  const seen = new Set<string>();
  for (const r of rows) {
    const sku = (r.sku ?? "").trim();
    if (sku) seen.add(sku);
  }
  return {
    p_rows: records.map((r) => ({ ...r, source_row_hash: computeRowHash(r) })),
    p_seen_skus: Array.from(seen),
    p_errors: rejected.map((x) => ({ sku: x.sku, line: x.line, messages: x.messages })),
    p_filas_leidas: rows.length,
    p_fuente: fuente,
    p_min_ratio: 0.7,
    p_force: force,
  };
}

/**
 * Ejecuta el sync Google Sheets (pestaña Catalogo) -> Supabase de forma atómica.
 * Server-only: usa la SERVICE ROLE KEY. Nunca toca stock_reservado/orders.
 */
export async function runSheetSync(opts: { force?: boolean; fuente?: string } = {}): Promise<SyncLog> {
  const cfg = sheetsConfigFromEnv();
  if (!cfg) {
    throw new Error(
      "Falta configuración de Google Sheets (GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).",
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }

  const rows = await new GoogleSheetsReader(cfg).read();
  const payload = buildPayload(rows, opts.fuente ?? "cron", opts.force ?? false);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("apply_sheet_sync", payload);
  if (error) throw new Error("RPC apply_sheet_sync: " + error.message);
  return data as SyncLog;
}
