import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Item = { sku: string; nombre: string; cantidad: number; precio_unitario: number; subtotal: number };

export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: "Servicio no configurado." }, { status: 503 });
    const body = await request.json();
    const name = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const locality = typeof body.locality === "string" ? body.locality.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.replace(/[^\d+]/g, "") : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const items: Item[] = body.items;
    if (!name || name.length > 160 || !locality || locality.length > 120 || !/^\+?\d{8,15}$/.test(phone) || notes.length > 2000 || !["Envío", "Retiro"].includes(body.delivery) || !["Efectivo", "Transferencia"].includes(body.payment) || !Array.isArray(items) || items.length < 1 || items.length > 40 || items.some((item) => !item || typeof item.sku !== "string" || !item.sku.trim() || item.sku.length > 160 || typeof item.nombre !== "string" || !item.nombre.trim() || item.nombre.length > 250 || !Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 100 || !Number.isFinite(item.precio_unitario) || item.precio_unitario < 0 || !Number.isFinite(item.subtotal) || item.subtotal < 0) || !Number.isFinite(body.total) || body.total < 0 || body.total > 100000000) {
      return NextResponse.json({ error: "Revisá los datos del pedido y el teléfono." }, { status: 400 });
    }
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.from("whatsapp_orders").insert({ user_id: null, customer_name: name, customer_phone: phone, locality, delivery: body.delivery, payment_method: body.payment, notes: notes || null, items, total_estimated: body.total, estado: "NUEVO" });
    if (error) { console.error("[guest-orders] insert failed", error.code); return NextResponse.json({ error: "No se pudo registrar el pedido." }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
}
