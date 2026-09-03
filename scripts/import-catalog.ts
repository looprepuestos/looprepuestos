/**
 * LOOP REPUESTOS — Importador de catálogo (Etapa 2).
 *
 * Uso:
 *   npx tsx scripts/import-catalog.ts --file <ruta.csv> [--dry-run] \
 *       [--emit-snapshot <ruta.json>]
 *
 *   --dry-run         Sólo valida y reporta; no escribe en Supabase.
 *   --emit-snapshot   Escribe la proyección PÚBLICA (como catalogo_publico)
 *                     a un JSON local, para previsualizar en la app sin Supabase.
 *
 * Idempotente por SKU: hace UPSERT (on conflict sku). NO toca stock_reservado
 * ni stock_efectivo. La escritura a Supabase usa la SERVICE ROLE KEY (servidor).
 *
 * IMPORTANTE: este importador sólo escribe datos de catálogo y `stock_sheet`
 * (stock físico declarado). El carrito/WhatsApp del MVP NO mueven inventario.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { CSV_COLUMNS, mapCatalog, type CsvRow, type ProductUpsert } from "./lib/catalog-mapper";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(name);

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

const file = arg("--file");
if (!file) fail("Falta --file <ruta.csv>");
const dryRun = hasFlag("--dry-run");
const snapshotPath = arg("--emit-snapshot");

// --- Leer y parsear CSV ---
let rows: CsvRow[];
try {
  const raw = readFileSync(file as string, "utf8");
  rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvRow[];
} catch (e) {
  fail(`No se pudo leer/parsear el CSV: ${(e as Error).message}`);
}

// Verificar encabezados.
const header = rows.length > 0 ? Object.keys(rows[0] as CsvRow) : [];
const faltan = CSV_COLUMNS.filter((c) => !header.includes(c));
if (faltan.length > 0) {
  fail(`Faltan columnas en el CSV: ${faltan.join(", ")}\nEsperado: ${CSV_COLUMNS.join(", ")}`);
}

// --- Validar y mapear ---
const { records, rejected, warnings } = mapCatalog(rows as CsvRow[]);

console.log(`\n=== IMPORTACIÓN LOOP — ${file} ===`);
console.log(`Filas leídas:        ${rows.length}`);
console.log(`Válidas:             ${records.length}`);
console.log(`Rechazadas (error):  ${rejected.length}`);
console.log(`Con advertencia:     ${warnings.length}`);
const aPublicar = records.filter((r) => r.publicado).length;
console.log(`Se publicarán:       ${aPublicar}  (no publicadas: ${records.length - aPublicar})`);

if (rejected.length > 0) {
  console.log(`\n--- RECHAZADAS ---`);
  for (const r of rejected) console.log(`  línea ${r.line} [${r.sku || "sin sku"}]: ${r.messages.join("; ")}`);
}
if (warnings.length > 0) {
  console.log(`\n--- ADVERTENCIAS ---`);
  for (const w of warnings) console.log(`  línea ${w.line} [${w.sku}]: ${w.messages.join("; ")}`);
}

// --- Snapshot público (proyección igual a la vista catalogo_publico) ---
if (snapshotPath) {
  const publicos = records
    .filter((r) => r.publicado)
    .map((r) => ({
      sku: r.sku,
      nombre: r.nombre,
      marca: r.marca,
      modelo: r.modelo,
      tipo: r.tipo,
      calidad: r.calidad,
      marco: r.marco,
      compatibilidad: r.compatibilidad,
      precio_publico: r.precio_publico,
      precio_promocional: r.es_promocion ? r.precio_promocional : null,
      en_stock: r.stock_sheet > 0, // sin reservas en MVP; stock_efectivo = stock_sheet
      es_novedad: r.es_novedad,
      es_nuevo_ingreso: r.es_nuevo_ingreso,
      es_promocion: r.es_promocion,
      es_destacado: r.es_destacado,
      fecha_ingreso: r.fecha_ingreso,
      orden_destacado: r.orden_destacado,
    }));
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(publicos, null, 2));
  console.log(`\n✓ Snapshot público escrito: ${snapshotPath} (${publicos.length} productos)`);
}

if (dryRun) {
  console.log(`\n(dry-run) No se escribió en Supabase.\n`);
  process.exit(rejected.length > 0 ? 2 : 0);
}

// --- Upsert idempotente a Supabase ---
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY para escribir en Supabase.");
}

const supabase = createClient(url as string, serviceKey as string, {
  auth: { persistSession: false },
});

async function upsert(recs: ProductUpsert[]) {
  const chunkSize = 100;
  let done = 0;
  for (let i = 0; i < recs.length; i += chunkSize) {
    const chunk = recs.slice(i, i + chunkSize);
    // onConflict: sku -> idempotente. No se envían stock_reservado/stock_efectivo.
    const { error } = await supabase.from("products").upsert(chunk, { onConflict: "sku" });
    if (error) fail(`Error al hacer upsert (lote ${i / chunkSize + 1}): ${error.message}`);
    done += chunk.length;
    console.log(`  upsert ${done}/${recs.length}`);
  }
}

upsert(records)
  .then(() => {
    console.log(`\n✓ Importación completa: ${records.length} productos upserted (idempotente por SKU).\n`);
    process.exit(0);
  })
  .catch((e) => fail((e as Error).message));
