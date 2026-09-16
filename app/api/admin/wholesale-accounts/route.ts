import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AccountAction = "revoke" | "delete";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Falta configurar Supabase en el servidor.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profile?.role !== "ADMIN") return null;
  return { supabase, adminId: authData.user.id };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { data, error } = await admin.supabase
    .from("profiles")
    .select("id,email,nombre,role,created_at,updated_at")
    .eq("role", "MAYORISTA")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { userId?: string; action?: AccountAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!body.userId || !["revoke", "delete"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "Faltan datos de la acción." }, { status: 400 });
  }
  if (body.userId === admin.adminId) {
    return NextResponse.json({ error: "No podés modificar tu propia cuenta administradora." }, { status: 400 });
  }

  const { data: target, error: targetError } = await admin.supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", body.userId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json({ error: "La cuenta ya no existe." }, { status: 404 });
  }
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "No se puede modificar otra cuenta administradora." }, { status: 403 });
  }

  // Siempre se revoca primero: aunque la eliminación falle por conservar un
  // historial, el usuario deja de recibir precios mayoristas inmediatamente.
  const { error: revokeError } = await admin.supabase
    .from("profiles")
    .update({ role: "PUBLICO" })
    .eq("id", body.userId);

  if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });
  if (body.action === "revoke") return NextResponse.json({ ok: true });

  const { error: deleteError } = await admin.supabase.auth.admin.deleteUser(body.userId);
  if (deleteError) {
    return NextResponse.json(
      {
        error: "Se quitó el acceso mayorista, pero no se pudo eliminar la cuenta porque tiene información histórica asociada.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
