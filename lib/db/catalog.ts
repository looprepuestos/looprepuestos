import { readFileSync } from "node:fs";
import path from "node:path";
import type { FacetOption, PublicProduct } from "@/types/product";
import type { CatalogoPublicoRow } from "@/types/database";
import { createPublicClient } from "./supabase";

/** Oculta marcas internas de proveedor sin modificar la fuente operativa. */
function publicText(value: string): string {
  return value
    .replace(/\s*\/\s*KP\b/gi, "")
    .replace(/\bKP\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/\s*·\s*$/, "")
    .trim();
}

/** Mapea una fila pública (snake_case) al modelo de UI (camelCase). */
function mapRow(r: CatalogoPublicoRow): PublicProduct {
  return {
    sku: r.sku,
    nombre: publicText(r.nombre),
    marca: publicText(r.marca),
    modelo: publicText(r.modelo),
    tipo: publicText(r.tipo),
    calidad: publicText(r.calidad),
    marco: publicText(r.marco),
    compatibilidad: publicText(r.compatibilidad),
    imagenUrl: r.imagen_url ?? null,
    precioPublico: r.precio_publico,
    precioPromocional: r.precio_promocional,
    enStock: r.en_stock,
    esNovedad: r.es_novedad,
    esNuevoIngreso: r.es_nuevo_ingreso,
    esPromocion: r.es_promocion,
    esDestacado: r.es_destacado,
    fechaIngreso: r.fecha_ingreso ?? "",
    ordenDestacado: r.orden_destacado,
  };
}

/**
 * Catálogo público. Fuente:
 *  1) Supabase (vista `catalogo_publico`) si hay env configurado.
 *  2) Snapshot local `data/catalog.snapshot.json` (preview sin Supabase).
 *  3) Vacío.
 * Nunca expone precio_mayorista, costo ni stock numérico (la vista ya los excluye).
 */
export async function getPublicCatalog(): Promise<PublicProduct[]> {
  const client = createPublicClient();
  if (client) {
    const { data, error } = await client
      .from("catalogo_publico")
      .select("*")
      .order("orden_destacado", { ascending: true })
      .order("nombre", { ascending: true });
    if (!error && data) return (data as CatalogoPublicoRow[]).map(mapRow);
  }

  try {
    const p = path.join(process.cwd(), "data", "catalog.snapshot.json");
    const rows = JSON.parse(readFileSync(p, "utf8")) as CatalogoPublicoRow[];
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

const TIPO_ORDER = ["Módulo", "Batería", "Placa de carga", "Tapa", "Flex de carga", "Pegamento", "Insumo"];
const TIPO_LABEL: Record<string, string> = {
  Módulo: "Módulos",
  Batería: "Baterías",
  "Placa de carga": "Placas de carga",
  Tapa: "Tapas",
  "Flex de carga": "Flex",
  Pegamento: "Insumos",
  Insumo: "Insumos",
};

/** Deriva las facetas (marcas / tipos) a partir de los productos presentes. */
export function deriveFacets(products: ReadonlyArray<PublicProduct>): {
  marcas: FacetOption[];
  tipos: FacetOption[];
  modelos: FacetOption[];
  calidades: FacetOption[];
  marcos: FacetOption[];
} {
  const marcas = [...new Set(products.map((p) => p.marca).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  const tipos = [...new Set(products.map((p) => p.tipo).filter(Boolean))].sort((a, b) => {
    const ia = TIPO_ORDER.indexOf(a);
    const ib = TIPO_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const modelos = [...new Set(products.map((p) => p.modelo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const calidades = [...new Set(products.map((p) => p.calidad).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const marcos = [...new Set(products.map((p) => p.marco).filter((v) => v && v !== "N/A"))].sort((a, b) => a.localeCompare(b));
  return {
    marcas: marcas.map((m) => ({ id: m, label: m })),
    tipos: tipos.map((t) => ({ id: t, label: TIPO_LABEL[t] ?? t })),
    modelos: modelos.map((m) => ({ id: m, label: m })),
    calidades: calidades.map((c) => ({ id: c, label: c })),
    marcos: marcos.map((m) => ({ id: m, label: m })),
  };
}
