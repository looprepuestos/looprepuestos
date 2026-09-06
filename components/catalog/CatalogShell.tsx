"use client";

import { useMemo, useState } from "react";
import type { FacetOption, PublicProduct } from "@/types/product";
import type { PublicHighlight } from "@/types/database";
import { SearchBar } from "@/components/search/SearchBar";
import { FilterChips } from "@/components/search/FilterChips";
import { ProductCard } from "./ProductCard";
import { EmptyState } from "./EmptyState";
import { CommercialHighlights } from "./CommercialHighlights";

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

type CommercialMode = "destacados" | "novedades" | "nuevos" | "promos" | null;

const CATALOG_CATEGORIES = [
  { id: "samsung", label: "SAMSUNG" },
  { id: "motorola", label: "MOTOROLA" },
  { id: "iphone", label: "IPHONE" },
  { id: "tcl", label: "TCL" },
  { id: "tecno", label: "TECNO" },
  { id: "zte", label: "ZTE" },
  { id: "xiaomi", label: "XIAOMI" },
  { id: "tapa-trasera", label: "TAPA TRASERA" },
  { id: "flex-de-carga", label: "FLEX DE CARGA" },
  { id: "placas-de-carga", label: "PLACAS DE CARGA" },
  { id: "tag-on-baterias", label: "TAG ON BATERÍAS" },
  { id: "baterias", label: "BATERÍAS" },
  { id: "herramienta-insumos", label: "HERRAMIENTA / INSUMOS" },
] as const;

function catalogCategory(product: PublicProduct) {
  const type = normalize(product.tipo);
  const brand = normalize(product.marca);
  const quality = normalize(product.calidad);

  if (quality.includes("tag on")) return "tag-on-baterias";
  if (type === "modulo" && ["samsung", "motorola", "iphone", "tcl", "tecno", "zte", "xiaomi"].includes(brand)) return brand;
  if (type === "tapa") return "tapa-trasera";
  if (type === "flex de carga") return "flex-de-carga";
  if (type === "placa de carga") return "placas-de-carga";
  if (type === "bateria") return "baterias";
  return "herramienta-insumos";
}

function catalogSubcategory(product: PublicProduct, categoryId: string) {
  if (categoryId === "tapa-trasera") {
    return product.modelo.replace(/\s+completa$/i, "").trim() || "Otros modelos";
  }
  if (["flex-de-carga", "placas-de-carga", "tag-on-baterias", "baterias"].includes(categoryId)) {
    return product.marca || "General";
  }
  if (categoryId === "herramienta-insumos") return product.tipo || "Otros";

  const details = [product.calidad, product.marco !== "N/A" ? product.marco : ""].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "Otros";
}

