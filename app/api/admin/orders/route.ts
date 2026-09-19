import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { WhatsAppOrderRow } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const validStatuses = new Set<WhatsAppOrderRow["estado"]>(["NUEVO", "CONFIRMADO", "PREPARADO", "ENTREGADO", "CANCELADO"]);

function adminClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Falta configurar Supabase en el servidor.");
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
}
async function requireAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabase = adminClient(token);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;
  const { data: profile } = await supabase.from("profiles").select("id,role").eq("id", authData.user.id).maybeSingle();
  if (profile?.role !== "ADMIN") return null;
  return { supabase, adminId: authData.user.id };
}
export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const { data: orders, error: ordersError } = await admin.supabase.from("whatsapp_orders").select("*").order("created_at", { ascending: false }).limit(100);
    if (ordersError) throw ordersError;
    const userIds = [...new Set((orders ?? []).map((order) => order.user_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
    let profiles = new Map<string, { email: string | null; role: string | null }>();
    let requests = new Map<string, { service_local: string | null; whatsapp: string | null }>();
    if (userIds.length > 0) {
      const [profilesResult, requestsResult] = await Promise.all([
        admin.supabase.from("profiles").select("id,email,nombre,role").in("id", userIds),
        admin.supabase.from("account_requests").select("user_id,service_local,whatsapp,created_at").in("user_id", userIds).order("created_at", { ascending: false }),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (requestsResult.error) throw requestsResult.error;
      profiles = new Map((profilesResult.data ?? []).map((profile) => [String(profile.id), profile]));
      for (const accountRequest of requestsResult.data ?? []) {
        const userId = String(accountRequest.user_id);
        if (!requests.has(userId)) requests.set(userId, { service_local: accountRequest.service_local, whatsapp: accountRequest.whatsapp });
      }
    }
    const enrichedOrders = (orders ?? []).map((order) => {
      const userId = order.user_id as string | null;
      const profile = userId ? profiles.get(userId) : undefined;
      const accountRequest = userId ? requests.get(userId) : undefined;
      return { ...order, email: profile?.email ?? null, role: profile?.role ?? null, service_local: accountRequest?.service_local ?? null, whatsapp: order.customer_phone ?? accountRequest?.whatsapp ?? null, customer_type: !userId ? "INVITADO" : profile?.role === "MAYORISTA" ? "MAYORISTA" : "TECNICO" };
    });
    return NextResponse.json({ orders: enrichedOrders });
  } catch (error) {
    console.error("[admin/orders] error al listar", error);
    return NextResponse.json({ error: "No se pudieron cargar los pedidos." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  let body: { orderId?: string; estado?: WhatsAppOrderRow["estado"] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  if (!body.orderId || !body.estado || !validStatuses.has(body.estado)) return NextResponse.json({ error: "Estado o pedido inválido." }, { status: 400 });
  const { data, error } = await admin.supabase.from("whatsapp_orders").update({ estado: body.estado }).eq("id", body.orderId).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "El pedido no existe." }, { status: 404 });
  return NextResponse.json({ order: data });
}
