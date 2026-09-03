"use client";

import { useMemo, useState } from "react";
import type { FacetOption, PublicProduct } from "@/types/product";
import { SearchBar } from "@/components/search/SearchBar";
import { FilterChips } from "@/components/search/FilterChips";
import { ProductCard } from "./ProductCard";
import { EmptyState } from "./EmptyState";
import { SectionRow } from "./SectionRow";

function normalize(input: string) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const SEARCH_ALIASES: Array<[RegExp, string]> = [
  [/\bpantalla\b|\bdisplay\b/g, "modulo"],
  [/\bbateria\b|\bpila\b/g, "bateria"],
  [/\bpin de carga\b|\bcentro de carga\b|\bpin\b/g, "placa de carga"],
  [/\bflex carga\b/g, "flex de carga"],
  [/\bsam\b/g, "samsung"],
  [/\bmoto\b/g, "motorola"],
  [/\bapple\b/g, "iphone"],
  [/\bredmi\b|\bpoco\b/g, "xiaomi"],
];

function normalizedQuery(query: string) {
  let q = normalize(query);
  for (const [pattern, replacement] of SEARCH_ALIASES) q = q.replace(pattern, replacement);
  return q.replace(/\s+/g, " ").trim();
}

type CommercialMode = "novedades" | "nuevos" | "promos" | null;