export function CatalogShell({
  products,
  highlights,
  marcas: marcaOpts,
  tipos: tipoOpts,
  modelos: modeloOpts,
  calidades: calidadOpts,
  marcos: marcoOpts,
}: {
  products: ReadonlyArray<PublicProduct>;
  highlights: ReadonlyArray<PublicHighlight>;
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
  const [expandedCategories, setExpandedCategories] = useState<ReadonlySet<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<ReadonlySet<string>>(new Set());

  const toggle = (setter: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>) => (id: string) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleMarca = (id: string) => {
    toggle(setMarcas)(id);
    setTipos(new Set());
    setModelos(new Set());
  };
  const toggleTipo = (id: string) => {
    toggle(setTipos)(id);
    setModelos(new Set());
  };

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
        const haystack = normalize([product.nombre, product.marca, product.modelo, product.tipo, product.calidad, product.marco, product.compatibilidad].join(" "));
        const matchQuery = tokens.length === 0 || tokens.every((token) => haystack.includes(token));
        const matchCommercial = commercialMode === null ||
          (commercialMode === "destacados" && (product.esNovedad || product.esNuevoIngreso || product.esPromocion)) ||
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
          const aModel = normalize(a.modelo) === exact ? 1 : 0;
          const bModel = normalize(b.modelo) === exact ? 1 : 0;
          if (aModel !== bModel) return bModel - aModel;
        }
        if (a.enStock !== b.enStock) return a.enStock ? -1 : 1;
        return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
      });
  }, [products, query, marcas, tipos, modelos, calidades, marcos, commercialMode]);

  const visibleTipos = useMemo(() => {
    if (marcas.size === 0) return tipoOpts;
    const allowed = new Set(products.filter((p) => marcas.has(p.marca)).map((p) => p.tipo));
    return tipoOpts.filter((option) => allowed.has(option.id));
  }, [products, marcas, tipoOpts]);
  const visibleModelos = useMemo(() => {
    const allowed = new Set(products.filter((p) =>
      (marcas.size === 0 || marcas.has(p.marca)) &&
      (tipos.size === 0 || tipos.has(p.tipo))
    ).map((p) => p.modelo));
    return modeloOpts.filter((option) => allowed.has(option.id));
  }, [products, marcas, tipos, modeloOpts]);
  const novedades = products.filter((p) => p.esNovedad);
  const nuevosIngresos = products.filter((p) => p.esNuevoIngreso);
  const promociones = products.filter((p) => p.esPromocion);
  const categoryGroups = useMemo(() => CATALOG_CATEGORIES.map((category) => {
    const categoryProducts = products.filter((product) => catalogCategory(product) === category.id);
    const subcategoryMap = new Map<string, PublicProduct[]>();
    for (const product of categoryProducts) {
      const label = catalogSubcategory(product, category.id);
      const current = subcategoryMap.get(label) ?? [];
      current.push(product);
      subcategoryMap.set(label, current);
    }
    const subcategories = [...subcategoryMap.entries()]
      .map(([label, subProducts]) => ({ id: `${category.id}::${normalize(label)}`, label, products: subProducts }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
    return { ...category, products: categoryProducts, subcategories };
  }), [products]);

  const toggleCategory = (id: string) => setExpandedCategories((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSubcategory = (id: string) => setExpandedSubcategories((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const advancedCount = modelos.size + calidades.size + marcos.size;
  const commercialLabel = commercialMode === "destacados" || commercialMode === "novedades" ? "Novedades" : commercialMode === "nuevos" ? "Nuevos ingresos" : commercialMode === "promos" ? "Ofertas" : "";

  return (
    <div className="space-y-7">
      <SearchBar value={query} onChange={(value) => { setQuery(value); setCommercialMode(null); }} />

      {!isSearching && (
        <CommercialHighlights highlights={highlights} novedades={novedades} nuevos={nuevosIngresos} promos={promociones} onShowAll={setCommercialMode} />
      )}

      <div className="space-y-3 rounded-xl border border-borde bg-white p-3 shadow-sm sm:p-4">
        <FilterChips label="Marcas" options={marcaOpts} active={marcas} onToggle={toggleMarca} />
        <FilterChips label={marcas.size > 0 ? "Categorías para esta marca" : "Categorías"} options={visibleTipos} active={tipos} onToggle={toggleTipo} />

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
                {visibleModelos.length > 1 && <FilterChips label="Modelos" options={visibleModelos} active={modelos} onToggle={toggle(setModelos)} />}
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
          {results.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{results.map((product) => <ProductCard key={product.sku} product={product} />)}</div> : <EmptyState query={query} />}
        </section>
      ) : (
        <section id="catalogo-loop" aria-label="Catálogo">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-0.5">
            <span className="text-sm font-bold text-texto-suave">{products.length} productos</span>
            <div className="flex items-center gap-2 text-xs font-bold">
              <button type="button" onClick={() => {
                setExpandedCategories(new Set(categoryGroups.map((group) => group.id)));
                setExpandedSubcategories(new Set(categoryGroups.flatMap((group) => group.subcategories.map((subcategory) => subcategory.id))));
              }} className="text-texto-suave hover:text-acero-fuerte">Expandir todo</button>
              <span className="text-borde-fuerte">·</span>
              <button type="button" onClick={() => { setExpandedCategories(new Set()); setExpandedSubcategories(new Set()); }} className="text-texto-suave hover:text-acero-fuerte">Colapsar todo</button>
            </div>
          </div>
          <div className="space-y-2.5">
            {categoryGroups.map((group) => {
              const expanded = expandedCategories.has(group.id);
              return (
                <section key={group.id} className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
                  <button type="button" onClick={() => toggleCategory(group.id)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-fondo-2">
                    <span aria-hidden className="h-6 w-1 shrink-0 rounded-full bg-acero" />
                    <span className="min-w-0 flex-1 text-sm font-black uppercase tracking-[0.025em] text-texto">{group.label}</span>
                    <span className="rounded-full bg-fondo-2 px-2.5 py-1 text-xs font-bold tabular-nums text-texto-suave">{group.products.length}</span>
                    <svg aria-hidden className={`h-4 w-4 shrink-0 text-titanio transition-transform ${expanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                  {expanded && (
                    <div className="space-y-2 border-t border-borde bg-fondo-2/60 p-3">
                      {group.subcategories.length === 0 ? (
                        <p className="px-3 py-5 text-center text-sm font-medium text-texto-suave">Próximamente</p>
                      ) : group.subcategories.map((subcategory) => {
                        const subcategoryExpanded = expandedSubcategories.has(subcategory.id);
                        return (
                          <section key={subcategory.id} className="overflow-hidden rounded-lg border border-borde bg-white">
                            <button type="button" onClick={() => toggleSubcategory(subcategory.id)} aria-expanded={subcategoryExpanded} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fondo-2">
                              <span className="min-w-0 flex-1 text-sm font-bold text-texto">
                                {group.id === "tapa-trasera" ? `iPhone ${subcategory.label}` : subcategory.label}
                              </span>
                              <span className="rounded-full bg-fondo-2 px-2.5 py-1 text-xs font-bold tabular-nums text-texto-suave">{subcategory.products.length}</span>
                              <svg aria-hidden className={`h-4 w-4 shrink-0 text-titanio transition-transform ${subcategoryExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                            </button>
                            {subcategoryExpanded && (
                              <div className="grid grid-cols-1 gap-3 border-t border-borde bg-fondo-2/60 p-3 sm:grid-cols-2 xl:grid-cols-3">
                                {subcategory.products.map((product) => <ProductCard key={product.sku} product={product} />)}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
