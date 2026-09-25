import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Primero iniciá sesión." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return NextResponse.json({ error: "No se pueden modificar pedidos en este momento." }, { status: 503 });

    // Verify the bearer token with Auth; never trust an ID supplied by the client.
    const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) return NextResponse.json({ error: "Tu sesión venció. Volvé a iniciar sesión." }, { status: 401 });
    let body: Record<string, unknown>;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid body");
      body = input as Record<string, unknown>;
    } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
    if (typeof body.orderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.orderId)
      || (body.action !== "cancel" && body.action !== "remove_item")
      || typeof body.expectedUpdatedAt !== "string" || body.expectedUpdatedAt.length > 50 || !Number.isFinite(Date.parse(body.expectedUpdatedAt))
      || (body.action === "remove_item" && (!Number.isInteger(body.itemIndex) || Number(body.itemIndex) < 0))) {
      return NextResponse.json({ error: "Pedido o acción inválidos." }, { status: 400 });
    }
    // A locked database transaction validates ownership/state/version, preserves
    // the audit trail and calculates totals from stored items. No service key.
    const { data: updated, error } = await userClient.rpc("change_customer_order", {
      p_order_id: body.orderId,
      p_action: body.action,
      p_item_index: body.action === "remove_item" ? body.itemIndex : null,
      p_expected_updated_at: body.expectedUpdatedAt,
    });
    if (error) {
      const status = ({ PT400: 400, PT401: 401, PT404: 404, PT409: 409 } as Record<string, number>)[error.code];
      if (status) return NextResponse.json({ error: error.message }, { status });
      throw error;
    }
    if (!updated) throw new Error("Missing updated order");
    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("[orders/customer] update failed", error instanceof Error ? error.message : "Database error");
    return NextResponse.json({ error: "No se pudo modificar el pedido. Intentá nuevamente." }, { status: 500 });
  }
}
