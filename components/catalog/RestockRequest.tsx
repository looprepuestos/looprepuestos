"use client";

import { useId, useState, type FormEvent } from "react";

export function RestockRequest({ sku }: { sku: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = new FormData(event.currentTarget).get("phone");
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, phone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Probá de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (saved) return <p role="status" className="text-sm font-semibold text-green-700">Listo. Te avisamos por WhatsApp cuando vuelva.</p>;
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-acero/60 bg-acero-tenue px-3 py-2 text-sm font-bold text-texto hover:border-acero">
      Avisame cuando vuelva
    </button>
  );

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-lg border border-borde bg-superficie p-3">
      <label htmlFor={id} className="block text-sm font-bold text-texto">Tu número de WhatsApp</label>
      <input id={id} name="phone" type="tel" autoComplete="tel" placeholder="+54 9 3444 123456" required maxLength={28} className="w-full rounded-md border border-borde bg-white px-3 py-2 text-sm text-texto" />
      <p className="text-xs text-texto-suave">Usamos tu número para avisarte cuando vuelva este repuesto.</p>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-acero-tenue px-3 py-2 text-sm font-bold text-texto disabled:opacity-50">{pending ? "Guardando…" : "Confirmar aviso"}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="text-sm text-texto-suave">Cancelar</button>
      </div>
    </form>
  );
}
