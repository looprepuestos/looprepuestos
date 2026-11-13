"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

type RestockRow = {
  sku: string;
  whatsapp: string;
  name: string;
  searchName: string;
  ready: boolean;
};

export function AdminRestockRequests({ session }: { session: Session }) {
  const [rows, setRows] = useState<RestockRow[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [opened, setOpened] = useState("");

  const token = session.access_token;

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/admin/restock", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error();
        const data: RestockRow[] = await response.json();
        if (active) {
          setRows(data);
          setError("");
        }
      } catch {
        if (active) setError("No pudimos cargar los avisos.");
      }
    }
    void load();
    return () => { active = false; };
  }, [token, refresh]);

  async function markNotified(row: RestockRow) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/restock", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: row.sku, whatsapp: row.whatsapp }),
      });
      if (!response.ok) throw new Error();
      setRows((current) => current?.filter((item) => item.sku !== row.sku || item.whatsapp !== row.whatsapp) ?? null);
    } catch {
      setError("No pudimos marcar el aviso como enviado.");
    } finally {
      setSaving(false);
    }
  }

  const groups = new Map<string, RestockRow[]>();
  for (const row of rows ?? []) {
    const group = groups.get(row.sku);
    if (group) group.push(row);
    else groups.set(row.sku, [row]);
  }

  return (
    <section className="mb-5 space-y-3 rounded-xl border border-borde p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-texto">Avisos de reposición</h3>
        <button type="button" className="text-xs font-bold text-acero-fuerte" onClick={() => { setRows(null); setRefresh(refresh + 1); }}>Actualizar</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!rows && !error && <p role="status" className="text-sm text-texto-suave">Cargando…</p>}
      {rows?.length === 0 && <p className="text-sm text-texto-suave">Todavía no hay avisos pendientes.</p>}
      {[...groups].map(([sku, requests]) => {
        const product = requests[0];
        if (!product) return null;
        const { ready } = product;
        const url = new URL("/", window.location.origin);
        url.searchParams.set("buscar", product.searchName);
        const message = `¡Hola! Volvió a ingresar ${product.name} en Loop Repuestos. Podés consultar el stock y pedirlo acá: ${url}`;
        return (
          <details key={sku} className="rounded-lg border border-borde p-3">
            <summary className="cursor-pointer text-sm font-semibold text-texto">
              {product.name} · {requests.length} {requests.length === 1 ? "persona" : "personas"}
              <span className={ready ? "block text-xs text-green-700" : "block text-xs text-texto-suave"}>{ready ? "Ya hay stock" : "Esperando reposición"}</span>
            </summary>
            {ready && requests.map((row) => {
              const key = `${sku}:${row.whatsapp}`;
              return (
                <div key={key} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-2 text-xs">
                  <a href={`https://wa.me/${row.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="font-bold text-green-700" onClick={() => setOpened(key)}>Abrir WhatsApp · +{row.whatsapp}</a>
                  {opened === key && <button type="button" disabled={saving} onClick={() => void markNotified(row)} className="rounded-md border border-borde px-2 py-1 font-bold text-texto">Marcar enviado</button>}
                </div>
              );
            })}
          </details>
        );
      })}
    </section>
  );
}
