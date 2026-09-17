"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { WebStoryRow } from "@/types/database";

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export function LoopStory() {
  const supabase = useMemo(() => publicClient(), []);
  const [story, setStory] = useState<WebStoryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase as NonNullable<typeof supabase>;
    let mounted = true;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    async function loadStory() {
      const now = new Date().toISOString();
      const { data } = await client
        .from("web_stories")
        .select("*")
        .eq("active", true)
        .lte("starts_at", now)
        .gt("expires_at", now)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!mounted || !data) return;
      const nextStory = data as WebStoryRow;
      setStory(nextStory);
      const delay = new Date(nextStory.expires_at).getTime() - Date.now();
      if (delay > 0) {
        expiryTimer = setTimeout(() => {
          setOpen(false);
          setStory(null);
        }, Math.min(delay, 2_147_000_000));
      }
    }

    void loadStory();
    return () => {
      mounted = false;
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [supabase]);

  if (!story) return null;

  function goToCatalog() {
    setOpen(false);
    window.setTimeout(() => document.getElementById("catalogo-loop")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <>
      <section aria-label="Historia LOOP" className="rounded-2xl border border-borde bg-white p-3 shadow-sm">
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 text-left">
          <span className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-black ring-2 ring-green-500 ring-offset-2">
            <video src={story.video_url} muted autoPlay loop playsInline preload="metadata" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/15 text-2xl text-white" aria-hidden>▶</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-green-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> Nuevo ingreso · 24 h
            </span>
            <span className="mt-1 block text-base font-black leading-tight text-texto">{story.title}</span>
            <span className="mt-1 block text-xs font-semibold text-texto-suave">Tocá para ver el video</span>
          </span>
          <span className="shrink-0 text-xl font-bold text-acero-fuerte" aria-hidden>›</span>
        </button>
      </section>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-3 sm:p-6" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={story.title} className="relative flex h-[min(86vh,760px)] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-black shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="absolute left-3 right-3 top-3 z-10 h-1 overflow-hidden rounded-full bg-white/35">
              <div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${progress}%` }} />
            </div>
            <div className="absolute left-4 right-4 top-7 z-10 flex items-center justify-between gap-3 text-white">
              <div className="min-w-0"><p className="truncate text-sm font-black">LOOP Repuestos</p><p className="text-[10px] font-semibold text-white/75">Nuevo ingreso</p></div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-xl" aria-label="Cerrar historia">×</button>
            </div>
            <video
              ref={videoRef}
              src={story.video_url}
              autoPlay
              playsInline
              controls
              className="h-full w-full object-contain"
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                setProgress(video.duration ? (video.currentTime / video.duration) * 100 : 0);
              }}
              onEnded={() => setOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent p-4 pt-16">
              <p className="mb-3 text-center text-base font-black text-white">{story.title}</p>
              <button type="button" onClick={goToCatalog} className="w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-texto shadow-lg">{story.button_text}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
