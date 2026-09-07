"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { formatARS } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthContext";

function whatsappMessage(
  lines: ReturnType<typeof useCart>["detailedLines"],
  total: number,
  customer: { name: string; locality: string; delivery: string; notes: string },
) {
  const detail = lines
    .map((line) => `• ${line.qty}x ${line.product.nombre}\n  ${formatARS(line.unitPrice)} c/u · ${formatARS(line.lineTotal)}`)
    .join("\n\n");
  return [
    "Hola LOOP REPUESTOS 👋",
    "Quiero consultar este pedido:",
    "",
    `Nombre completo o local: ${customer.name.trim()}`,
    `Localidad: ${customer.locality.trim()}`,
    `Entrega: ${customer.delivery}`,
    ...(customer.notes.trim() ? [`Observaciones: ${customer.notes.trim()}`] : []),
    "",
    detail,
    "",
    `Total estimado: ${formatARS(total)}`,
    "",
    "Consultar formas de pago y envío.",
    "Las cantidades disponibles se confirman por WhatsApp según stock.",
  ].join("\n");
}

export function CartBar() {
  const { detailedLines, totalItems, totalPrice, setQty, clear, cartOpen, openCart, closeCart } = useCart();
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const { session, recordWhatsAppOrder } = useAuth();
  const [customerName, setCustomerName] = useState("");
  const [locality, setLocality] = useState("");
  const [delivery, setDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const customerComplete = customerName.trim().length > 0 && locality.trim().length > 0 && delivery.length > 0;
  const message = useMemo(
    () => whatsappMessage(detailedLines, totalPrice, { name: customerName, locality, delivery, notes }),
    [detailedLines, totalPrice, customerName, locality, delivery, notes],
  );

  if (totalItems === 0) return null;

  const sendWhatsApp = async () => {
    if (!number) return;
    if (session) {
      await recordWhatsAppOrder({
        customerName,
        locality,
        delivery: delivery as "Envío" | "Retiro",
        notes,
        total: totalPrice,
        items: detailedLines.map((line) => ({
          sku: line.sku,
          nombre: line.product.nombre,
          cantidad: line.qty,
          precio_unitario: line.unitPrice,
          subtotal: line.lineTotal,
        })),
      });
    }
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
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-borde-fuerte bg-fondo-2 p-4 shadow-2xl">
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

            <div className="mt-4 space-y-3 rounded-xl border border-borde bg-superficie p-3">
              <div>
                <label htmlFor="customer-name" className="mb-1 block text-xs font-bold text-texto">Nombre completo o local</label>
                <input id="customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" className="h-10 w-full rounded-lg border border-borde-fuerte bg-white px-3 text-sm text-texto outline-none transition focus:border-acero" placeholder="Ej.: Juan Pérez / Servicio JP" />
              </div>
              <div>
                <label htmlFor="customer-locality" className="mb-1 block text-xs font-bold text-texto">Localidad</label>
                <input id="customer-locality" value={locality} onChange={(event) => setLocality(event.target.value)} autoComplete="address-level2" className="h-10 w-full rounded-lg border border-borde-fuerte bg-white px-3 text-sm text-texto outline-none transition focus:border-acero" placeholder="Ej.: Rosario" />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-texto">Forma de entrega</legend>
                <div className="grid grid-cols-2 gap-2">
                  {["Envío", "Retiro"].map((option) => (
                    <label key={option} className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${delivery === option ? "border-acero bg-acero-tenue text-texto" : "border-borde-fuerte bg-white text-texto-suave"}`}>
                      <input type="radio" name="delivery" value={option} checked={delivery === option} onChange={(event) => setDelivery(event.target.value)} className="sr-only" />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="customer-notes" className="mb-1 block text-xs font-bold text-texto">Observaciones <span className="font-normal text-titanio">(opcional)</span></label>
                <textarea id="customer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full resize-none rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm text-texto outline-none transition focus:border-acero" placeholder="Color, variante u otra aclaración" />
              </div>
              <p className="text-xs leading-relaxed text-texto-suave">Consultar formas de pago y envío. Las cantidades disponibles se confirman por WhatsApp según stock.</p>
            </div>

            {!number && (
              <p className="mt-4 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs text-texto-suave">
                Falta configurar el número de WhatsApp de LOOP para habilitar el envío.
              </p>
            )}
            <button type="button" onClick={() => void sendWhatsApp()} disabled={!number || !customerComplete} className="mt-3 w-full rounded-xl border border-acero bg-acero-tenue px-4 py-3 text-sm font-extrabold text-texto transition-colors hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-superficie disabled:text-titanio">
              Enviar consulta por WhatsApp
            </button>
            <p className="mt-2 text-center text-[11px] text-titanio">{customerComplete ? "Tu pedido se enviará por WhatsApp para confirmar disponibilidad y coordinar entrega." : "Completá nombre o local, localidad y forma de entrega para continuar."}</p>
          </div>
        </div>
      )}
    </>
  );
}
