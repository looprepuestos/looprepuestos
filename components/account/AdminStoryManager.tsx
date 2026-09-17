"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import type { WebStoryRow } from "@/types/database";

const MAX_BYTES = 30 * 1024 * 1024;
const MAX_SECONDS = 30;

function extensionFor(file: File) {
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  return "";
}

async function videoDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("No se pudo leer el video."));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AdminStoryManager({ session }: { session: Session }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState<WebStoryRow | null>(null);
  const [title, setTitle] = useState("Nuevos ingresos");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentIsLive, setCurrentIsLive] = useState(false);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
  }, [session.access_token]);

  const loadCurrent = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("web_stories").select("*").eq("id", 1).maybeSingle();
    const story = (data as WebStoryRow | null) ?? null;
    setCurrent(story);
    setCurrentIsLive(Boolean(story?.active && new Date(story.expires_at).getTime() > Date.now()));
  }, [supabase]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadCurrent());
    return () => window.cancelAnimationFrame(frame);
  }, [loadCurrent]);

  async function publish() {
    if (!supabase || !file) return;
    setWorking(true);
    setError("");
    setMessage("");

    try {
      const extension = extensionFor(file);
      if (!extension) throw new Error("Usá un video MP4, WEBM o MOV.");
      if (file.size > MAX_BYTES) throw new Error("El video supera 30 MB. Recortalo o comprimilo.");
      const duration = await videoDuration(file);
      if (!Number.isFinite(duration) || duration > MAX_SECONDS) throw new Error("El video debe durar 30 segundos o menos.");

      const objectPath = `stories/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("story-videos").upload(objectPath, file, {
        contentType: file.type,
        cacheControl: "86400",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("story-videos").getPublicUrl(objectPath);
      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
      const { data, error: saveError } = await supabase
        .from("web_stories")
        .upsert({
          id: 1,
          title: title.trim() || "Nuevos ingresos",
          video_url: publicUrl.publicUrl,
          object_path: objectPath,
          button_text: "Ver catálogo",
          active: true,
          starts_at: startsAt.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select("*")
        .single();

      if (saveError) {
        await supabase.storage.from("story-videos").remove([objectPath]);
        throw saveError;
      }

      if (current?.object_path && current.object_path !== objectPath) {
        await supabase.storage.from("story-videos").remove([current.object_path]);
      }

      setCurrent(data as WebStoryRow);
      setCurrentIsLive(true);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Historia publicada. Se ocultará sola dentro de 24 horas.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo publicar la historia.");
    } finally {
      setWorking(false);
    }
  }

  async function deactivate() {
    if (!supabase || !current) return;
    setWorking(true);
    setError("");
    const { error: updateError } = await supabase.from("web_stories").update({ active: false }).eq("id", current.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      setCurrent({ ...current, active: false });
      setCurrentIsLive(false);
      setMessage("Historia desactivada.");
    }
    setWorking(false);
  }

  return (
    <section className="mb-5 rounded-xl border border-borde bg-fondo-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-sm font-black text-texto">Historia LOOP</h3><p className="mt-1 text-xs leading-5 text-texto-suave">Subí un video corto y se ocultará automáticamente a las 24 horas.</p></div>
        {currentIsLive && <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-black uppercase text-green-700">Publicada</span>}
      </div>

      {current && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-borde bg-white p-2.5">
          <video src={current.video_url} muted playsInline preload="metadata" className="h-20 w-14 shrink-0 rounded-md bg-black object-cover" />
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-texto">{current.title}</p><p className="mt-1 text-[11px] text-texto-suave">{currentIsLive ? `Activa hasta ${new Date(current.expires_at).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}` : "No está visible"}</p></div>
          {currentIsLive && <button type="button" disabled={working} onClick={() => void deactivate()} className="shrink-0 text-[11px] font-bold text-red-600 disabled:opacity-50">Quitar</button>}
        </div>
      )}

      <div className="mt-3 space-y-3">
        <div><label className="mb-1 block text-xs font-bold text-texto">Título</label><input maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Llegaron baterías nuevas" className="h-10 w-full rounded-lg border border-borde-fuerte bg-white px-3 text-sm" /></div>
        <div><label className="mb-1 block text-xs font-bold text-texto">Video vertical</label><input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-xs text-texto-suave file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-bold file:text-texto" /><p className="mt-1 text-[10px] text-titanio">Ideal: MP4 vertical, 8–15 segundos. Máximo 30 MB y 30 segundos.</p></div>
        <button type="button" disabled={!file || working} onClick={() => void publish()} className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{working ? "Publicando…" : current ? "Reemplazar historia por 24 h" : "Publicar por 24 h"}</button>
      </div>
      {message && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">{message}</p>}
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
    </section>
  );
}
