import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const sku = body?.sku;
  const phone = typeof body?.phone === "string" && /^\+?[\d ().-]{10,28}$/.test(body.phone)
    ? body.phone.replace(/\D/g, "")
    : "";
  if (typeof sku !== "string" || !sku.trim() || sku.length > 200 || !/^[1-9]\d{9,14}$/.test(phone)) {
    return Response.json({ message: "Ingresá un número de WhatsApp con código de país y área." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ message: "Probá de nuevo en un rato." }, { status: 503 });

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("request_restock", { product_sku: sku, phone });
  if (error) {
    console.error("No se pudo guardar el aviso de stock", error.code);
    return Response.json({ message: "No pudimos guardar tu aviso. Probá de nuevo." }, { status: 503 });
  }
  if (!data) return Response.json({ message: "El stock cambió. Actualizá la página para consultar disponibilidad." }, { status: 409 });
  return Response.json({ ok: true });
}
