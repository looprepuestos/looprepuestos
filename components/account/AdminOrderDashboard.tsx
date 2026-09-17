"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { formatARS } from "@/lib/format";
import type { WhatsAppOrderItem, WhatsAppOrderRow } from "@/types/database";

type OrderStatus = WhatsAppOrderRow["estado"];

interface AdminOrder extends WhatsAppOrderRow {
  email: string | null;
  role: string | null;
  service_local: string | null;
  whatsapp: string | null;
}

const statuses: ReadonlyArray<{ value: OrderStatus; label: string }> = [
  { value: "NUEVO", label: "Nuevo" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "PREPARADO", label: "Preparado" },
  { value: "ENTREGADO", label: "Entregado" },
  { value: "CANCELADO", label: "Cancelado" },
];

const statusClasses: Record<OrderStatus, string> = {
  NUEVO: "border-blue-200 bg-blue-50 text-blue-700",
  CONFIRMADO: "border-amber-200 bg-amber-50 text-amber-800",
  PREPARADO: "border-violet-200 bg-violet-50 text-violet-700",
  ENTREGADO: "border-green-200 bg-green-50 text-green-700",
  CANCELADO: "border-red-200 bg-red-50 text-red-700",
};

function statusLabel(value: OrderStatus) {
  return statuses.find((status) => status.value === value)?.label ?? value;
}

function itemCount(items: WhatsAppOrderItem[]) {
  return items.reduce((total, item) => total + item.cantidad, 0);
}

export function AdminOrderDashboard({ session }: { session: Session }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState<"TODOS" | OrderStatus>("TODOS");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json() as { orders?: AdminOrder[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar los pedidos.");
      setOrders(payload.orders ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadOrders());
    return () => window.cancelAnimationFrame(frame);
  }, [loadOrders]);

  const visibleOrders = useMemo(
    () => filter === "TODOS" ? orders : orders.filter((order) => order.estado === filter),
    [filter, orders],
  );
  const newCount = orders.filter((order) => order.estado === "NUEVO").length;
  const activeCount = orders.filter((order) => order.estado === "CONFIRMADO" || order.estado === "PREPARADO").length;
  const estimatedTotal = orders
    .filter((order) => order.estado !== "CANCELADO")
    .reduce((total, order) => total + Number(order.total_estimated), 0);

  async function updateStatus(orderId: string, estado: OrderStatus) {
    setUpdatingId(orderId);
    setError("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderId, estado }),
      });
      const payload = await response.json() as { order?: WhatsAppOrderRow; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "No se pudo actualizar el pedido.");
      setOrders((current) => current.map((order) => order.id === orderId ? { ...order, ...payload.order } : order));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar el pedido.");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <section className="mb-6 border-b border-borde pb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-texto">Pedidos registrados</h3>
            {newCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">{newCount} nuevos</span>}
          </div>
          <p className="mt-1 text-[11px] text-texto-suave">Consultas de clientes que iniciaron sesión.</p>
        </div>
        <button type="button" onClick={() => void loadOrders()} disabled={loading} className="rounded-lg border border-borde-fuerte px-3 py-2 text-xs font-bold text-texto disabled:opacity-50">Actualizar</button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-bold uppercase text-blue-700">Nuevos</p><p className="mt-1 text-xl font-black text-blue-900">{newCount}</p></div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3"><p className="text-[10px] font-bold uppercase text-amber-700">En curso</p><p className="mt-1 text-xl font-black text-amber-900">{activeCount}</p></div>
        <div className="rounded-xl border border-green-100 bg-green-50 p-3"><p className="text-[10px] font-bold uppercase text-green-700">Estimado</p><p className="mt-1 text-sm font-black text-green-900 sm:text-base">{formatARS(estimatedTotal)}</p></div>
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <button type="button" onClick={() => setFilter("TODOS")} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold ${filter === "TODOS" ? "border-acero bg-acero-tenue text-texto" : "border-borde bg-white text-texto-suave"}`}>Todos</button>
        {statuses.map((status) => (
          <button key={status.value} type="button" onClick={() => setFilter(status.value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold ${filter === status.value ? statusClasses[status.value] : "border-borde bg-white text-texto-suave"}`}>{status.label}</button>
        ))}
      </div>

      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {loading ? (
        <p className="rounded-xl border border-borde bg-fondo-2 p-4 text-center text-sm text-texto-suave">Cargando pedidos…</p>
      ) : visibleOrders.length === 0 ? (
        <p className="rounded-xl border border-borde bg-fondo-2 p-4 text-center text-sm text-texto-suave">No hay pedidos en este estado.</p>
      ) : (
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
          {visibleOrders.map((order) => (
            <article key={order.id} className="rounded-xl border border-borde bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-texto">{order.service_local || order.customer_name}</p>
                  {order.service_local && order.service_local !== order.customer_name && <p className="truncate text-xs font-semibold text-texto-suave">{order.customer_name}</p>}
                  <p className="mt-1 text-[11px] text-titanio">{new Date(order.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</p>
                </div>
                <p className="shrink-0 text-sm font-black text-texto">{formatARS(Number(order.total_estimated))}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-texto-suave sm:grid-cols-4">
                <p><span className="block font-bold text-texto">Entrega</span>{order.delivery}</p>
                <p><span className="block font-bold text-texto">Pago</span>{order.payment_method || "A coordinar"}</p>
                <p><span className="block font-bold text-texto">Localidad</span>{order.locality}</p>
                <p><span className="block font-bold text-texto">Unidades</span>{itemCount(order.items)}</p>
              </div>
              <details className="mt-3 border-t border-borde pt-3">
                <summary className="cursor-pointer text-xs font-bold text-acero-fuerte">Ver productos y contacto</summary>
                <div className="mt-2 space-y-1.5">
                  {order.items.map((item) => <div key={`${order.id}-${item.sku}`} className="flex justify-between gap-3 text-xs"><span className="text-texto-suave">{item.cantidad}× {item.nombre}</span><span className="shrink-0 font-bold text-texto">{formatARS(item.subtotal)}</span></div>)}
                  <div className="mt-2 border-t border-borde pt-2 text-[11px] text-texto-suave">
                    {order.email && <p>{order.email}</p>}
                    {order.whatsapp && <a href={`https://wa.me/54${order.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="font-bold text-texto underline">WhatsApp {order.whatsapp}</a>}
                    {order.notes && <p className="mt-1">Obs.: {order.notes}</p>}
                  </div>
                </div>
              </details>
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${statusClasses[order.estado]}`}>{statusLabel(order.estado)}</span>
                <select value={order.estado} onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)} disabled={updatingId === order.id} className="ml-auto h-9 rounded-lg border border-borde-fuerte bg-white px-2 text-xs font-bold text-texto disabled:opacity-50" aria-label={`Estado del pedido de ${order.customer_name}`}>
                  {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
