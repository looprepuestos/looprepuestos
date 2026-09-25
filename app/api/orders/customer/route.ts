import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { WhatsAppOrderRow } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Primero iniciá sesión." }, { status: 401 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "No se pueden modificar pedidos en este momento." }, { status: 503 });

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
      || typeof body.expectedUpdatedAt !== "string" || body.expectedUpdatedAt.length > 50
      || (body.action === "remove_item" && (!Number.isInteger(body.itemIndex) || Number(body.itemIndex) < 0))) {
      return NextResponse.json({ error: "Pedido o acción inválidos." }, { status: 400 });
    }
    const { data, error: readError } = await userClient.from("whatsapp_orders").select("*").eq("id", body.orderId).eq("user_id", auth.user.id).eq("hidden_by_admin", false).maybeSingle();
    if (readError) throw readError;
    if (!data) return NextResponse.json({ error: "No se encontró el pedido." }, { status: 404 });
    const order = data as WhatsAppOrderRow;
    if (order.estado !== "NUEVO") return NextResponse.json({ error: "Solo podés modificar pedidos nuevos. Para este pedido, coordiná el cambio con LOOP." }, { status: 409 });
    if (order.updated_at !== body.expectedUpdatedAt) return NextResponse.json({ error: "El pedido cambió. Actualizá el historial antes de continuar." }, { status: 409 });
    const itemIndex = Number(body.itemIndex);
    if (body.action === "remove_item" && itemIndex >= order.items.length) return NextResponse.json({ error: "El producto ya no está en el pedido. Actualizá el historial." }, { status: 409 });

    const cancel = body.action === "cancel" || order.items.length === 1;
    // Cancellation retains the original items and total as a historical record.
    const items = cancel ? order.items : order.items.filter((_, index) => index !== itemIndex);
    const total = cancel ? Number(order.total_estimated) : Math.round(items.reduce((sum, item) => sum + Number(item.subtotal), 0) * 100) / 100;
    if (!Number.isFinite(total) || total < 0) throw new Error("Invalid stored order total");
    const removed = order.items[itemIndex];
    if (!cancel && !removed) return NextResponse.json({ error: "Producto inválido." }, { status: 400 });
    const description = cancel || !removed ? "Cliente canceló el pedido." : `Cliente quitó ${removed.cantidad}× ${removed.nombre} (${removed.sku}), subtotal $${removed.subtotal}.`;
    const stamp = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba" });
    const notes = [order.notes, `[${stamp}] ${description}`].filter(Boolean).join("\n");
    // The service key stays server-side. Ownership, state and version are checked
    // again atomically so simultaneous edits/admin confirmation cannot be lost.
    const writer = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: updated, error } = await writer.from("whatsapp_orders")
      .update({ items, total_estimated: total, estado: cancel ? "CANCELADO" : "NUEVO", notes })
      .eq("id", order.id).eq("user_id", auth.user.id).eq("estado", "NUEVO")
      .eq("hidden_by_admin", false).eq("updated_at", order.updated_at).select("*").maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ error: "El pedido cambió mientras lo modificabas. Actualizá el historial." }, { status: 409 });
    return NextResponse.json({ order: updated });
  } catch (error) {
    console.error("[orders/customer] update failed", error instanceof Error ? error.message : "Database error");
    return NextResponse.json({ error: "No se pudo modificar el pedido. Intentá nuevamente." }, { status: 500 });
  }
}
