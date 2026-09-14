import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { applySheetRows } from "@/lib/sync/run-sync";
import type { CsvRow } from "@/scripts/lib/catalog-mapper";

// Recibe el PUSH del Apps Script (Google Sheets) y aplica a Supabase.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  secret?: string;
  fuente?: string;
  force?: boolean;
  rows?: CsvRow[];
}

/**
 * POST { secret, rows: [{ sku, nombre, ... }], fuente?, force? }
 * - `rows`: filas de la pestaña Catalogo, keyed por encabezado (las manda el
 *   Apps Script que corre dentro del Sheet, como el dueño).
 * Aplica vía RPC atómica y revalida la home para reflejar sin deploy.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const secret = body.secret ?? new URL(req.url).searchParams.get("secret") ?? "";
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ ok: false, error: "faltan filas (rows)" }, { status: 400 });
  }

  try {
    const log = await applySheetRows(body.rows, {
      fuente: body.fuente ?? "sheet",
      force: body.force === true,
    });
    revalidatePath("/");
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
