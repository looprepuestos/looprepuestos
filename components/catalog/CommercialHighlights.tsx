"use client";

import type { PublicProduct } from "@/types/product";
import type { PublicHighlight } from "@/types/database";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";

type Mode = "destacados" | "novedades" | "nuevos" | "promos";
type Kind = "nuevo" | "promo";

const KIND_LABEL: Record<Kind, string> = {
  nuevo: "Nuevo ingreso",
  promo: "Oferta",
};

function FeaturedCard({ product, kind }: { product: PublicProduct; kind: Kind }) {
  const { add, qtyOf } = useCart();
  const qty = qtyOf(product.sku);
  const promo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;
  return (
    <article className="commercial-card min-w-[270px] snap-start sm:min-w-[290px]">
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center gap-2">
          <span className={`commercial-pill ${kind === "promo" ? "commercial-pill-promo" : ""}`}>
            {KIND_LABEL[kind]}
          </span>
        </div>
        {product.imagenUrl && (
          <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-borde bg-white/[0.96] p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={product.imagenUrl} alt="" className="h-full w-full object-contain" />
          </div>
        )}
        <h3 className="line-clamp-2 text-base font-extrabold leading-tight text-texto">{product.nombre}</h3>
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-texto-suave">
          {[product.modelo, product.calidad, product.marco !== "N/A" ? product.marco : "", product.compatibilidad ? `Compatible: ${product.compatibilidad}` : ""].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-auto pt-4">
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

function CustomHighlightCard({
  highlight,
  onOpenProduct,
}: {
  highlight: PublicHighlight;
  onOpenProduct: (sku: string | null) => void;
}) {
  return (
    <article className="commercial-card commercial-info min-w-[270px] flex-col snap-start sm:min-w-[300px]">
      <span className={`commercial-pill ${highlight.tipo === "Oferta" ? "commercial-pill-promo" : ""}`}>{highlight.tipo}</span>
      <h3 className="mt-4 text-lg font-black leading-tight text-texto">{highlight.titulo}</h3>
      {highlight.texto && <p className="mt-2 text-sm leading-relaxed text-texto-suave">{highlight.texto}</p>}
      <button type="button" onClick={() => onOpenProduct(highlight.sku_producto)} className="mt-auto w-full rounded-lg border border-acero px-3 py-2.5 text-sm font-extrabold text-acero-fuerte hover:bg-acero-tenue">
        {highlight.texto_boton || "Ver productos"} →
      </button>
    </article>
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
  highlights,
  novedades,
  nuevos,
  promos,
  onShowAll,
  onOpenProduct,
}: {
  highlights: ReadonlyArray<PublicHighlight>;
  novedades: ReadonlyArray<PublicProduct>;
  nuevos: ReadonlyArray<PublicProduct>;
  promos: ReadonlyArray<PublicProduct>;
  onShowAll: (mode: Mode) => void;
  onOpenProduct: (sku: string | null) => void;
}) {
  const destacados = [
    ...promos.map((product) => ({ product, kind: "promo" as const })),
    ...nuevos.filter((p) => !promos.some((promo) => promo.sku === p.sku)).map((product) => ({ product, kind: "nuevo" as const })),
    ...novedades
      .filter((p) => !promos.some((promo) => promo.sku === p.sku) && !nuevos.some((nuevo) => nuevo.sku === p.sku))
      .map((product) => ({ product, kind: "nuevo" as const })),
  ].slice(0, 10);
  const total = new Set([...novedades, ...nuevos, ...promos].map((p) => p.sku)).size;

  return (
    <section aria-label="Novedades" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-lg font-black tracking-tight text-texto">Novedades</h2>
        {total > 0 && (
          <button type="button" onClick={() => onShowAll("destacados")} className="text-xs font-bold text-titanio hover:text-acero-fuerte">
            Ver todo →
          </button>
        )}
      </div>
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {highlights.length > 0 ? highlights.map((highlight) => (
          <CustomHighlightCard key={highlight.sheet_row} highlight={highlight} onOpenProduct={onOpenProduct} />
        )) : (
          <article className="commercial-card commercial-info min-w-[270px] flex-col snap-start sm:min-w-[300px]">
            <span className="commercial-pill">Nuevo ingreso</span>
            <h3 className="mt-4 text-lg font-black text-texto">LOOP REPUESTOS</h3>
            <p className="mt-2 text-sm leading-relaxed text-texto-suave">Acá vas a encontrar los últimos ingresos y ofertas disponibles.</p>
            <button type="button" onClick={() => document.getElementById("catalogo-loop")?.scrollIntoView({ behavior: "smooth" })} className="mt-auto w-full rounded-lg border border-acero px-3 py-2.5 text-sm font-extrabold text-acero-fuerte hover:bg-acero-tenue">
              Ver catálogo →
            </button>
          </article>
        )}
        {destacados.map(({ product, kind }) => (
          <FeaturedCard key={`${kind}-${product.sku}`} product={product} kind={kind} />
        ))}
      </div>
    </section>
  );
}
