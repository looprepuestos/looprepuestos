import { requireAdmin } from "@/lib/admin-auth";

type RequestRow = {
  sku: string;
  whatsapp: string;
  products: { nombre: string; stock_sheet: number; publicado: boolean; tipo: string; compatibilidad: string | null };
};

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ ok: false }, { status: 403 });

  const { data, error } = await admin.supabase.from("restock_requests")
    .select("sku,whatsapp,products!inner(nombre,stock_sheet,publicado,tipo,compatibilidad)")
    .is("notified_at", null)
    .order("created_at").returns<RequestRow[]>();
  if (error) return Response.json({ ok: false }, { status: 500 });

  const parentSkus = [...new Set(data.flatMap(({ products }) =>
    products.tipo === "Tapa color" && products.stock_sheet > 0 && products.compatibilidad ? [products.compatibilidad] : []
  ))];
  const parents = parentSkus.length
    ? await admin.supabase.from("products").select("sku,nombre").in("sku", parentSkus).eq("publicado", true)
    : { data: [], error: null };
  if (parents.error) return Response.json({ ok: false }, { status: 500 });
  const publishedParents = new Map(parents.data?.map((parent) => [parent.sku, parent.nombre]));

  return Response.json(data.map(({ sku, whatsapp, products }) => {
    const parent = publishedParents.get(products.compatibilidad ?? "");
    return {
      sku,
      whatsapp,
      name: products.nombre,
      searchName: parent ?? products.nombre,
      ready: products.stock_sheet > 0 && (products.publicado || (products.tipo === "Tapa color" && !!parent)),
    };
  }));
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ ok: false }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.sku !== "string" || typeof body?.whatsapp !== "string") {
    return Response.json({ ok: false }, { status: 400 });
  }

  const { error } = await admin.supabase.from("restock_requests")
    .update({ notified_at: new Date().toISOString() })
    .eq("sku", body.sku).eq("whatsapp", body.whatsapp).is("notified_at", null);
  return Response.json({ ok: !error }, { status: error ? 500 : 200 });
}
