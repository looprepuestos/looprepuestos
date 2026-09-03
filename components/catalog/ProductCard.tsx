"use client";

import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";
import { StockBadge } from "./StockBadge";

/**
 * Card de producto en formato lista compacta (mobile-first, buena en desktop).
 * Muestra nombre, modelo, calidad, marco (cuando aplica), precio (promo si
 * corresponde), stock público y control de cantidad + agregar al carrito.
 * El técnico puede sumar sin abrir el producto ni abandonar el catálogo.
 */
export function ProductCard({ product }: { product: PublicProduct }) {
  const { qtyOf, add, setQty } = useCart();
  const qty = qtyOf(product.sku);
  const hasPromo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;

  const marcoVisible = product.marco !== "N/A" && product.marco.trim() !== "";

  return (
    <article className="rounded-[var(--radius-card)] border border-borde bg-superficie p-3 transition-colors hover:border-borde-fuerte">
      <div className="mb-1.5 flex items-center gap-2">
        <StockBadge enStock={product.enStock} />
        {product.esPromocion && (
          <span className="rounded bg-acero-tenue px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-acero-fuerte">
            Promo
          </span>
        )}
        <span className="ml-auto truncate font-mono text-[11px] text-titanio">
          {product.sku}
        </span>
      </div>

      <h3 className="truncate text-sm font-semibold text-texto">
        {product.nombre}
      </h3>
      <p className="mt-0.5 line-clamp-2 text-xs text-texto-suave">
        {[product.modelo, product.calidad, marcoVisible ? product.marco : ""].filter(Boolean).join(" · ")}
        {product.compatibilidad ? ` · Compatible: ${product.compatibilidad}` : ""}
      </p>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="leading-tight">
          {hasPromo ? (
            <>
              <span className="mr-1.5 text-xs text-titanio line-through">
                {formatARS(product.precioPublico)}
              </span>
              <span className="text-base font-bold text-texto">
                {formatARS(product.precioPromocional as number)}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-texto">
              {formatARS(product.precioPublico)}
            </span>
          )}
        </div>

        {qty === 0 ? (
          <button
            type="button"
            onClick={() => add(product.sku, 1)}
            disabled={!product.enStock}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-acero/60 bg-acero-tenue px-3 text-sm font-semibold text-texto transition-colors hover:border-acero hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-transparent disabled:text-titanio"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar
          </button>
        ) : (
          <div className="inline-flex h-9 items-center rounded-md border border-borde-fuerte bg-fondo-2">
            <button
              type="button"
              aria-label="Quitar una unidad"
              onClick={() => setQty(product.sku, qty - 1)}
              className="flex h-9 w-9 items-center justify-center text-texto-suave transition-colors hover:text-texto"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </button>
            <span className="w-7 text-center text-sm font-bold tabular-nums text-texto">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Agregar una unidad"
              onClick={() => add(product.sku, 1)}
              className="flex h-9 w-9 items-center justify-center text-acero-fuerte transition-colors hover:text-texto"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
