import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rows = JSON.parse(readFileSync(new URL("../../data/catalog.snapshot.json", import.meta.url), "utf8"));

assert.equal(rows.length, 314, "el snapshot seguro debe contener 314 productos");
const skus = rows.map((row) => row.sku);
assert.equal(new Set(skus).size, skus.length, "no debe haber SKU duplicados");

const forbidden = ["precio_mayorista", "precio_costo", "costo", "stock", "stock_sheet", "stock_reservado"];
for (const row of rows) {
  assert.ok(row.sku && row.nombre && row.marca && row.modelo && row.tipo, `faltan campos públicos en ${row.sku ?? "SKU desconocido"}`);
  assert.equal(typeof row.en_stock, "boolean", `en_stock debe ser booleano en ${row.sku}`);
  assert.ok(Number.isFinite(row.precio_publico) && row.precio_publico >= 0, `precio público inválido en ${row.sku}`);
  for (const key of forbidden) assert.ok(!(key in row), `${key} no debe aparecer en el snapshot público (${row.sku})`);
}

console.log(`✓ snapshot público: ${rows.length} productos, ${skus.length} SKU únicos, sin campos sensibles`);
