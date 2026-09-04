/**
 * LOOP REPUESTOS — Mapper/validador de catálogo (Etapa 2).
 *
 * Convierte filas del CSV maestro (formato en docs/IMPORTADOR.md) en registros
 * listos para upsert idempotente por SKU en `products`. Es PURO (sin DB), para
 * poder testearlo sin Supabase y reutilizar la normalización de `search_text`.
 *
 * Reglas:
 *  - Errores DUROS -> la fila se RECHAZA (no se importa).
 *  - "Incompleto para publicar" o inconsistencias -> se importa pero con
 *    `publicado = false` (nunca se inventan datos faltantes) + advertencia.
 *  - Idempotencia por SKU la garantiza el upsert (ver import-catalog.ts).
 */
import { createHash } from "node:crypto";

/** Columnas esperadas en el CSV (encabezados exactos). */
export const CSV_COLUMNS = [
  "sku",
  "nombre",
  "marca",
  "modelo",
  "tipo",
  "calidad",
  "marco",
  "compatibilidad",
  "foto",
  "precio_publico",
  "precio_mayorista",
  "precio_promocional",
  "costo",
  "stock",
  "publicado",
  "novedad",
  "nuevo_ingreso",
  "promocion",
  "fecha_ingreso",
  "orden_destacado",
] as const;

export type CsvRow = Record<string, string>;

/** Registro final listo para upsert en `products`. */
export interface ProductUpsert {
  sku: string;
  nombre: string;
  marca: string;
  modelo: string;
  tipo: string;
  calidad: string;
  marco: string;
  compatibilidad: string;
  imagen_url: string | null;
  precio_publico: number;
  precio_mayorista: number | null;
  precio_promocional: number | null;
  precio_costo: number | null;
  stock_sheet: number;
  publicado: boolean;
  es_novedad: boolean;
  es_nuevo_ingreso: boolean;
  es_promocion: boolean;
  es_destacado: boolean;
  fecha_ingreso: string | null;
  orden_destacado: number;
  search_text: string;
}

export interface RowIssue {
  line: number;
  sku: string;
  messages: string[];
}

export interface MapResult {
  records: ProductUpsert[];
  rejected: RowIssue[];
  warnings: RowIssue[];
}

/** Normaliza texto para búsqueda: minúsculas, sin acentos, espacios colapsados. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchText(r: {
  sku: string;
  nombre: string;
  marca: string;
  modelo: string;
  tipo: string;
  calidad: string;
  compatibilidad: string;
}): string {
  return normalizeText(
    [r.sku, r.nombre, r.marca, r.modelo, r.tipo, r.calidad, r.compatibilidad]
      .filter(Boolean)
      .join(" "),
  );
}

const TRUE_SET = new Set(["true", "1", "si", "sí", "x", "verdadero", "yes"]);
const FALSE_SET = new Set(["false", "0", "no", "", "falso"]);

/** Parseo estricto de booleano. Devuelve null si el valor no se reconoce. */
function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (TRUE_SET.has(v)) return true;
  if (FALSE_SET.has(v)) return false;
  return null;
}

/**
 * Parseo estricto de número: sin separadores de miles, punto como decimal.
 * Acepta vacío -> null. Rechaza formatos ambiguos (ej. "48.900" con miles).
 */
function parseNumber(raw: string): { ok: true; value: number | null } | { ok: false } {
  const v = raw.trim().replace(/^\$\s?/, "");
  if (v === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(v)) return { ok: false };
  return { ok: true, value: Number(v) };
}

function parseIntStrict(raw: string): { ok: true; value: number | null } | { ok: false } {
  const v = raw.trim();
  if (v === "") return { ok: true, value: null };
  if (!/^-?\d+$/.test(v)) return { ok: false };
  return { ok: true, value: Number(v) };
}

