"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";

export function AccountPanel() {
  const { accountOpen, closeAccount, session, profile, request, pendingRequests, loading, signInWithGoogle, signOut, submitWholesaleRequest, resolveWholesaleRequest } = useAuth();
  const [nombre, setNombre] = useState("");
  const [local, setLocal] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState("");

  if (!accountOpen) return null;
  const isApproved = profile?.role === "MAYORISTA" || profile?.role === "ADMIN";

  async function login() {
    setWorking(true); setError("");
    const message = await signInWithGoogle();
    if (message) { setError(message); setWorking(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setError("");
    const message = await submitWholesaleRequest({ nombre, local, localidad, whatsapp });
    if (message) setError(message);
    setWorking(false);
  }

  async function resolveRequest(requestId: string, approve: boolean) {
    setResolvingId(requestId); setError("");
    const message = await resolveWholesaleRequest(requestId, approve);
    if (message) setError(message);
    setResolvingId("");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-5" onMouseDown={closeAccount}>
      <section role="dialog" aria-modal="true" aria-label="Mi cuenta" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-acero-fuerte">LOOP REPUESTOS</p><h2 className="text-xl font-black text-texto">Mi cuenta</h2></div>
          <button type="button" onClick={closeAccount} className="flex h-10 w-10 items-center justify-center rounded-lg border border-borde text-xl text-texto-suave" aria-label="Cerrar">×</button>
        </div>

        {loading ? <p className="py-8 text-center text-sm text-texto-suave">Cargando…</p> : !session ? (
          <div>
            <p className="mb-5 text-sm leading-6 text-texto-suave">Ingresá para guardar favoritos y solicitar acceso a precios mayoristas.</p>
            <button type="button" onClick={login} disabled={working} className="flex w-full items-center justify-center gap-3 rounded-xl border border-borde-fuerte bg-white px-4 py-3 text-sm font-bold text-texto shadow-sm hover:bg-fondo-2 disabled:opacity-50">
              <span className="text-lg font-black text-acero-fuerte">G</span> Continuar con Google
            </button>
          </div>
        ) : (
          <div>
            <div className="mb-5 rounded-xl border border-borde bg-fondo-2 p-3">
              <p className="text-sm font-bold text-texto">{profile?.nombre || session.user.user_metadata.full_name || "Cliente LOOP"}</p>
              <p className="mt-0.5 text-xs text-texto-suave">{session.user.email}</p>
            </div>
            {profile?.role === "ADMIN" ? (
              <div>
                <div className="mb-3 rounded-xl border border-acero bg-acero-tenue p-4">
                  <p className="font-bold text-texto">Panel administrador</p>
                  <p className="mt-1 text-xs leading-5 text-texto-suave">Las nuevas solicitudes mayoristas aparecen acá.</p>
                </div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-texto">Solicitudes pendientes</h3>
                  <span className="rounded-full bg-fondo-2 px-2.5 py-1 text-xs font-bold text-texto-suave">{pendingRequests.length}</span>
                </div>
                {pendingRequests.length === 0 ? (
                  <p className="rounded-xl border border-borde bg-fondo-2 p-4 text-center text-sm text-texto-suave">No hay solicitudes pendientes.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((item) => (
                      <article key={item.id} className="rounded-xl border border-borde p-4">
                        <p className="font-black text-texto">{item.nombre}</p>
                        <p className="mt-1 text-sm font-semibold text-texto-suave">{item.service_local}</p>
                        <div className="mt-3 space-y-1 text-xs text-texto-suave">
                          <p>Localidad: <span className="font-bold text-texto">{item.localidad}</span></p>
                          <p>WhatsApp: <a className="font-bold text-texto underline" href={`https://wa.me/54${item.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{item.whatsapp}</a></p>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button type="button" disabled={Boolean(resolvingId)} onClick={() => void resolveRequest(item.id, false)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 disabled:opacity-50">Rechazar</button>
                          <button type="button" disabled={Boolean(resolvingId)} onClick={() => void resolveRequest(item.id, true)} className="rounded-lg border border-green-200 bg-green-600 px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50">{resolvingId === item.id ? "Procesando…" : "Aprobar"}</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : isApproved ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="font-bold text-green-800">Cuenta mayorista aprobada</p>
                <p className="mt-1 text-xs leading-5 text-green-700">Los precios especiales se habilitarán cuando terminemos de definir los márgenes.</p>
              </div>
            ) : request?.estado === "PENDIENTE" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-bold text-amber-900">Solicitud en revisión</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">LOOP va a revisar tus datos y aprobar el acceso mayorista.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div><label className="mb-1 block text-xs font-bold text-texto">Nombre completo</label><input required value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-11 w-full rounded-lg border border-borde-fuerte px-3 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-bold text-texto">Nombre del local o servicio técnico</label><input required value={local} onChange={(e) => setLocal(e.target.value)} className="h-11 w-full rounded-lg border border-borde-fuerte px-3 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-bold text-texto">Localidad</label><input required value={localidad} onChange={(e) => setLocalidad(e.target.value)} className="h-11 w-full rounded-lg border border-borde-fuerte px-3 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-bold text-texto">WhatsApp</label><input required inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="h-11 w-full rounded-lg border border-borde-fuerte px-3 text-sm" /></div>
                <button disabled={working} className="w-full rounded-xl border border-acero bg-acero-tenue px-4 py-3 text-sm font-extrabold text-texto disabled:opacity-50">Solicitar acceso mayorista</button>
              </form>
            )}
            <button type="button" onClick={() => void signOut()} className="mt-5 w-full text-center text-xs font-bold text-titanio hover:text-texto">Cerrar sesión</button>
          </div>
        )}
        {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </section>
    </div>
  );
}
