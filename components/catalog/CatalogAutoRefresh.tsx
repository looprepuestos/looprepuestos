"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

/** Actualiza los datos del servidor sin recargar ni reiniciar la UI del cliente. */
export function CatalogAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      // Al volver a una pestaña pueden llegar focus y visibilitychange juntos.
      if (now - lastRefresh < 5000) return;
      lastRefresh = now;
      startTransition(() => router.refresh());
    };

    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
