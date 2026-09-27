import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = { created_at: string; user_id: string | null; session_id: string; event_type: "visit" | "search" | "product_view"; search_term: string | null; result_count: number | null; product_sku: string | null; product_name: string | null };

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return Response.json({ error: "No autorizado." }, { status: 401 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return Response.json({ error: "No autorizado." }, { status: 401 });
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profileError || profile?.role !== "ADMIN") return Response.json({ error: "No autorizado." }, { status: 403 });

  const days = new URL(request.url).searchParams.get("days") === "7" ? 7 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await client.from("catalog_activity")
    .select("created_at,user_id,session_id,event_type,search_term,result_count,product_sku,product_name")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(10000);
  if (error) return Response.json({ error: "No se pudo cargar la actividad." }, { status: 503 });
  const events = (data ?? []) as EventRow[];
  const ids = [...new Set(events.map((event) => event.user_id).filter((id): id is string => Boolean(id)))];
  const { data: profiles, error: namesError } = ids.length
    ? await client.from("profiles").select("id,nombre,email").in("id", ids)
    : { data: [], error: null };
  if (namesError) return Response.json({ error: "No se pudieron cargar los clientes." }, { status: 503 });
  const names = new Map((profiles ?? []).map((item) => [item.id, item.nombre || item.email || "Cliente"]));
  const counted = <T extends { key: string; count: number }>(rows: T[]) => rows.sort((a, b) => b.count - a.count).slice(0, 10);
  const visitorCounts = new Map<string, { key: string; name: string; count: number }>();
  const searches = new Map<string, { key: string; count: number; noResults: number }>();
  const products = new Map<string, { key: string; name: string; count: number }>();
  let visits = 0;
  let anonymous = 0;
  for (const event of events) {
    if (event.event_type === "visit") {
      visits++;
      if (!event.user_id) anonymous++;
      else {
        const current = visitorCounts.get(event.user_id) ?? { key: event.user_id, name: names.get(event.user_id) ?? "Cliente", count: 0 };
        current.count++;
        visitorCounts.set(event.user_id, current);
      }
    } else if (event.event_type === "search" && event.search_term) {
      const key = event.search_term.toLocaleLowerCase("es-AR");
      const current = searches.get(key) ?? { key: event.search_term, count: 0, noResults: 0 };
      current.count++;
      if (event.result_count === 0) current.noResults++;
      searches.set(key, current);
    } else if (event.event_type === "product_view" && event.product_sku) {
      const current = products.get(event.product_sku) ?? { key: event.product_sku, name: event.product_name ?? event.product_sku, count: 0 };
      current.count++;
      products.set(event.product_sku, current);
    }
  }
  return Response.json({ days, visits, anonymous, truncated: events.length === 10000,
    visitors: counted([...visitorCounts.values()]), searches: counted([...searches.values()]),
    withoutResults: [...searches.values()].filter((item) => item.noResults > 0).sort((a, b) => b.noResults - a.noResults).slice(0, 10),
    products: counted([...products.values()]),
    recent: events.slice(0, 30).map((item) => ({ at: item.created_at, type: item.event_type, name: item.user_id ? names.get(item.user_id) ?? "Cliente" : "Visitante anónimo", label: item.search_term ?? item.product_name ?? "Ingresó al catálogo", results: item.result_count })),
  }, { headers: { "Cache-Control": "no-store" } });
}
