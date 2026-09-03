"use client";

import { useState } from "react";
import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";
import { StockBadge } from "./StockBadge";
import { ProductDetailModal } from "./ProductDetailModal";

/** Card compacta: tocar el repuesto abre detalle/foto; agregar sigue siendo directo. */
export function ProductCard({ product }: { product: PublicProduct }) {
  const { qtyOf, add, setQty } = useCart();
  const [detailOpen, setDetailOpen] = useState(false);
  const qty = qtyOf(product.sku);
  const hasPromo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;
  const marcoVisible = product.marco !== "N/A" && product.marco.trim() !== "";

  return (
    <>
      <article className="rounded-[var(--radius-card)] border border-borde bg-superficie p-3 transition-colors hover:border-borde-fuerte">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="block w-full text-left"
          aria-label={`Ver detalle y foto de ${product.nombre}`}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <StockBadge enStock={product.enStock} />
            {product.esPromocion && (
              <span className="rounded bg-acero-tenue px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-acero-fuerte">Promo</span>
            )}
            {product.imagenUrl && (
              <span className="rounded border border-borde px-1.5 py-0.5 text-[10px] font-medium text-texto-suave">Foto</span>
            )}
            <span className="ml-auto truncate font-mono text-[11px] text-titanio">{product.sku}</span>
          </div>

          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-texto">{product.nombre}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-texto-suave">
                {[product.modelo, product.calidad, marcoVisible ? product.marco : ""].filter(Boolean).join(" · ")}
                {product.compatibilidad ? ` · Compatible: ${product.compatibilidad}` : ""}
              </p>
            </div>
            <div className="mt-0.5 shrink-0 text-titanio" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </div>
        </button>

        <div className="mt-2.5 flex items-end justify-between gap-3">
          <button type="button" onClick={() => setDetailOpen(true)} className="text-left leading-tight" aria-label={`Ver foto y precio de ${product.nombre}`}>
            {hasPromo ? (
              <>
                <span className="mr-1.5 text-xs text-titanio line-through">{formatARS(product.precioPublico)}</span>
                <span className="text-base font-bold text-texto">{formatARS(product.precioPromocional as number)}</span>
              </>
            ) : (
              <span className="text-base font-bold text-texto">{formatARS(product.precioPublico)}</span>
            )}
          </button>

          {qty === 0 ? (
            <button
              type="button"
              onClick={() => add(product.sku, 1)}
              disabled={!product.enStock}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-acero/60 bg-acero-tenue px-3 text-sm font-semibold text-texto transition-colors hover:border-acero hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-transparent disabled:text-titanio"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              Agregar
            </button>
          ) : (
            <div className="inline-flex h-9 items-center rounded-md border border-borde-fuerte bg-fondo-2">
              <button type="button" aria-label="Quitar una unidad" onClick={() => setQty(product.sku, qty - 1)} className="flex h-9 w-9 items-center justify-center text-texto-suave transition-colors hover:text-texto">−</button>
              <span className="w-7 text-center text-sm font-bold tabular-nums text-texto">{qty}</span>
              <button type="button" aria-label="Agregar una unidad" onClick={() => add(product.sku, 1)} className="flex h-9 w-9 items-center justify-center text-acero-fuerte transition-colors hover:text-texto">+</button>
            </div>
          )}
        </div>
      </article>

      <ProductDetailModal product={detailOpen ? product : null} onClose={() => setDetailOpen(false)} />
    </>
  );
}
