"use client";

import type { PublicHighlight } from "@/types/database";

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
 * Comunicación comercial manual de la Home.
 * La única fuente es la pestaña "Novedades Web": no mezcla automáticamente
 * productos marcados como novedad, nuevo ingreso u oferta en el catálogo.
 */
export function CommercialHighlights({
  highlights,
  onOpenProduct,
}: {
  highlights: ReadonlyArray<PublicHighlight>;
  onOpenProduct: (sku: string | null) => void;
}) {
  if (highlights.length === 0) return null;

  return (
    <section aria-label="Novedades" className="space-y-3">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {highlights.map((highlight) => (
          <CustomHighlightCard key={highlight.sheet_row} highlight={highlight} onOpenProduct={onOpenProduct} />
        ))}
      </div>
    </section>
  );
}
