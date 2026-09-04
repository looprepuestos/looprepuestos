/**
 * LOOP REPUESTOS — Orquestador de sincronización Google Sheets -> Supabase.
 *
 *   Google Sheets  --lectura-->  sync-sheets.ts  --lote validado-->  RPC
 *   apply_sheet_sync (UPSERT + reconciliación + log, TODO en UNA transacción).
 *
 * La web NUNCA consulta el Sheet: LOOP lee `catalogo_publico` (Supabase). Este
 * job es el único puente y corre server-side (SERVICE ROLE).
 *
 * Diseño para test/idempotencia:
 *   - `reader`  (SheetReader) y `applier` (SyncApplier) son INYECTABLES, así el
 *     flujo se prueba sin Google ni Supabase.
 *   - `buildSyncPayload` es PURO: separa `sheet_seen_skus` (todos los SKU
 *     físicamente presentes, incluidas filas inválidas) de las filas VÁLIDAS.
 *     Una fila inválida NO es un SKU ausente -> no se despublica (ajuste #2).
 *   - `source_row_hash` se calcula por fila válida (detección de cambios).
 *
 * Uso:
 *   npx tsx scripts/sync-sheets.ts [--fuente cron|admin|manual] [--force] \
 *       [--min-ratio 0.7] [--dry-run] [--file <csv>]
 *
 *   --dry-run   Lee y valida; imprime el lote pero NO llama a la RPC.
 *   --force     Saltea la guardia anti-desastre (cambios masivos deliberados).
 *               El cron NUNCA debe forzar.
 *   --file      Lee de un CSV local en vez de Google (para pruebas manuales).
 *
 * Estado actual: sin credenciales conectadas. Si no hay config de Google ni
 * --file, aborta con un mensaje claro y NO toca nada.
 */
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import {
  mapCatalog,
  computeRowHash,
  type CsvRow,
  type ProductUpsert,
  type RowIssue,
} from "./lib/catalog-mapper";
import {
  GoogleSheetsReader,
  sheetsConfigFromEnv,
  rowsFromValues,
  type SheetReader,
} from "./lib/sheets-client";

/** Fila válida lista para la RPC: registro mapeado + hash de contenido. */
export type SyncRow = ProductUpsert & { source_row_hash: string };

/** Payload que recibe la RPC apply_sheet_sync. */
export interface SyncPayload {
  p_rows: SyncRow[];
  p_seen_skus: string[];
  p_errors: Array<{ sku: string; line: number; messages: string[] }>;
  p_filas_leidas: number;
  p_fuente: string;
  p_min_ratio: number;
  p_force: boolean;
}

/** Lo que devuelve la RPC (fila de sync_logs). */
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

/** Aplica el lote de forma atómica (implementación: RPC de Postgres). */
export type SyncApplier = (payload: SyncPayload) => Promise<SyncLog>;

/**
 * Construye el payload a partir de las filas crudas del Sheet. PURO (sin red).
 *   - sheet_seen_skus: TODOS los SKU físicamente presentes (con celda sku no
 *     vacía), sean válidos o no. Es el conjunto contra el que la RPC reconcilia
 *     borrados. Una fila inválida sigue "vista" -> su SKU no se despublica.
 *   - filas válidas: se les adjunta source_row_hash.
 *   - errores: filas rechazadas (saltados_invalidos) + advertencias, para el log.
 */
export function buildSyncPayload(
  rows: CsvRow[],
  opts: { fuente?: string; minRatio?: number; force?: boolean } = {},
): SyncPayload {
  const { records, rejected } = mapCatalog(rows);

  // SKU físicamente presentes en la lectura (incluye inválidos con SKU).
  const seen = new Set<string>();
  for (const r of rows) {
    const sku = (r.sku ?? "").trim();
    if (sku !== "") seen.add(sku);
  }

  const syncRows: SyncRow[] = records.map((rec) => ({
    ...rec,
    source_row_hash: computeRowHash(rec),
  }));

  const toIssue = (x: RowIssue) => ({ sku: x.sku, line: x.line, messages: x.messages });

  return {
    p_rows: syncRows,
    p_seen_skus: Array.from(seen),
    // Sólo los RECHAZADOS cuentan como saltados_invalidos en la RPC
    // (jsonb_array_length de p_errors). Las advertencias van aparte en el log
    // de la app, no como "saltados".
    p_errors: rejected.map(toIssue),
    p_filas_leidas: rows.length,
    p_fuente: opts.fuente ?? "manual",
    p_min_ratio: opts.minRatio ?? 0.7,
    p_force: opts.force ?? false,
  };
}

