import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import type { WhatsAppOrderRow } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const validStatuses = new Set<WhatsAppOrderRow["estado"]>(["NUEVO", "CONFIRMADO", "PREPARADO", "ENTREGADO", "CANCELADO"]);

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const { data: orders, error: ordersError } = await admin.supabase.from("whatsapp_orders").select("*").eq("hidden_by_admin", false).order("created_at", { ascending: false }).limit(100);
    if (ordersError) throw ordersError;
    const userIds = [...new Set((orders ?? []).map((order) => order.user_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
    let profiles = new Map<string, { email: string | null; role: string | null }>();
    const requests = new Map<string, { service_local: string | null; whatsapp: string | null }>();
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
  let body: { orderId?: string; estado?: WhatsAppOrderRow["estado"]; customerMessage?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.orderId)
    || (body.estado !== undefined && !validStatuses.has(body.estado))
    || (body.customerMessage !== undefined && (typeof body.customerMessage !== 'string' || body.customerMessage.length > 500))
    || (body.estado === undefined && body.customerMessage === undefined)) return NextResponse.json({ error: "Estado, mensaje o pedido inválido." }, { status: 400 });
  const changes = { ...(body.estado !== undefined ? {estado: body.estado} : {}), ...(body.customerMessage !== undefined ? {customer_message: body.customerMessage.trim()} : {}) };
  const { data, error } = await admin.supabase.from("whatsapp_orders").update(changes).eq("id", body.orderId).eq("hidden_by_admin", false).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "El pedido no existe." }, { status: 404 });
  return NextResponse.json({ order: data });
}
export async function DELETE(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    let body: { orderId?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
    if (!body.orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.orderId)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    const { data, error } = await admin.supabase.from("whatsapp_orders").update({ hidden_by_admin: true }).eq("id", body.orderId).eq("hidden_by_admin", false).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "El pedido no existe o ya fue ocultado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/orders] error al ocultar duplicado", error);
    return NextResponse.json({ error: "No se pudo quitar el pedido duplicado." }, { status: 500 });
  }
}
