import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runSheetSync } from "@/lib/sync/run-sync";

// Necesita Node (google-auth-library, service role) y ejecución dinámica.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincronización Google Sheets (pestaña Catalogo) -> Supabase.
 *  - GET  : lo dispara el cron de Vercel (Authorization: Bearer CRON_SECRET).
 *  - POST : disparo manual (botón), con ?secret=SYNC_SECRET o header Bearer.
 * Tras aplicar, revalida "/" para que la web refleje los cambios sin deploy.
 */
function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  const sync = process.env.SYNC_SECRET;
  const cron = process.env.CRON_SECRET;
  if (sync && (auth === `Bearer ${sync}` || secret === sync)) return true;
  if (cron && auth === `Bearer ${cron}`) return true; // cron de Vercel
  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const force = params.get("force") === "true";
  const fuente = params.get("fuente") ?? (req.method === "GET" ? "cron" : "manual");
  try {
    const log = await runSheetSync({ force, fuente });
    revalidatePath("/");
    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