/** Ejecuta la sincronización completa con dependencias inyectadas. */
export async function runSync(params: {
  reader: SheetReader;
  applier: SyncApplier;
  fuente?: string;
  minRatio?: number;
  force?: boolean;
}): Promise<SyncLog> {
  const rows = await params.reader.read();
  const payload = buildSyncPayload(rows, {
    fuente: params.fuente,
    minRatio: params.minRatio,
    force: params.force,
  });
  return params.applier(payload);
}

// =============================================================================
// CLI (sólo se ejecuta cuando se corre el archivo directamente)
// =============================================================================
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(name);
function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Lee un CSV local y lo entrega como un SheetReader (pruebas manuales). */
function csvReader(file: string): SheetReader {
  const raw = readFileSync(file, "utf8");
  // Reutilizamos el mismo pipeline de encabezados que Google (matriz de celdas).
  const matrix = parse(raw, { columns: false, skip_empty_lines: true, bom: true }) as string[][];
  const rows = rowsFromValues(matrix);
  return { read: async () => rows };
}

/** Applier real: llama a la RPC apply_sheet_sync con la SERVICE ROLE KEY. */
function supabaseApplier(): SyncApplier {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  }
  return async (payload) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url as string, serviceKey as string, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc("apply_sheet_sync", {
      p_rows: payload.p_rows,
      p_seen_skus: payload.p_seen_skus,
      p_errors: payload.p_errors,
      p_filas_leidas: payload.p_filas_leidas,
      p_fuente: payload.p_fuente,
      p_min_ratio: payload.p_min_ratio,
      p_force: payload.p_force,
    });
    if (error) throw new Error(`RPC apply_sheet_sync falló: ${error.message}`);
    return data as SyncLog;
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const force = hasFlag("--force");
  const fuente = arg("--fuente") ?? "manual";
  const minRatio = arg("--min-ratio") ? Number(arg("--min-ratio")) : 0.7;
  const file = arg("--file");

  if (force && fuente === "cron") fail("El cron NUNCA debe forzar (--force).");

  // Elegir el lector: --file (CSV local) > Google (env) > error claro.
  let reader: SheetReader;
  if (file) {
    reader = csvReader(file);
  } else {
    const cfg = sheetsConfigFromEnv();
    if (!cfg) {
      fail(
        "Sin credenciales de Google configuradas y sin --file. " +
          "No se toca nada. Configurá GOOGLE_SHEETS_SPREADSHEET_ID / " +
          "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, " +
          "o pasá --file <csv> para una prueba local.",
      );
    }
    reader = new GoogleSheetsReader(cfg);
  }

  const rows = await reader.read();
  const payload = buildSyncPayload(rows, { fuente, minRatio, force });

  console.log(`\n=== SYNC LOOP (${fuente}${force ? " · FORCE" : ""}) ===`);
  console.log(`Filas leídas:        ${payload.p_filas_leidas}`);
  console.log(`SKU vistos:          ${payload.p_seen_skus.length}`);
  console.log(`Filas válidas:       ${payload.p_rows.length}`);
  console.log(`Rechazadas (skip):   ${payload.p_errors.length}`);
  if (payload.p_errors.length > 0) {
    for (const e of payload.p_errors) {
      console.log(`  línea ${e.line} [${e.sku || "sin sku"}]: ${e.messages.join("; ")}`);
    }
  }

  if (dryRun) {
    console.log(`\n(dry-run) No se llamó a la RPC. Lote listo para apply_sheet_sync.\n`);
    process.exit(payload.p_errors.length > 0 ? 2 : 0);
  }

  const applier = supabaseApplier();
  const log = await applier(payload);

  console.log(`\n--- Resultado (sync_logs ${log.sync_id}) ---`);
  console.log(`Estado:        ${log.estado}${log.motivo ? ` (${log.motivo})` : ""}`);
  console.log(`Creados:       ${log.creados}`);
  console.log(`Actualizados:  ${log.actualizados}`);
  console.log(`Sin cambios:   ${log.sin_cambios}`);
  console.log(`Despublicados: ${log.despublicados}`);
  console.log(`Duración:      ${log.duracion_ms} ms\n`);
  process.exit(log.estado === "ok" ? 0 : 1);
}

// Ejecutar main() sólo si es el módulo de entrada.
const isMain = (() => {
  try {
    return process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (isMain) {
  main().catch((e) => fail((e as Error).message));
}