/**
 * Foto pública opcional. La URL se sincroniza desde el Sheet; NO se inventan
 * imágenes. Reglas:
 *   - vacío            -> null (producto sin foto: la UI muestra placeholder).
 *   - http(s) válida   -> se conserva la URL.
 *   - cualquier otra   -> null + advertencia (nunca se rechaza el producto ni
 *                         se muestra una imagen rota).
 */
function parseFoto(raw: string): { url: string | null; warn?: string } {
  const v = raw.trim();
  if (v === "") return { url: null };
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return { url: null, warn: "foto con URL inválida -> se importa sin imagen" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { url: null, warn: "foto con protocolo no http(s) -> se importa sin imagen" };
  }
  return { url: v };
}

function isIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(raw + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/**
 * Valida y mapea filas del CSV. `startLine` es el número de la primera fila de
 * datos (para reportes legibles; típicamente 2 con encabezado en la línea 1).
 */
export function mapCatalog(rows: CsvRow[], startLine = 2): MapResult {
  const records: ProductUpsert[] = [];
  const rejected: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const seenSku = new Map<string, number>();

  rows.forEach((row, i) => {
    const line = startLine + i;
    const errors: string[] = [];
    const warns: string[] = [];

    const sku = (row.sku ?? "").trim();
    const nombre = (row.nombre ?? "").trim();

    // --- SKU (identificador estable y único) ---
    if (sku === "") errors.push("SKU vacío");
    else if (seenSku.has(sku)) {
      errors.push(`SKU duplicado (también en línea ${seenSku.get(sku)})`);
    }

    if (nombre === "") errors.push("nombre obligatorio faltante");

    // --- Precios ---
    const precioPub = parseNumber(row.precio_publico ?? "");
    if (!precioPub.ok) errors.push("precio_publico inválido");
    else if (precioPub.value === null) errors.push("precio_publico obligatorio faltante");
    else if (precioPub.value < 0) errors.push("precio_publico negativo");

    const precioMay = parseNumber(row.precio_mayorista ?? "");
    if (!precioMay.ok) errors.push("precio_mayorista inválido");
    else if (precioMay.value !== null && precioMay.value < 0) errors.push("precio_mayorista negativo");

    const precioPromo = parseNumber(row.precio_promocional ?? "");
    if (!precioPromo.ok) errors.push("precio_promocional inválido");
    else if (precioPromo.value !== null && precioPromo.value < 0) errors.push("precio_promocional negativo");

    const costo = parseNumber(row.costo ?? "");
    if (!costo.ok) errors.push("costo inválido");
    else if (costo.value !== null && costo.value < 0) errors.push("costo negativo");

    // --- Stock (entero >= 0) ---
    const stock = parseIntStrict(row.stock ?? "");
    if (!stock.ok) errors.push("stock inválido (debe ser entero)");
    else if (stock.value !== null && stock.value < 0) errors.push("stock negativo");

    // --- Booleanos ---
    const bPub = parseBool(row.publicado ?? "");
    const bNov = parseBool(row.novedad ?? "");
    const bNuevo = parseBool(row.nuevo_ingreso ?? "");
    const bPromo = parseBool(row.promocion ?? "");
    if (bPub === null) errors.push("publicado inválido (usar true/false)");
    if (bNov === null) errors.push("novedad inválida (usar true/false)");
    if (bNuevo === null) errors.push("nuevo_ingreso inválido (usar true/false)");
    if (bPromo === null) errors.push("promocion inválida (usar true/false)");

    // --- Fecha / orden ---
    const fechaRaw = (row.fecha_ingreso ?? "").trim();
    let fecha: string | null = null;
    if (fechaRaw !== "") {
      if (!isIsoDate(fechaRaw)) errors.push("fecha_ingreso inválida (usar YYYY-MM-DD)");
      else fecha = fechaRaw;
    }
    const orden = parseIntStrict(row.orden_destacado ?? "");
    if (!orden.ok) errors.push("orden_destacado inválido (entero)");
    else if (orden.value !== null && orden.value < 0) errors.push("orden_destacado negativo");

    if (errors.length > 0) {
      rejected.push({ line, sku, messages: errors });
      return;
    }
    if (sku !== "") seenSku.set(sku, line);

    // A esta altura los parseos son válidos.
    const marca = (row.marca ?? "").trim();
    const modelo = (row.modelo ?? "").trim();
    const tipo = (row.tipo ?? "").trim();
    const calidad = (row.calidad ?? "").trim();
    const marco = (row.marco ?? "").trim();
    const compatibilidad = (row.compatibilidad ?? "").trim();
    const foto = parseFoto(row.foto ?? "");
    if (foto.warn) warns.push(foto.warn);

    let publicado = bPub as boolean;
    let esPromo = bPromo as boolean;
    let precioPromocionalFinal = precioPromo.ok ? precioPromo.value : null;
    const precioPublicoVal = precioPub.ok && precioPub.value !== null ? precioPub.value : 0;

    // --- Completitud para publicar (NO se inventan datos) ---
    const faltantesBase = [
      ["marca", marca],
      ["modelo", modelo],
      ["tipo", tipo],
    ];
    // La calidad es obligatoria para módulos/pantallas, pero no aplica de forma
    // universal a baterías, placas, tapas, flex o insumos. No bloquear esos
    // productos reales por un campo que conceptualmente puede ser N/A.
    const requiereCalidad = normalizeText(tipo) === "modulo";
    const faltantes = [...faltantesBase, ...(requiereCalidad ? [["calidad", calidad]] : [])]
      .filter(([, v]) => v === "")
      .map(([k]) => k);
    if (publicado && faltantes.length > 0) {
      publicado = false;
      warns.push(`incompleto para publicar (falta: ${faltantes.join(", ")}) -> se importa NO publicado`);
    }

    // --- Consistencia de promoción ---
    if (esPromo && precioPromocionalFinal === null) {
      esPromo = false;
      warns.push("promocion=true sin precio_promocional -> promo desactivada");
    } else if (esPromo && precioPromocionalFinal !== null && precioPromocionalFinal >= precioPublicoVal) {
      esPromo = false;
      precioPromocionalFinal = null;
      warns.push("precio_promocional >= precio_publico -> promo desactivada");
    }
    if (!esPromo) precioPromocionalFinal = null; // no guardar promo si no aplica

    const record: ProductUpsert = {
      sku,
      nombre,
      marca,
      modelo,
      tipo,
      calidad,
      marco,
      compatibilidad,
      imagen_url: foto.url,
      precio_publico: precioPublicoVal,
      precio_mayorista: precioMay.ok ? precioMay.value : null,
      precio_promocional: precioPromocionalFinal,
      precio_costo: costo.ok ? costo.value : null,
      stock_sheet: stock.ok && stock.value !== null ? stock.value : 0,
      publicado,
      es_novedad: bNov as boolean,
      es_nuevo_ingreso: bNuevo as boolean,
      es_promocion: esPromo,
      es_destacado: false,
      fecha_ingreso: fecha,
      orden_destacado: orden.ok && orden.value !== null ? orden.value : 999,
      search_text: buildSearchText({ sku, nombre, marca, modelo, tipo, calidad, compatibilidad }),
    };
    records.push(record);
    if (warns.length > 0) warnings.push({ line, sku, messages: warns });
  });

  return { records, rejected, warnings };
}

/**
 * Hash estable del contenido de una fila ya mapeada. Se guarda en
 * `products.source_row_hash` y permite detección de cambios idempotente:
 * misma fila -> mismo hash -> "sin cambios"; cualquier cambio de contenido
 * -> hash distinto -> "actualizado". Se serializa con las claves ORDENADAS
 * para que el hash no dependa del orden de propiedades.
 */
export function computeRowHash(record: ProductUpsert): string {
  const source = record as unknown as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    ordered[key] = source[key];
  }
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}
