"use client";

import { useEffect, useState } from "react";
import type { PublicProduct } from "@/types/product";
import { formatARS } from "@/lib/format";
import { useCart } from "@/lib/cart/CartContext";
import { StockBadge } from "./StockBadge";
import { useAuth } from "@/lib/auth/AuthContext";

const SWATCHES: Record<string, string> = {
  black: "#171717", white: "#f8fafc", silver: "#cbd5e1", gold: "#d4af37",
  "space gray": "#5f6368", graphite: "#4b4b4d", blue: "#4f78a8",
  "sierra blue": "#9db7d3", "pacific blue": "#315f78", green: "#63806a",
  "alpine green": "#51645a", "midnight green": "#4e5851", yellow: "#f4d35e",
  purple: "#9b87b7", "deep purple": "#594f63", "(product)red": "#c91829",
  coral: "#ff7f6a", pink: "#e9a6b7", teal: "#3c8d8d", ultramarine: "#4b62aa",
  "black titanium": "#3b3a38", "white titanium": "#e7e3dc",
  "blue titanium": "#4d5d6c", "natural titanium": "#9b9387", "desert titanium": "#b39a7c",
};

export function ProductDetailModal({
  product,
  onClose,
}: {
  product: PublicProduct | null;
  onClose: () => void;
}) {
  const { qtyOf, add, setQty } = useCart();
  const { wholesalePrices, isWholesale, priceFor } = useAuth();
  const [imageOpen, setImageOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (imageOpen) setImageOpen(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [product, onClose, imageOpen]);

  if (!product) return null;

  const selectedVariant = product.variants.find((variant) => variant.sku === selectedSku) ?? null;
  const cartSku = selectedVariant?.sku ?? product.sku;
  const qty = qtyOf(cartSku);
  const hasVariants = product.variants.length > 0;
  const activeImage = selectedVariant?.imagenUrl ?? product.imagenUrl;
  const activeName = selectedVariant?.nombre ?? product.nombre;
  const hasPromo =
    product.precioPromocional !== null &&
    product.precioPromocional < product.precioPublico;
  const publicPrice = hasPromo ? (product.precioPromocional as number) : product.precioPublico;
  const displayedPrice = priceFor(product);
  const hasWholesalePrice = isWholesale && wholesalePrices.has(product.parentSku ?? product.sku);
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
          <StockBadge enStock={product.enStock} />
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
            {activeImage ? (
              <button type="button" onClick={() => setImageOpen(true)} className="group relative block w-full cursor-zoom-in" aria-label={`Ampliar foto de ${activeName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImage}
                  alt={activeName}
                  className="h-auto max-h-[52vh] w-full object-contain"
                />
                <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-bold text-white opacity-90">Ampliar foto</span>
              </button>
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
          {hasVariants && (
            <fieldset className="mt-4">
              <legend className="mb-2 text-sm font-bold text-texto">
                Elegí el color {selectedVariant && <span className="font-medium text-texto-suave">· {selectedVariant.color}</span>}
              </legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const selected = variant.sku === selectedSku;
                  const swatch = SWATCHES[variant.color.toLowerCase()] ?? "#9ca3af";
                  return (
                    <button
                      key={variant.sku}
                      type="button"
                      onClick={() => setSelectedSku(variant.sku)}
                      aria-pressed={selected}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${selected ? "border-acero bg-acero-tenue text-texto ring-2 ring-acero/25" : "border-borde bg-superficie text-texto-suave hover:border-acero/70 hover:text-texto"}`}
                    >
                      <span className="h-4 w-4 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: swatch }} aria-hidden />
                      {variant.color}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-titanio">Se muestran únicamente los colores disponibles.</p>
            </fieldset>
          )}
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
              {hasWholesalePrice && <div className="text-[11px] font-bold uppercase tracking-wide text-green-700">Precio mayorista</div>}
              {(hasWholesalePrice ? displayedPrice < publicPrice : hasPromo) && (
                <div className="text-xs text-titanio line-through">{formatARS(hasWholesalePrice ? publicPrice : product.precioPublico)}</div>
              )}
              <div className={`text-xl font-extrabold ${hasWholesalePrice ? "text-green-700" : "text-texto"}`}>
                {formatARS(displayedPrice)}
              </div>
            </div>

            {qty === 0 ? (
              <button
                type="button"
                onClick={() => add(cartSku, 1)}
                disabled={!product.enStock || (hasVariants && !selectedVariant)}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-acero/60 bg-acero-tenue px-4 text-sm font-bold text-texto hover:border-acero hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-transparent disabled:text-titanio"
              >
                <span className="text-lg leading-none">+</span> {hasVariants && !selectedVariant ? "Elegí un color" : "Agregar"}
              </button>
            ) : (
              <div className="inline-flex h-11 items-center rounded-md border border-borde-fuerte bg-superficie">
                <button type="button" aria-label="Quitar una unidad" onClick={() => setQty(cartSku, qty - 1)} className="h-11 w-11 text-texto-suave hover:text-texto">−</button>
                <span className="w-8 text-center text-sm font-bold tabular-nums text-texto">{qty}</span>
                <button type="button" aria-label="Agregar una unidad" onClick={() => add(cartSku, 1)} className="h-11 w-11 text-acero-fuerte hover:text-texto">+</button>
              </div>
            )}
          </div>
        </div>
      </section>

      {imageOpen && activeImage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-3 sm:p-6" onMouseDown={(event) => { event.stopPropagation(); setImageOpen(false); }} role="dialog" aria-modal="true" aria-label={`Foto ampliada de ${activeName}`}>
          <button type="button" onClick={() => setImageOpen(false)} className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl text-white sm:right-5 sm:top-5" aria-label="Cerrar foto ampliada">×</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeImage} alt={activeName} className="max-h-[94vh] max-w-[96vw] object-contain" onMouseDown={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
