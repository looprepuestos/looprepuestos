import type { Session } from "@supabase/supabase-js";

function sessionId() {
  try {
    let id = window.sessionStorage.getItem("loop-activity-session");
    if (!id) { id = crypto.randomUUID(); window.sessionStorage.setItem("loop-activity-session", id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

export function recordActivity(session: Session | null, event: { type: "visit" } | { type: "search"; term: string; results: number } | { type: "product_view"; sku: string; name: string }) {
  if (typeof window === "undefined") return;
  void fetch("/api/activity", {
    method: "POST", keepalive: true,
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify({ sessionId: sessionId(), ...event }),
  }).catch(() => { /* El catálogo sigue funcionando sin estadísticas. */ });
}
