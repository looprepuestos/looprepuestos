"use client";

import { useEffect } from "react";
import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";
import { StockBadge } from "./StockBadge";

export function ProductDetailModal({
  product,
  onClose,
}: {
  product: PublicProduct | null;
  onClose: () => void;
}) {
  const { qtyOf, add, setQty } = useCart();

  useEffect(() => {
    if (!product) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [product, onClose]);

  if (!product) return null;

  const qty = qtyOf(product.sku);
  const hasPromo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;
  const marcoVisible = product.marco !== "N/A" && product.marco.trim() !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-5" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${product.nombre}`}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-fondo-2 shadow-2xl sm:max-w-xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-borde bg-fondo-2/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <StockBadge enStock={product.enStock} />
            <span className="font-mono text-[11px] text-titanio">{product.sku}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-borde text-texto-suave hover:bg-grafito hover:text-texto"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 overflow-hidden rounded-xl border border-borde bg-superficie">
            {product.imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imagenUrl}
                alt={product.nombre}
                className="h-auto max-h-[52vh] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 px-6 text-center text-titanio">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="8.5" cy="9" r="1.5" />
                  <path d="M21 15l-5-5L5 20" />
                </svg>
                <p className="text-sm font-semibold text-texto-suave">Foto pendiente</p>
                <p className="text-xs">Estamos sumando las fotos de a poco.</p>
              </div>
            )}
          </div>

          <h2 className="text-lg font-bold leading-snug text-texto">{product.nombre}</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {product.marca && (<><dt className="text-titanio">Marca</dt><dd className="text-texto">{product.marca}</dd></>)}
            {product.tipo && (<><dt className="text-titanio">Tipo</dt><dd className="text-texto">{product.tipo}</dd></>)}
            {product.modelo && (<><dt className="text-titanio">Modelo</dt><dd className="text-texto">{product.modelo}</dd></>)}
            {product.calidad && (<><dt className="text-titanio">Calidad</dt><dd className="text-texto">{product.calidad}</dd></>)}
            {marcoVisible && (<><dt className="text-titanio">Marco</dt><dd className="text-texto">{product.marco}</dd></>)}
            {product.compatibilidad && (<><dt className="text-titanio">Compatibilidad</dt><dd className="text-texto">{product.compatibilidad}</dd></>)}
          </dl>

          <div className="mt-5 flex items-end justify-between gap-3 border-t border-borde pt-4">
            <div>
              {hasPromo && (
                <div className="text-xs text-titanio line-through">{formatARS(product.precioPublico)}</div>
              )}
              <div className="text-xl font-extrabold text-texto">
                {formatARS(hasPromo ? (product.precioPromocional as number) : product.precioPublico)}
              </div>
            </div>

            {qty === 0 ? (
              <button
                type="button"
                onClick={() => add(product.sku, 1)}
                disabled={!product.enStock}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-acero/60 bg-acero-tenue px-4 text-sm font-bold text-texto hover:border-acero hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-transparent disabled:text-titanio"
              >
                <span className="text-lg leading-none">+</span> Agregar
              </button>
            ) : (
              <div className="inline-flex h-11 items-center rounded-md border border-borde-fuerte bg-superficie">
                <button type="button" aria-label="Quitar una unidad" onClick={() => setQty(product.sku, qty - 1)} className="h-11 w-11 text-texto-suave hover:text-texto">−</button>
                <span className="w-8 text-center text-sm font-bold tabular-nums text-texto">{qty}</span>
                <button type="button" aria-label="Agregar una unidad" onClick={() => add(product.sku, 1)} className="h-11 w-11 text-acero-fuerte hover:text-texto">+</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
