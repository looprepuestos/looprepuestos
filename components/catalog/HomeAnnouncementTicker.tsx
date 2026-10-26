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
    <section aria-label="Novedades de stock" className="relative isolate overflow-hidden rounded-2xl border border-[#cbdcd3] bg-[#e9f0ec] shadow-[0_12px_30px_rgba(24,55,42,.09)]">
      {imageUrl && (
        <div aria-hidden className={`pointer-events-none absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}>
          {/* The existing product photo is decorative; the title names the product. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={imageUrl} src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-y-0 right-0 h-full w-[65%] object-contain object-center mix-blend-multiply [mask-image:linear-gradient(90deg,transparent,black_22%,black_88%,transparent)] sm:w-[59%]" />
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#e9f0ec_0%,rgba(233,240,236,.98)_25%,rgba(233,240,236,.82)_42%,rgba(233,240,236,.3)_58%,transparent_76%)]" />
      <button type="button" onClick={() => { if (current.sku && profile?.role !== "ADMIN") recordActivity(session, { type: "announcement_click", sku: current.sku, name: current.title }); onOpenProduct(current.sku); }} className="group relative flex min-h-[210px] w-full items-center px-5 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300 sm:min-h-[224px] sm:px-7" aria-label={current.sku ? `${label}: ${current.title}. Ver producto` : `${label}: ${current.title}`}>
        <span className={`block min-w-0 ${imageUrl ? "w-[65%] sm:w-[61%]" : "w-full"} transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}>
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-800/15 bg-white/45 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em] text-emerald-900 sm:text-[10px]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-700" />{label}
          </span>
          <span className="block text-xl font-black leading-[1.15] tracking-[-.025em] text-[#15392d] sm:text-2xl">{current.title}</span>
          {current.sku && <span className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-[#205b45]">Ver producto<span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-900/20 bg-white/40 transition-transform group-hover:translate-x-1">→</span></span>}
        </span>
      </button>
      {items.length > 1 && (
        <div className="relative flex items-center gap-1.5 px-5 pb-4 sm:px-7">
          {items.slice(0, 5).map((item, itemIndex) => (
            <span key={item.id} className={`h-1 rounded-full transition-all duration-300 ${itemIndex === index % items.length ? "w-8 bg-[#205b45]" : "w-2 bg-[#205b45]/20"}`} />
          ))}
          <span className="ml-auto text-[9px] font-bold uppercase tracking-[.16em] text-[#405b4f]/70">LOOP · {isStockNotice ? "STOCK" : "AVISOS"}</span>
        </div>
      )}
    </section>
  );
}