export function CatalogShell({
  products,
  marcas: marcaOpts,
  tipos: tipoOpts,
  modelos: modeloOpts,
  calidades: calidadOpts,
  marcos: marcoOpts,
}: {
  products: ReadonlyArray<PublicProduct>;
  marcas: FacetOption[];
  tipos: FacetOption[];
  modelos: FacetOption[];
  calidades: FacetOption[];
  marcos: FacetOption[];
}) {
  const [query, setQuery] = useState("");
  const [marcas, setMarcas] = useState<ReadonlySet<string>>(new Set());
  const [tipos, setTipos] = useState<ReadonlySet<string>>(new Set());
  const [modelos, setModelos] = useState<ReadonlySet<string>>(new Set());
  const [calidades, setCalidades] = useState<ReadonlySet<string>>(new Set());
  const [marcos, setMarcos] = useState<ReadonlySet<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [commercialMode, setCommercialMode] = useState<CommercialMode>(null);

  const toggle = (setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>) => (id: string) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const activeFilters = marcas.size + tipos.size + modelos.size + calidades.size + marcos.size;
  const isSearching = query.trim().length > 0 || activeFilters > 0 || commercialMode !== null;

  const clearAll = () => {
    setQuery("");
    setMarcas(new Set());
    setTipos(new Set());
    setModelos(new Set());
    setCalidades(new Set());
    setMarcos(new Set());
    setCommercialMode(null);
  };

  const results = useMemo(() => {
    const q = normalizedQuery(query);
    const tokens = q.split(" ").filter(Boolean);
    const exact = normalize(query);

    return products
      .filter((product) => {
        const haystack = normalize([product.sku, product.nombre, product.marca, product.modelo, product.tipo, product.calidad, product.marco, product.compatibilidad].join(" "));
        const matchQuery = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
        const matchCommercial = commercialMode === null ||
          (commercialMode === "novedades" && product.esNovedad) ||
          (commercialMode === "nuevos" && product.esNuevoIngreso) ||
          (commercialMode === "promos" && product.esPromocion);
        return matchQuery && matchCommercial &&
          (marcas.size === 0 || marcas.has(product.marca)) &&
          (tipos.size === 0 || tipos.has(product.tipo)) &&
          (modelos.size === 0 || modelos.has(product.modelo)) &&
          (calidades.size === 0 || calidades.has(product.calidad)) &&
          (marcos.size === 0 || marcos.has(product.marco));
      })
      .sort((a, b) => {
        if (exact) {
          const aSku = normalize(a.sku) === exact ? 1 : 0;
          const bSku = normalize(b.sku) === exact ? 1 : 0;
          if (aSku !== bSku) return bSku - aSku;
          const aModel = normalize(a.modelo) === exact ? 1 : 0;
          const bModel = normalize(b.modelo) === exact ? 1 : 0;
          if (aModel !== bModel) return bModel - aModel;
        }
        if (a.enStock !== b.enStock) return a.enStock ? -1 : 1;
        return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
      });
  }, [products, query, marcas, tipos, modelos, calidades, marcos, commercialMode]);

  const novedades = products.filter((p) => p.esNovedad);
  const nuevosIngresos = products.filter((p) => p.esNuevoIngreso);
  const promociones = products.filter((p) => p.esPromocion);
  const advancedCount = modelos.size + calidades.size + marcos.size;
  const commercialLabel = commercialMode === "novedades" ? "Novedades" : commercialMode === "nuevos" ? "Nuevos ingresos" : commercialMode === "promos" ? "Promociones" : "";

  return (
    <div className="space-y-6">
      <SearchBar value={query} onChange={(value) => { setQuery(value); setCommercialMode(null); }} />

      <div className="space-y-3 rounded-xl border border-borde bg-fondo-2/40 p-3">
        <FilterChips label="Marcas" options={marcaOpts} active={marcas} onToggle={toggle(setMarcas)} />
        <FilterChips label="Tipos" options={tipoOpts} active={tipos} onToggle={toggle(setTipos)} />

        {(modeloOpts.length > 1 || calidadOpts.length > 1 || marcoOpts.length > 1) && (
          <div className="border-t border-borde/70 pt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((value) => !value)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-semibold text-texto-suave transition-colors hover:text-texto"
            >
              <span>Más filtros{advancedCount > 0 ? ` · ${advancedCount} activos` : ""}</span>
              <span aria-hidden>{advancedOpen ? "−" : "+"}</span>
            </button>
            {advancedOpen && (
              <div className="mt-3 space-y-3">
                {modeloOpts.length > 1 && <FilterChips label="Modelos" options={modeloOpts} active={modelos} onToggle={toggle(setModelos)} />}
                {calidadOpts.length > 1 && <FilterChips label="Calidad" options={calidadOpts} active={calidades} onToggle={toggle(setCalidades)} />}
                {marcoOpts.length > 1 && <FilterChips label="Marco" options={marcoOpts} active={marcos} onToggle={toggle(setMarcos)} />}
              </div>
            )}
          </div>
        )}
      </div>

      {isSearching ? (
        <section aria-label="Resultados">
          <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
            <div>
              {commercialLabel && <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-acero-fuerte">{commercialLabel}</p>}
              <p className="text-xs font-medium text-texto-suave">{results.length} {results.length === 1 ? "resultado" : "resultados"}{activeFilters > 0 ? ` · ${activeFilters} filtros` : ""}</p>
            </div>
            <button type="button" onClick={clearAll} className="text-xs font-semibold text-acero-fuerte">Limpiar</button>
          </div>
          {results.length > 0 ? <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{results.map((product) => <ProductCard key={product.sku} product={product} />)}</div> : <EmptyState query={query} />}
        </section>
      ) : (
        <div className="space-y-8">
          <SectionRow title="Novedades" products={novedades} onShowAll={() => setCommercialMode("novedades")} />
          <SectionRow title="Nuevos ingresos" products={nuevosIngresos} onShowAll={() => setCommercialMode("nuevos")} />
          <SectionRow title="Promociones" products={promociones} onShowAll={() => setCommercialMode("promos")} />
          {(novedades.length > 0 || nuevosIngresos.length > 0 || promociones.length > 0) && <div className="hairline" />}
          <section aria-label="Catálogo">
            <div className="mb-2.5 flex items-center justify-between px-0.5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-texto"><span aria-hidden className="h-3 w-0.5 rounded bg-acero" />Catálogo</h2>
              <span className="text-xs font-medium text-texto-suave">{products.length} productos</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <ProductCard key={product.sku} product={product} />)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
