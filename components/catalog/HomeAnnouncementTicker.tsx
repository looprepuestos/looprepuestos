"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { recordActivity } from "@/lib/activity";
import type { PublicProduct } from "@/types/product";

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

export function HomeAnnouncementTicker({ products, onOpenProduct }: { products: ReadonlyArray<PublicProduct>; onOpenProduct: (sku: string | null) => void }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const { session, profile } = useAuth();

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
    }, 6500);
    return () => window.clearInterval(id);
  }, [items.length]);

  const current = items[index % items.length];
  const label = useMemo(() => current ? (KIND_LABELS[current.kind] || current.kind) : "", [current]);
  const isStockNotice = current ? ["NUEVO INGRESO", "REINGRESO", "EN STOCK"].includes(current.kind) : false;
  const product = current?.sku ? products.find((item) => item.sku === current.sku) : undefined;
  const imageUrl = product?.imagenUrl;
  if (!current) return null;

  return (
    <section aria-label="Novedades de stock" className="relative isolate overflow-hidden rounded-2xl border border-[#28383d] bg-[#101b20] shadow-[0_14px_34px_rgba(15,23,32,.16)]">
      {imageUrl && (
        <div aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-[46%] bg-[#edf1ef] transition-opacity duration-300 motion-reduce:transition-none sm:w-[48%] ${visible ? "opacity-100" : "opacity-0"}`}>
          {/* The existing product photo is decorative; the title names the product. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={imageUrl} src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain object-center p-3 sm:p-4" />
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#101b20_0%,#101b20_48%,rgba(16,27,32,.75)_55%,rgba(16,27,32,.08)_68%,transparent_80%)]" />
      <button type="button" onClick={() => { if (current.sku && profile?.role !== "ADMIN") recordActivity(session, { type: "announcement_click", sku: current.sku, name: current.title }); onOpenProduct(current.sku); }} className="group relative flex min-h-[210px] w-full items-center px-5 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300 sm:min-h-[224px] sm:px-7" aria-label={current.sku ? `${label}: ${current.title}. Ver producto` : `${label}: ${current.title}`}>
        <span className={`block min-w-0 ${imageUrl ? "w-[54%]" : "w-full"} transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}>
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em] text-emerald-200 sm:text-[10px]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-300" />{label}
          </span>
          <span className="block text-xl font-black leading-[1.15] tracking-[-.025em] text-white sm:text-2xl">{current.title}</span>
          {current.sku && <span className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-white">Ver producto<span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-white/10 transition-transform group-hover:translate-x-1">→</span></span>}
        </span>
      </button>
      {items.length > 1 && (
        <div className="relative flex items-center gap-1.5 px-5 pb-4 sm:px-7">
          {items.slice(0, 5).map((item, itemIndex) => (
            <span key={item.id} className={`h-1 rounded-full transition-all duration-300 ${itemIndex === index % items.length ? "w-8 bg-white" : "w-2 bg-white/25"}`} />
          ))}
          <span className={`ml-auto text-[9px] font-bold uppercase tracking-[.16em] ${imageUrl ? "text-[#40534d]" : "text-white/35"}`}>LOOP · {isStockNotice ? "STOCK" : "AVISOS"}</span>
        </div>
      )}
    </section>
  );
}
