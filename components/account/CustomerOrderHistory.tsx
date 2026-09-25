"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatARS } from "@/lib/format";
import type { WhatsAppOrderRow } from "@/types/database";

export function CustomerOrderHistory() {
  const { orderHistory, refreshOrderHistory, changeOrder } = useAuth();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void refreshOrderHistory(); }, [refreshOrderHistory]);

  async function refresh() {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setMessage("");
    try { setError(await refreshOrderHistory() ?? ""); }
    finally { working.current = false; setBusy(false); }
  }

  async function change(order: WhatsAppOrderRow, itemIndex?: number) {
    if (working.current) return;
    const item = itemIndex === undefined ? undefined : order.items[itemIndex];
    const cancel = !item || order.items.length === 1;
    const question = cancel
      ? "¿Cancelar este pedido? Quedará registrado como cancelado."
      : `¿Quitar ${item.nombre} del pedido? Se quitarán las ${item.cantidad} unidades y se actualizará el total.`;
    if (!window.confirm(question)) return;
    working.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const problem = await changeOrder(order, cancel ? "cancel" : "remove_item", itemIndex);
      if (problem) setError(problem);
      else setMessage(cancel ? "Pedido cancelado. El cambio ya está registrado en LOOP." : "Producto quitado y total actualizado. El cambio ya está registrado en LOOP.");
    } finally { working.current = false; setBusy(false); }
  }

  return <div className="mb-5">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="text-sm font-black text-texto">Historial de pedidos</h3>
      <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-lg border border-borde px-3 py-2 text-xs font-bold disabled:opacity-50">{busy ? "Procesando…" : "Actualizar"}</button>
    </div>
    {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mb-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {orderHistory.length === 0 ? <p className="rounded-xl border border-borde bg-fondo-2 p-4 text-center text-sm text-texto-suave">Tus próximas consultas por WhatsApp aparecerán acá.</p> :
      <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{orderHistory.map((order) => <details key={order.id} className="rounded-xl border border-borde bg-white p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black text-texto">{new Date(order.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</p><p className="mt-0.5 text-xs text-texto-suave">{order.items.length} {order.items.length === 1 ? "producto" : "productos"} · {order.delivery}</p></div>
            <div className="text-right"><p className="text-sm font-black text-texto">{formatARS(Number(order.total_estimated))}</p><span className={`text-xs font-bold uppercase ${order.estado === "CANCELADO" ? "text-red-700" : "text-acero-fuerte"}`}>{order.estado}</span></div>
          </div>
        </summary>
        <div className="mt-3 space-y-3 border-t border-borde pt-3">
          {order.items.map((item, index) => <div key={`${item.sku}-${index}`} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 text-texto-suave">{item.cantidad}× {item.nombre}</span>
            <div className="shrink-0 text-right"><p className="font-bold text-texto">{formatARS(item.subtotal)}</p>{order.estado === "NUEVO" && order.items.length > 1 && <button type="button" disabled={busy} onClick={() => void change(order, index)} aria-label={`Quitar ${item.nombre} del pedido`} className="mt-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">Quitar</button>}</div>
          </div>)}
          {order.notes && <p className="whitespace-pre-line text-xs leading-5 text-texto-suave">{order.notes}</p>}
          {order.estado === "NUEVO" ? <>
            <p className="text-xs leading-5 text-texto-suave">Podés quitar productos o cancelar mientras el pedido sea nuevo. Los cambios se reflejan en el panel de LOOP; el mensaje de WhatsApp anterior conserva su contenido original.</p>
            <button type="button" disabled={busy} onClick={() => void change(order)} className="w-full rounded-lg border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700 disabled:opacity-50">Cancelar pedido</button>
          </> : order.estado !== "CANCELADO" && order.estado !== "ENTREGADO" ? <p className="text-xs leading-5 text-texto-suave">Para cambiar este pedido, contactá a LOOP por WhatsApp.</p> : null}
        </div>
      </details>)}</div>}
  </div>;
}
