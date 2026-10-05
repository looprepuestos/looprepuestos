"use client";

import { useEffect, useMemo, useState } from "react";

type Announcement = { id: string; kind: string; title: string; sku: string | null };

const KIND_LABELS: Record<string, string> = {
  "NUEVO INGRESO": "NUEVO INGRESO",
  REINGRESO: "VOLVIÓ A STOCK",
  "EN STOCK": "DISPONIBLE",
  PROMOCION: "PROMOCIÓN",
  INFORMACION: "INFORMACIÓN",
  HORARIOS: "HORARIOS",
  IMPORTANTE: "IMPORTANTE",
};

export function HomeAnnouncementTicker({ onOpenProduct }: { onOpenProduct: (sku: string | null) => void }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch("/api/announcements")
      .then((response) => response.ok ? response.json() : { items: [] })
      .then((json) => setItems(json.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % items.length);
        setVisible(true);
      }, 320);
    }, 3800);
    return () => window.clearInterval(id);
  }, [items.length]);

  const current = items[index % items.length];
  const label = useMemo(() => current ? (KIND_LABELS[current.kind] || current.kind) : "", [current]);
  const isStockNotice = current ? ["NUEVO INGRESO", "REINGRESO", "EN STOCK"].includes(current.kind) : false;
  if (!current) return null;

  return (
    <section aria-label="Novedades de stock" className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#111820] shadow-[0_14px_34px_rgba(15,23,32,.22)]">
      <div aria-hidden className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/[.045]" />
      <div aria-hidden className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <button type="button" onClick={() => onOpenProduct(current.sku)} className="relative flex min-h-[116px] w-full items-center gap-4 px-5 py-5 text-left sm:px-6">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[.07]">
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-white/30" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <span className={`min-w-0 flex-1 transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-y-0 opacity-100" : "-translate-y-5 opacity-0"}`}>
          <span className="mb-2 inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.18em] text-white/80">{label}</span>
          <span className="block text-lg font-black leading-tight tracking-[-.015em] text-white sm:text-xl">{current.title}</span>
          {current.sku && <span className="mt-2 block text-[11px] font-bold uppercase tracking-[.08em] text-white/55">Ver producto</span>}
        </span>
        {current.sku && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[.08] text-xl font-light text-white transition-transform group-hover:translate-x-0.5">›</span>
        )}
      </button>
      {items.length > 1 && (
        <div className="relative flex items-center gap-1.5 px-5 pb-4 sm:px-6">
          {items.slice(0, 5).map((item, itemIndex) => (
            <span key={item.id} className={`h-1 rounded-full transition-all duration-300 ${itemIndex === index % items.length ? "w-8 bg-white" : "w-2 bg-white/25"}`} />
          ))}
          <span className="ml-auto text-[9px] font-bold uppercase tracking-[.16em] text-white/35">LOOP · {isStockNotice ? "STOCK" : "AVISOS"}</span>
        </div>
      )}
    </section>
  );
}
