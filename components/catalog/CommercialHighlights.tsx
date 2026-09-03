"use client";

import type { ReactNode } from "react";
import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";

type Mode = "novedades" | "nuevos" | "promos";
type Kind = "novedad" | "nuevo" | "promo";

const KIND_LABEL: Record<Kind, string> = {
  novedad: "Novedad",
  nuevo: "Nuevo ingreso",
  promo: "Promoción",
};

function FeaturedCard({ product, kind }: { product: PublicProduct; kind: Kind }) {
  const { add, qtyOf } = useCart();
  const qty = qtyOf(product.sku);
  const promo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;
  return (
    <article className="commercial-card min-w-[280px] snap-start sm:min-w-[300px]">
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className={`commercial-pill ${kind === "promo" ? "commercial-pill-promo" : ""}`}>
            {KIND_LABEL[kind]}
          </span>
          <span className="font-mono text-[10px] text-titanio">{product.sku}</span>
        </div>
        <h3 className="text-base font-extrabold leading-tight text-texto">{product.nombre}</h3>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-texto-suave">
          {[product.modelo, product.calidad, product.marco !== "N/A" ? product.marco : "", product.compatibilidad ? `Compatible: ${product.compatibilidad}` : ""].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-auto pt-5">
          <div className="mb-3 flex items-end gap-2">
            {promo && <span className="text-xs text-titanio line-through">{formatARS(product.precioPublico)}</span>}
            <span className="text-xl font-black text-texto">{formatARS(promo ? product.precioPromocional! : product.precioPublico)}</span>
          </div>
          <button
            type="button"
            disabled={!product.enStock}
            onClick={() => add(product.sku, 1)}
            className="w-full rounded-md border border-acero/70 bg-acero-tenue px-3 py-2.5 text-xs font-extrabold text-texto transition hover:border-acero-fuerte hover:bg-grafito disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!product.enStock ? "Sin stock" : qty > 0 ? `Agregar otra · ${qty} en pedido` : "Agregar al pedido"}
          </button>
        </div>
      </div>
    </article>
  );
}

function Seccion({
  titulo,
  subtitulo,
  count,
  mode,
  onShowAll,
  children,
}: {
  titulo: string;
  subtitulo: string;
  count: number;
  mode: Mode;
  onShowAll: (mode: Mode) => void;
  children: ReactNode;
}) {
  return (
    <section aria-label={titulo} className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-texto">
            <span aria-hidden className="h-3 w-0.5 rounded bg-acero" />
            {titulo}
          </h2>
          <p className="mt-0.5 text-xs text-texto-suave">{subtitulo}</p>
        </div>
        {count > 0 && (
          <button type="button" onClick={() => onShowAll(mode)} className="commercial-link shrink-0">
            Ver todos ({count})
          </button>
        )}
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {children}
      </div>
    </section>
  );
}

/**
 * Secciones comerciales de la Home (estilo BH-Tech, estética LOOP), en el orden:
 * Novedades → Nuevos ingresos → Promociones. Ubicar ARRIBA del buscador/filtros.
 * No inventa datos: cada sección de productos deriva de flags de la planilla.
 * Novedades incluye además una card de comunicación (aviso LOOP), así el bloque
 * nunca queda vacío mientras todavía no haya productos marcados.
 */
export function CommercialHighlights({
  novedades,
  nuevos,
  promos,
  onShowAll,
}: {
  novedades: ReadonlyArray<PublicProduct>;
  nuevos: ReadonlyArray<PublicProduct>;
  promos: ReadonlyArray<PublicProduct>;
  onShowAll: (mode: Mode) => void;
}) {
  return (
    <div className="space-y-7">
      {/* NOVEDADES: card de comunicación + productos marcados como novedad */}
      <Seccion titulo="Novedades" subtitulo="Ingresos y avisos de LOOP REPUESTOS." count={novedades.length} mode="novedades" onShowAll={onShowAll}>
        <article className="commercial-card commercial-info min-w-[280px] snap-start sm:min-w-[300px]">
          <div className="flex h-full flex-col">
            <span className="commercial-pill w-fit">LOOP REPUESTOS</span>
            <h3 className="mt-3 text-lg font-black leading-tight text-texto">Repuestos e insumos, al toque</h3>
            <p className="mt-2 text-xs leading-relaxed text-texto-suave">
              Buscá por modelo, tipo o SKU y armá tu pedido sin salir del catálogo. Acá vas a ver ingresos y promos cuando estén disponibles.
            </p>
            <button
              type="button"
              onClick={() => document.getElementById("catalogo-loop")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-auto rounded-md border border-borde-fuerte px-3 py-2.5 text-xs font-bold text-texto hover:border-acero"
            >
              Ver catálogo →
            </button>
          </div>
        </article>
        {novedades.slice(0, 10).map((p) => (
          <FeaturedCard key={`nov-${p.sku}`} product={p} kind="novedad" />
        ))}
      </Seccion>

      {/* NUEVOS INGRESOS */}
      {nuevos.length > 0 && (
        <Seccion titulo="Nuevos ingresos" subtitulo="Lo último que entró al catálogo." count={nuevos.length} mode="nuevos" onShowAll={onShowAll}>
          {nuevos.slice(0, 10).map((p) => (
            <FeaturedCard key={`nue-${p.sku}`} product={p} kind="nuevo" />
          ))}
        </Seccion>
      )}

      {/* PROMOCIONES */}
      {promos.length > 0 && (
        <Seccion titulo="Promociones" subtitulo="Precios especiales por tiempo limitado." count={promos.length} mode="promos" onShowAll={onShowAll}>
          {promos.slice(0, 10).map((p) => (
            <FeaturedCard key={`pro-${p.sku}`} product={p} kind="promo" />
          ))}
        </Seccion>
      )}
    </div>
  );
}
