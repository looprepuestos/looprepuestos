"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

interface WholesaleAccount {
  id: string;
  email: string;
  nombre: string | null;
  created_at: string;
  updated_at: string;
}

export function WholesaleAccountAdmin({ session }: { session: Session }) {
  const [accounts, setAccounts] = useState<WholesaleAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/wholesale-accounts", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las cuentas.");
      setAccounts(payload.accounts ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar las cuentas.");
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/wholesale-accounts", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "No se pudieron cargar las cuentas.");
        if (active) setAccounts(payload.accounts ?? []);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "No se pudieron cargar las cuentas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [session.access_token]);

  async function manage(account: WholesaleAccount, action: "revoke" | "delete") {
    const confirmed = window.confirm(
      action === "delete"
        ? `¿Eliminar definitivamente la cuenta de ${account.nombre || account.email}? Perderá el acceso y tendrá que registrarse otra vez.`
        : `¿Quitarle el precio mayorista a ${account.nombre || account.email}? La cuenta seguirá activa como público.`,
    );
    if (!confirmed) return;

    setWorkingId(account.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/wholesale-accounts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: account.id, action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo completar la acción.");
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setMessage(action === "delete"
        ? payload.result === "REVOKED_HISTORY"
          ? "Se quitó el acceso mayorista. La cuenta se conservó porque tiene historial asociado."
          : "Cuenta eliminada."
        : "Acceso mayorista retirado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la acción.");
      await loadAccounts();
    } finally {
      setWorkingId("");
    }
  }

  return (
    <div className="mt-6 border-t border-borde pt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-texto">Clientes mayoristas</h3>
        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">{accounts.length}</span>
      </div>
      {loading ? (
        <p className="rounded-xl border border-borde bg-fondo-2 p-4 text-center text-sm text-texto-suave">Cargando mayoristas…</p>
      ) : accounts.length === 0 ? (
        <p className="rounded-xl border border-borde bg-fondo-2 p-4 text-center text-sm text-texto-suave">No hay cuentas mayoristas activas.</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {accounts.map((account) => (
            <article key={account.id} className="rounded-xl border border-borde p-3">
              <p className="font-bold text-texto">{account.nombre || "Cliente sin nombre"}</p>
              <p className="mt-0.5 break-all text-xs text-texto-suave">{account.email}</p>
              <p className="mt-1 text-[11px] text-titanio">Mayorista desde {new Date(account.updated_at).toLocaleDateString("es-AR")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={Boolean(workingId)} onClick={() => void manage(account, "revoke")} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-extrabold text-amber-800 disabled:opacity-50">Quitar mayorista</button>
                <button type="button" disabled={Boolean(workingId)} onClick={() => void manage(account, "delete")} className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-xs font-extrabold text-red-700 disabled:opacity-50">{workingId === account.id ? "Procesando…" : "Eliminar cuenta"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {message && <p className="mt-3 rounded-lg border border-borde bg-fondo-2 px-3 py-2 text-xs text-texto-suave">{message}</p>}
    </div>
  );
}
