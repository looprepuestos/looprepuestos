"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { formatARS } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthContext";

function whatsappMessage(
  lines: ReturnType<typeof useCart>["detailedLines"],
  total: number,
  customer: { name: string; locality: string; delivery: string; payment: string; notes: string },
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
    `Forma de pago: ${customer.payment}`,
    ...(customer.notes.trim() ? [`Observaciones: ${customer.notes.trim()}`] : []),
    "",
    detail,
    "",
    `Total estimado: ${formatARS(total)}`,
    "",
    "El pago se coordina después de confirmar el stock.",
    "Las cantidades disponibles se confirman por WhatsApp según stock.",
  ].join("\n");
}

export function CartBar() {
  const { detailedLines, totalItems, totalPrice, setQty, clear, cartOpen, openCart, closeCart } = useCart();
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  const { session, profile, request, isWholesale, recordWhatsAppOrder } = useAuth();
  const [customerName, setCustomerName] = useState("");
  const [locality, setLocality] = useState("");
  const [delivery, setDelivery] = useState("");
  const [payment, setPayment] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const registeredCustomerName = useMemo(() => {
    const fullName = request?.nombre.trim() || profile?.nombre?.trim() || "";
    const serviceLocal = request?.service_local.trim() || "";

    if (serviceLocal && fullName && serviceLocal.toLocaleLowerCase() !== fullName.toLocaleLowerCase()) {
      return `${serviceLocal} (${fullName})`;
    }

    return serviceLocal || fullName;
  }, [profile?.nombre, request?.nombre, request?.service_local]);
  const registeredLocality = request?.localidad.trim() || "";
  const useRegisteredCustomer = isWholesale && registeredCustomerName.length > 0 && registeredLocality.length > 0;
  const effectiveCustomerName = useRegisteredCustomer ? registeredCustomerName : customerName.trim();
  const effectiveLocality = useRegisteredCustomer ? registeredLocality : locality.trim();
  const customerComplete = effectiveCustomerName.length > 0 && effectiveLocality.length > 0 && delivery.length > 0 && payment.length > 0;
  const message = useMemo(
    () => whatsappMessage(detailedLines, totalPrice, { name: effectiveCustomerName, locality: effectiveLocality, delivery, payment, notes }),
    [detailedLines, totalPrice, effectiveCustomerName, effectiveLocality, delivery, payment, notes],
  );

  if (totalItems === 0) return null;

  const sendWhatsApp = async () => {
    if (!number) return;
    if (session) {
      await recordWhatsAppOrder({
        customerName: effectiveCustomerName,
        locality: effectiveLocality,
        delivery: delivery as "Envío" | "Retiro",
        payment: payment as "Efectivo" | "Transferencia",
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
            <p className="truncate text-xs text-texto-suave">{formatARS(totalPrice)}{isWholesale ? " · Mayorista" : ""}</p>
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
                <p className="text-xs text-texto-suave">Total estimado{isWholesale ? " mayorista" : ""}</p>
                <p className="text-xl font-extrabold text-texto">{formatARS(totalPrice)}</p>
              </div>
              <button type="button" onClick={clear} className="text-xs font-semibold text-titanio hover:text-texto">Vaciar</button>
            </div>

            <div className="mt-4 space-y-3 rounded-xl border border-borde bg-superficie p-3">
              {useRegisteredCustomer ? (
                <p className="rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-xs text-texto-suave">
                  Pedido de <span className="font-bold text-texto">{registeredCustomerName}</span> · {registeredLocality}
                </p>
              ) : (
                <>
                  <div>
                    <label htmlFor="customer-name" className="mb-1 block text-xs font-bold text-texto">Nombre completo o local</label>
                    <input id="customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" className="h-10 w-full rounded-lg border border-borde-fuerte bg-white px-3 text-sm text-texto outline-none transition focus:border-acero" placeholder="Ej.: Juan Pérez / Servicio JP" />
                  </div>
                  <div>
                    <label htmlFor="customer-locality" className="mb-1 block text-xs font-bold text-texto">Localidad</label>
                    <input id="customer-locality" value={locality} onChange={(event) => setLocality(event.target.value)} autoComplete="address-level2" className="h-10 w-full rounded-lg border border-borde-fuerte bg-white px-3 text-sm text-texto outline-none transition focus:border-acero" placeholder="Ej.: Rosario" />
                  </div>
                </>
              )}
              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-texto">Forma de entrega</legend>
                <div className="grid grid-cols-2 gap-2">
                  {["Envío", "Retiro"].map((option) => (
                    <label key={option} className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${delivery === option ? "border-acero bg-acero-tenue text-texto" : "border-borde-fuerte bg-white text-texto-suave"}`}>
                      <input
                        type="radio"
                        name="delivery"
                        value={option}
                        checked={delivery === option}
                        onChange={(event) => {
                          const nextDelivery = event.target.value;
                          setDelivery(nextDelivery);
                          if (nextDelivery === "Envío") setPayment("Transferencia");
                        }}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 text-xs font-bold text-texto">Forma de pago</legend>
                <div className="grid grid-cols-2 gap-2">
                  {["Efectivo", "Transferencia"].map((option) => {
                    const disabled = delivery === "Envío" && option === "Efectivo";

                    return (
                      <label
                        key={option}
                        className={`flex min-h-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                          disabled
                            ? "cursor-not-allowed border-borde bg-superficie text-titanio opacity-60"
                            : payment === option
                              ? "cursor-pointer border-acero bg-acero-tenue text-texto"
                              : "cursor-pointer border-borde-fuerte bg-white text-texto-suave"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={option}
                          checked={payment === option}
                          disabled={disabled}
                          onChange={(event) => setPayment(event.target.value)}
                          className="sr-only"
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
                {delivery === "Envío" && <p className="mt-1.5 text-[11px] text-texto-suave">Los pedidos con envío se abonan por transferencia.</p>}
              </fieldset>
              <div>
                <label htmlFor="customer-notes" className="mb-1 block text-xs font-bold text-texto">Observaciones <span className="font-normal text-titanio">(opcional)</span></label>
                <textarea id="customer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="w-full resize-none rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm text-texto outline-none transition focus:border-acero" placeholder="Color, variante u otra aclaración" />
              </div>
              <p className="text-xs leading-relaxed text-texto-suave">El pago se coordina después de confirmar el stock. Las cantidades disponibles se confirman por WhatsApp.</p>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-borde-fuerte bg-white p-3 text-xs leading-relaxed text-texto-suave">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-acero)]"
                />
                <span>
                  Leí y acepto los{" "}
                  <a href="/terminos" target="_blank" rel="noreferrer" className="font-bold text-texto underline underline-offset-2">
                    Términos y condiciones y las Condiciones de garantía
                  </a>.
                </span>
              </label>
            </div>

            {!number && (
              <p className="mt-4 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs text-texto-suave">
                Falta configurar el número de WhatsApp de LOOP para habilitar el envío.
              </p>
            )}
            <button type="button" onClick={() => void sendWhatsApp()} disabled={!number || !customerComplete || !termsAccepted} className="mt-3 w-full rounded-xl border border-acero bg-acero-tenue px-4 py-3 text-sm font-extrabold text-texto transition-colors hover:bg-grafito disabled:cursor-not-allowed disabled:border-borde disabled:bg-superficie disabled:text-titanio">
              Enviar consulta por WhatsApp
            </button>
            <p className="mt-2 text-center text-[11px] text-titanio">{!customerComplete ? (useRegisteredCustomer ? "Elegí la entrega y la forma de pago para continuar." : "Completá tus datos, la entrega y la forma de pago para continuar.") : !termsAccepted ? "Aceptá los términos y las condiciones de garantía para continuar." : "Tu pedido se enviará por WhatsApp para confirmar disponibilidad y coordinar entrega."}</p>
          </div>
        </div>
      )}
    </>
  );
}
