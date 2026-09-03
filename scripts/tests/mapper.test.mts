/**
 * Pruebas del validador/mapper de catálogo (sin DB).
 * Ejecutar: npx tsx scripts/tests/mapper.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { mapCatalog, normalizeText, type CsvRow } from "../lib/catalog-mapper";

function load(path: string): CsvRow[] {
  return parse(readFileSync(path, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as CsvRow[];
}

let ok = 0;
function check(name: string, fn: () => void) {
  fn();
  ok++;
  console.log(`  ✓ ${name}`);
}

console.log("=== Tests del mapper ===");

// --- Muestra válida ---
const valida = mapCatalog(load("scripts/fixtures/muestra-ejemplo.csv"));
check("12 filas válidas, 0 rechazadas", () => {
  assert.equal(valida.records.length, 12);
  assert.equal(valida.rejected.length, 0);
});
check("producto incompleto (falta calidad) queda NO publicado", () => {
  const pub = valida.records.filter((r) => r.publicado).length;
  assert.equal(pub, 11);
  const a20 = valida.records.find((r) => r.sku === "DEMO-MOD-A20");
  assert.ok(a20 && a20.publicado === false);
  const w = valida.warnings.find((x) => x.sku === "DEMO-MOD-A20");
  assert.ok(w && w.messages.join(" ").includes("calidad"));
});
check("no se inventan datos: calidad faltante queda vacía", () => {
  const a20 = valida.records.find((r) => r.sku === "DEMO-MOD-A20");
  assert.equal(a20?.calidad, "");
});
check("promo válida conserva precio_promocional; sin promo queda null", () => {
  const promo = valida.records.find((r) => r.sku === "DEMO-MOD-A12");
  assert.ok(promo?.es_promocion === true && promo.precio_promocional === 26900);
  const noPromo = valida.records.find((r) => r.sku === "DEMO-MOD-A10");
  assert.equal(noPromo?.precio_promocional, null);
});
check("search_text normalizado (sin acentos, minúsculas)", () => {
  const iph = valida.records.find((r) => r.sku === "DEMO-MOD-IPH11");
  assert.ok(iph && iph.search_text.includes("modulo iphone 11"));
  assert.ok(!/[A-ZÁÉÍÓÚ]/.test(iph!.search_text));
});

// --- Muestra inválida ---
const invalida = mapCatalog(load("scripts/fixtures/invalidos-ejemplo.csv"));
check("6 filas rechazadas por errores duros", () => {
  assert.equal(invalida.rejected.length, 6);
});
check("detecta cada tipo de error", () => {
  const all = invalida.rejected.map((r) => r.messages.join(" | ")).join(" || ");
  for (const frag of [
    "SKU vacío",
    "SKU duplicado",
    "precio_publico inválido",
    "stock negativo",
    "publicado inválido",
    "fecha_ingreso inválida",
  ]) {
    assert.ok(all.includes(frag), `esperaba error: ${frag}`);
  }
});
check("promo sin precio => advertencia + promo desactivada (no rechazo)", () => {
  const r = invalida.records.find((x) => x.sku === "DEMO-PROMO-SINPRECIO");
  assert.ok(r && r.es_promocion === false && r.precio_promocional === null);
  const w = invalida.warnings.find((x) => x.sku === "DEMO-PROMO-SINPRECIO");
  assert.ok(w);
});

// --- normalizeText ---
check("normalizeText quita acentos y colapsa espacios", () => {
  assert.equal(normalizeText("  Módulo   iPhone  "), "modulo iphone");
});

console.log(`\n✓ ${ok} pruebas del mapper pasaron\n`);
