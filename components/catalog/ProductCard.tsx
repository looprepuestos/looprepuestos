"use client";

import { useState } from "react";
import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";
import { StockBadge } from "./StockBadge";
import { ProductDetailModal } from "./ProductDetailModal";
import { useAuth } from "@/lib/auth/AuthContext";

/** Card compacta: tocar el repuesto abre detalle/foto; agregar sigue siendo directo. */
export function ProductCard({ product }: { product: PublicProduct }) {
  const { qtyOf, add, setQty } = useCart();
  const [detailOpen, setDetailOpen] = useState(false);
  const { session, favorites, toggleFavorite } = useAuth();
  const qty = qtyOf(product.sku);
  const hasPromo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;
  const marcoVisible = product.marco !== "N/A" && product.marco.trim() !== "";

  return (
    <>
      <article className="group rounded-xl border border-borde bg-superficie p-3.5 shadow-sm shadow-black/10 transition-all hover:-translate-y-0.5 hover:border-acero/50 hover:shadow-lg hover:shadow-black/20">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StockBadge enStock={product.enStock} />
            {product.esPromocion && (
              <span className="rounded bg-acero-tenue px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-acero-fuerte">Promo</span>
            )}
          </div>
          <button type="button" onClick={() => void toggleFavorite(product.sku)} className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${favorites.has(product.sku) ? "border-red-200 bg-red-50 text-red-500" : "border-borde bg-white text-titanio hover:text-red-500"}`} aria-label={favorites.has(product.sku) ? `Quitar ${product.nombre} de favoritos` : `${session ? "Guardar" : "Ingresar para guardar"} ${product.nombre} en favoritos`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill={favorites.has(product.sku) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="block w-full text-left"
          aria-label={`Ver detalle y foto de ${product.nombre}`}
        >
          <div className="flex min-h-[74px] items-start gap-3">
            {product.imagenUrl && (
              <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-borde bg-white/[0.96] p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.imagenUrl} alt="" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-acero-fuerte">{product.marca} · {product.tipo}</p>
              <h3 className="line-clamp-2 text-sm font-bold leading-snug text-texto">{product.nombre}</h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-texto-suave">
                {[product.modelo, product.calidad, marcoVisible ? product.marco : ""].filter(Boolean).join(" · ")}
                {product.compatibilidad ? ` · Compatible: ${product.compatibilidad}` : ""}
              </p>
            </div>
            <div className="mt-0.5 shrink-0 text-titanio" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </div>
        </button>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-borde/70 pt-3">
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
