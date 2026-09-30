"use client";
import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatARS } from '@/lib/format';
import type { OrderNotification } from '@/lib/order-notifications';
export function CustomerNotifications() {
  const { notifications, unreadNotifications, notificationError, refreshNotifications, markNotificationRead, refreshOrderHistory } = useAuth();
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open(n: OrderNotification) {
    setOpened(opened === n.id ? null : n.id);
    if (opened === n.id) return;
    setBusy(true); setError('');
    try { if (!n.read_at) setError(await markNotificationRead(n.id) ?? ''); await refreshOrderHistory(); }
    finally { setBusy(false); }
  }
  return <section className="mb-5" aria-label="Notificaciones de pedidos">
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-black">Notificaciones {unreadNotifications > 0 && <span className="ml-1 rounded-full bg-acero px-2 py-1 text-xs text-white">{unreadNotifications} nuevas</span>}</h3><button type="button" disabled={busy} onClick={() => void refreshNotifications()} className="rounded-lg border border-borde px-3 py-2 text-xs font-bold">Actualizar</button></div>
    {(error || notificationError) && <p role="alert" className="mb-2 text-sm text-red-700">{error || notificationError}</p>}
    {!notifications.length ? <p className="rounded-xl border border-borde bg-fondo-2 p-3 text-xs text-texto-suave">Los avisos de tus pedidos aparecerán acá.</p> : <div className="max-h-80 space-y-2 overflow-y-auto">{notifications.map(n => <article key={n.id} className={`rounded-xl border p-3 ${n.read_at ? 'border-borde bg-white' : 'border-acero bg-acero-tenue'}`}>
      <button type="button" disabled={busy} onClick={() => void open(n)} aria-expanded={opened === n.id} className="w-full text-left"><p className="text-sm font-bold">{!n.read_at && <span aria-label="Sin leer">● </span>}{n.title}</p><p className="mt-1 text-[11px] text-texto-suave">Pedido #{n.order_id.slice(0,8)} · {new Date(n.created_at).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</p></button>
      {opened === n.id && <div className="mt-3 space-y-2 border-t border-borde pt-3 text-xs"><p className="whitespace-pre-line">{n.message}</p>
        {n.changes.estado && <p>Estado: {n.changes.estado.antes} → {n.changes.estado.ahora}</p>}
        {n.changes.total && <p>Total: {formatARS(Number(n.changes.total.antes))} → <strong>{formatARS(Number(n.changes.total.ahora))}</strong></p>}
        {n.changes.entrega && <p>Entrega: {n.changes.entrega.antes} → {n.changes.entrega.ahora}</p>}
        {n.changes.pago && <p>Pago: {n.changes.pago.antes || 'A coordinar'} → {n.changes.pago.ahora || 'A coordinar'}</p>}
        {n.changes.items && <><p className="font-bold">Productos antes</p>{n.changes.items.antes.map((item,i)=><p key={i}>{item.cantidad}× {item.nombre} · {formatARS(item.subtotal)}</p>)}<p className="font-bold">Productos ahora</p>{n.changes.items.ahora.map((item,i)=><p key={i}>{item.cantidad}× {item.nombre} · {formatARS(item.subtotal)}</p>)}</>}
        <a onClick={() => { const target = document.getElementById(`pedido-${n.order_id}`); if (target instanceof HTMLDetailsElement) target.open = true; }} href={`#pedido-${n.order_id}`} className="inline-block py-2 font-bold underline">Ver pedido</a>
      </div>}
    </article>)}</div>}
  </section>;
}
