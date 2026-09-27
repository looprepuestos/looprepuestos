"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

type Summary = {
  visits: number; anonymous: number; truncated: boolean;
  visitors: { key: string; name: string; count: number }[];
  searches: { key: string; count: number; noResults: number }[];
  withoutResults: { key: string; count: number; noResults: number }[];
  products: { key: string; name: string; count: number }[];
  recent: { at: string; type: string; name: string; label: string; results: number | null }[];
};

export function AdminActivityDashboard({ session }: { session: Session }) {
  const [days, setDays] = useState<7 | 30>(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/activity?days=${days}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar la actividad.");
      setSummary(payload as Summary);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la actividad."); }
    finally { setLoading(false); }
  }, [days, session.access_token]);
  useEffect(() => { const frame = window.requestAnimationFrame(() => void load()); return () => window.cancelAnimationFrame(frame); }, [load]);

  return <section className="mb-6 border-b border-borde pb-6">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-black text-texto">Actividad del catálogo</h3>
      <div className="flex gap-2">
        <select aria-label="Período de actividad" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30)} className="rounded-lg border border-borde-fuerte bg-white px-2 py-2 text-xs font-bold"><option value={7}>7 días</option><option value={30}>30 días</option></select>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-borde-fuerte px-3 py-2 text-xs font-bold disabled:opacity-50">Actualizar</button>
      </div>
    </div>
    <p className="mb-3 text-xs text-texto-suave">Las visitas de personas sin sesión se muestran juntas. Los datos empiezan desde la activación de este registro.</p>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm">Cargando actividad…</p> : summary && <>
      <div className="mb-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-borde bg-fondo-2 p-3"><p className="text-xs">Visitas</p><p className="text-2xl font-black">{summary.visits}</p></div><div className="rounded-xl border border-borde bg-fondo-2 p-3"><p className="text-xs">Sin sesión</p><p className="text-2xl font-black">{summary.anonymous}</p></div></div>
      {summary.truncated && <p className="mb-3 text-xs text-amber-800">Hay más de 10.000 eventos en el período; este resumen muestra los más recientes.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Ranking title="Clientes que más entraron" rows={summary.visitors.map((item) => ({ name: item.name, value: item.count, unit: "visitas" }))} />
        <Ranking title="Búsquedas más frecuentes" rows={summary.searches.map((item) => ({ name: item.key, value: item.count, unit: "búsquedas" }))} />
        <Ranking title="Búsquedas sin resultados" rows={summary.withoutResults.map((item) => ({ name: item.key, value: item.noResults, unit: "veces" }))} />
        <Ranking title="Productos más vistos" rows={summary.products.map((item) => ({ name: item.name, value: item.count, unit: "vistas" }))} />
      </div>
      <details className="mt-4 rounded-xl border border-borde p-3"><summary className="cursor-pointer text-sm font-bold">Historial reciente</summary><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{summary.recent.length === 0 ? <p className="text-sm text-texto-suave">Todavía no hay actividad registrada.</p> : summary.recent.map((item, index) => <div key={`${item.at}-${index}`} className="border-b border-borde pb-2 text-xs"><p className="font-bold">{item.name} · {item.type === "search" ? "Buscó" : item.type === "product_view" ? "Vio" : "Visitó"} {item.label}</p><p className="text-texto-suave">{new Date(item.at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}{item.type === "search" ? ` · ${item.results} resultados` : ""}</p></div>)}</div></details>
    </>}
  </section>;
}

function Ranking({ title, rows }: { title: string; rows: { name: string; value: number; unit: string }[] }) {
  return <div className="rounded-xl border border-borde p-3"><h4 className="mb-2 text-sm font-bold">{title}</h4>{rows.length === 0 ? <p className="text-xs text-texto-suave">Sin datos todavía.</p> : <ol className="space-y-2">{rows.map((item, index) => <li key={`${item.name}-${index}`} className="flex justify-between gap-3 text-xs"><span className="min-w-0 break-words">{index + 1}. {item.name}</span><span className="shrink-0 font-bold">{item.value} {item.unit}</span></li>)}</ol>}</div>;
}
