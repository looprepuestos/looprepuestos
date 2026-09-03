"use client";

import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";

type Mode = "novedades" | "nuevos" | "promos";

function FeaturedCard({ product, kind }: { product: PublicProduct; kind: "nuevo" | "promo" }) {
  const { add, qtyOf } = useCart();
  const qty = qtyOf(product.sku);
  const promo = product.precioPromocional !== null && product.precioPromocional < product.precioPublico;
  return (
    <article className="commercial-card min-w-[280px] snap-start sm:min-w-[330px]">
      <div className="flex h-full flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className={`commercial-pill ${kind === "promo" ? "commercial-pill-promo" : ""}`}>
            {kind === "promo" ? "Promoción" : "Nuevo ingreso"}
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
  // Mientras los flags todavía no estén cargados desde Sheets, no inventamos
  // productos. La tarjeta informativa mantiene visible el bloque comercial.
  const cards = [
    ...novedades.slice(0, 2).map((p) => ({ p, kind: "nuevo" as const })),
    ...nuevos.filter((p) => !novedades.some((n) => n.sku === p.sku)).slice(0, 2).map((p) => ({ p, kind: "nuevo" as const })),
    ...promos.slice(0, 3).map((p) => ({ p, kind: "promo" as const })),
  ];

  return (
    <section aria-label="Novedades" className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-texto">Novedades</h2>
          <p className="mt-0.5 text-xs text-texto-suave">Ingresos, promociones y avisos de LOOP REPUESTOS.</p>
        </div>
        {cards.length > 0 && <span className="hidden text-[11px] text-titanio sm:block">deslizá para ver más →</span>}
      </div>

      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        <article className="commercial-card commercial-info min-w-[280px] snap-start sm:min-w-[330px]">
          <div className="flex h-full flex-col">
            <span className="commercial-pill w-fit">LOOP REPUESTOS</span>
            <h3 className="mt-3 text-lg font-black leading-tight text-texto">Novedades del catálogo</h3>
            <p className="mt-2 text-xs leading-relaxed text-texto-suave">
              Acá vas a encontrar nuevos ingresos, promociones y avisos importantes. Todo pensado para pedir rápido sin salir del catálogo.
            </p>
            <button type="button" onClick={() => document.getElementById("catalogo-loop")?.scrollIntoView({ behavior: "smooth" })} className="mt-auto rounded-md border border-borde-fuerte px-3 py-2.5 text-xs font-bold text-texto hover:border-acero">
              Ver catálogo →
            </button>
          </div>
        </article>

        {cards.map(({ p, kind }) => <FeaturedCard key={`${kind}-${p.sku}`} product={p} kind={kind} />)}

        {cards.length === 0 && (
          <article className="commercial-card min-w-[280px] snap-start sm:min-w-[330px]">
            <span className="commercial-pill">Próximamente</span>
            <h3 className="mt-3 text-base font-extrabold text-texto">Nuevos ingresos y promociones</h3>
            <p className="mt-2 text-xs leading-relaxed text-texto-suave">Se van a mostrar automáticamente cuando los marques desde tu planilla. No publicamos promociones inventadas.</p>
          </article>
        )}
      </div>

      {(nuevos.length > 0 || promos.length > 0 || novedades.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {novedades.length > 0 && <button onClick={() => onShowAll("novedades")} className="commercial-link">Ver novedades ({novedades.length})</button>}
          {nuevos.length > 0 && <button onClick={() => onShowAll("nuevos")} className="commercial-link">Nuevos ingresos ({nuevos.length})</button>}
          {promos.length > 0 && <button onClick={() => onShowAll("promos")} className="commercial-link">Promociones ({promos.length})</button>}
        </div>
      )}
    </section>
  );
}
