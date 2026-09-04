/**
 * Pruebas del validador/mapper de catálogo (sin DB).
 * Ejecutar: npx tsx scripts/tests/mapper.test.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { mapCatalog, normalizeText, computeRowHash, type CsvRow } from "../lib/catalog-mapper";

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

// --- Foto: vacía / válida / inválida (no se inventan imágenes) ---
check("foto vacía => imagen_url null (sin advertencia)", () => {
  const r = valida.records.find((x) => x.sku === "DEMO-MOD-A12"); // foto vacía en fixture
  assert.equal(r?.imagen_url, null);
  const w = valida.warnings.find((x) => x.sku === "DEMO-MOD-A12");
  assert.ok(!w || !w.messages.join(" ").includes("foto"));
});
check("foto https válida => se conserva la URL", () => {
  const r = valida.records.find((x) => x.sku === "DEMO-MOD-A10");
  assert.equal(r?.imagen_url, "https://cdn.looprepuestos.com/fotos/mod-a10.jpg");
});
check("foto inválida (no http) => null + advertencia, producto NO rechazado", () => {
  const r = valida.records.find((x) => x.sku === "DEMO-BAT-IPH11");
  assert.ok(r, "el producto con foto inválida debe seguir siendo válido");
  assert.equal(r?.imagen_url, null);
  const w = valida.warnings.find((x) => x.sku === "DEMO-BAT-IPH11");
  assert.ok(w && w.messages.join(" ").toLowerCase().includes("foto"));
  // No aparece entre los rechazados.
  assert.ok(!valida.rejected.some((x) => x.sku === "DEMO-BAT-IPH11"));
});

// --- computeRowHash: estable e indica cambios ---
function rowsFrom(objs: Record<string, string>[]): CsvRow[] {
  return objs as CsvRow[];
}
check("mismo contenido => mismo hash; cambio de precio => hash distinto", () => {
  const base = {
    sku: "H-1", nombre: "Test", marca: "Samsung", modelo: "A10", tipo: "Módulo",
    calidad: "Incell", marco: "Con marco", compatibilidad: "A10", foto: "",
    precio_publico: "1000", precio_mayorista: "800", precio_promocional: "",
    costo: "500", stock: "5", publicado: "true", novedad: "false",
    nuevo_ingreso: "false", promocion: "false", fecha_ingreso: "", orden_destacado: "999",
  };
  const a = mapCatalog(rowsFrom([{ ...base }])).records[0]!;
  const b = mapCatalog(rowsFrom([{ ...base }])).records[0]!;
  const c = mapCatalog(rowsFrom([{ ...base, precio_publico: "1200" }])).records[0]!;
  assert.equal(computeRowHash(a), computeRowHash(b), "misma fila => mismo hash");
  assert.notEqual(computeRowHash(a), computeRowHash(c), "precio distinto => hash distinto");
});
check("hash no depende del orden de propiedades del objeto", () => {
  const r1 = mapCatalog(rowsFrom([{
    sku: "H-2", nombre: "X", marca: "A", modelo: "B", tipo: "Tapa", calidad: "",
    marco: "N/A", compatibilidad: "", foto: "", precio_publico: "10",
    precio_mayorista: "", precio_promocional: "", costo: "", stock: "1",
    publicado: "false", novedad: "false", nuevo_ingreso: "false", promocion: "false",
    fecha_ingreso: "", orden_destacado: "999",
  }])).records[0]!;
  // Reconstruir el registro con claves en otro orden.
  const src = r1 as unknown as Record<string, unknown>;
  const shuffled: Record<string, unknown> = {};
  for (const k of Object.keys(src).reverse()) shuffled[k] = src[k];
  assert.equal(computeRowHash(r1), computeRowHash(shuffled as unknown as typeof r1));
});

console.log(`\n✓ ${ok} pruebas del mapper pasaron\n`);
