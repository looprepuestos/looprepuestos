"use client";

import { useMemo } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { formatARS } from "@/lib/format";

function whatsappMessage(lines: ReturnType<typeof useCart>["detailedLines"], total: number) {
  const detail = lines
    .map((line) => `• ${line.qty}x ${line.product.nombre}\n  SKU: ${line.product.sku}\n  ${formatARS(line.unitPrice)} c/u · ${formatARS(line.lineTotal)}`)
    .join("\n\n");
  return [
    "Hola LOOP REPUESTOS 👋",
    "Quiero consultar este pedido:",
    "",
    detail,
    "",
    `Total estimado: ${formatARS(total)}`,
    "",
    "¿Me confirmás disponibilidad y forma de entrega?",
  ].join("\n");
}

export function CartBar() {
  const { detailedLines, totalItems, totalPrice, setQty, clear, cartOpen, openCart, closeCart } = useCart();
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const message = useMemo(() => whatsappMessage(detailedLines, totalPrice), [detailedLines, totalPrice]);

  if (totalItems === 0) return null;

  const sendWhatsApp = () => {
    if (!number) return;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-borde-fuerte bg-superficie-2/95 px-3 py-2.5 shadow-lg shadow-black/30 backdrop-blur">
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-bold text-texto">{totalItems} {totalItems === 1 ? "producto" : "productos"}</p>
            <p className="truncate text-xs text-texto-suave">{formatARS(totalPrice)}</p>
          </div>
          <button type="button" onClick={openCart} className="inline-flex items-center gap-1.5 rounded-lg border border-acero/60 bg-acero-tenue px-4 py-2 text-sm font-bold text-texto transition-colors hover:border-acero hover:bg-grafito">
            Ver pedido <span aria-hidden>→</span>
          </button>
        </div>
      </div>

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Tu pedido" onMouseDown={(event) => { if (event.currentTarget === event.target) closeCart(); }}>
          <div className="w-full max-w-lg rounded-2xl border border-borde-fuerte bg-fondo-2 p-4 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-texto">Tu pedido</h2>
                <p className="text-xs text-texto-suave">Revisalo antes de enviarlo. El pedido se confirma con LOOP por WhatsApp.</p>
              </div>
              <button type="button" onClick={closeCart} className="flex h-10 w-10 items-center justify-center rounded-lg border border-borde text-xl text-texto-suave" aria-label="Cerrar">×</button>
            </div>

            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {detailedLines.map((line) => (
                <div key={line.sku} className="rounded-xl border border-borde bg-superficie p-3">
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-texto">{line.product.nombre}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-titanio">{line.sku}</p>
                      <p className="mt-1 text-xs text-texto-suave">{formatARS(line.unitPrice)} c/u</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-texto">{formatARS(line.lineTotal)}</p>
                      <div className="mt-2 inline-flex h-9 items-center rounded-md border border-borde-fuerte bg-fondo-2">
                        <button type="button" onClick={() => setQty(line.sku, line.qty - 1)} className="h-9 w-9 text-texto-suave" aria-label={`Quitar ${line.product.nombre}`}>−</button>
                        <span className="w-7 text-center text-sm font-bold text-texto">{line.qty}</span>
                        <button type="button" onClick={() => setQty(line.sku, line.qty + 1)} className="h-9 w-9 text-acero-fuerte" aria-label={`Agregar ${line.product.nombre}`}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-borde pt-4">
              <div>
                <p className="text-xs text-texto-suave">Total estimado</p>
                <p className="text-xl font-extrabold text-texto">{formatARS(totalPrice)}</p>
              </div>
              <button type="button" onClick={clear} className="text-xs font-semibold text-titanio hover:text-texto">Vaciar</button>
            </div>

            {!number && (
              <p className="mt-4 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs text-texto-suave">
                Falta configurar el número de WhatsApp de LOOP para habilitar el envío.
              </p>
            )}
            <button type="button" onClick={sendWhatsApp} disabled={!number} className="mt-3 w-full rounded-xl border border-acero bg-acero-tenue px-4 py-3 text-sm font-extrabold text-texto transition-colors hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-superficie disabled:text-titanio">
              Enviar consulta por WhatsApp
            </button>
            <p className="mt-2 text-center text-[11px] text-titanio">No descuenta stock ni registra una venta automáticamente.</p>
          </div>
        </div>
      )}
    </>
  );
}
