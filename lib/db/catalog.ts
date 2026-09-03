import { readFileSync } from "node:fs";
import path from "node:path";
import type { FacetOption, PublicProduct } from "@/types/product";
import type { CatalogoPublicoRow } from "@/types/database";
import { createPublicClient } from "./supabase";

/** Mapea una fila pública (snake_case) al modelo de UI (camelCase). */
function mapRow(r: CatalogoPublicoRow): PublicProduct {
  return {
    sku: r.sku,
    nombre: r.nombre,
    marca: r.marca,
    modelo: r.modelo,
    tipo: r.tipo,
    calidad: r.calidad,
    marco: r.marco,
    compatibilidad: r.compatibilidad,
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
