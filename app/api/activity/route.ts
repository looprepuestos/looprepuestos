import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origen inválido." }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Estadísticas no disponibles." }, { status: 503 });

  let body: { sessionId?: unknown; type?: unknown; term?: unknown; results?: unknown; sku?: unknown; name?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Datos inválidos." }, { status: 400 }); }
  if (typeof body.sessionId !== "string" || !uuid.test(body.sessionId) || !["visit", "search", "product_view"].includes(String(body.type))) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }
  const eventType = body.type as "visit" | "search" | "product_view";
  const term = typeof body.term === "string" ? body.term.trim().replace(/\s+/g, " ").slice(0, 80) : "";
  const sku = typeof body.sku === "string" ? body.sku.trim().slice(0, 100) : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 180) : "";
  if (eventType === "search" && (term.length < 2 || !Number.isInteger(body.results) || (body.results as number) < 0 || (body.results as number) > 10000)) return Response.json({ error: "Búsqueda inválida." }, { status: 400 });
  if (eventType === "product_view" && (!sku || !name)) return Response.json({ error: "Producto inválido." }, { status: 400 });

  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
  let userId: string | null = null;
  if (token) {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Sesión inválida." }, { status: 401 });
    userId = data.user.id;
  }
  const { error } = await client.from("catalog_activity").insert({
    user_id: userId, session_id: body.sessionId, event_type: eventType,
    search_term: eventType === "search" ? term : null,
    result_count: eventType === "search" ? body.results : null,
    product_sku: eventType === "product_view" ? sku : null,
    product_name: eventType === "product_view" ? name : null,
  });
  if (error) {
    console.error("[activity] no se pudo registrar", error.code);
    return Response.json({ error: "No se pudo registrar la actividad." }, { status: 503 });
  }
  return Response.json({ ok: true }, { status: 201 });
}
