import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { runSheetSync } from "@/lib/sync/run-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LogRow {
  sync_id: string;
  iniciado_at: string;
  fuente: string;
  estado: string;
  filas_leidas: number;
  skus_vistos: number;
  creados: number;
  actualizados: number;
  sin_cambios: number;
  saltados_invalidos: number;
  despublicados: number;
  duracion_ms: number | null;
  motivo: string | null;
}

async function syncAction(formData: FormData): Promise<void> {
  "use server";
  const secret = formData.get("secret");
  if (!process.env.SYNC_SECRET || secret !== process.env.SYNC_SECRET) return;
  try {
    await runSheetSync({ fuente: "manual" });
  } catch {
    // el error queda registrado igual; la tabla lo muestra en la próxima carga
  }
  revalidatePath("/");
  revalidatePath("/estado-sync");
}

function fmt(d: string): string {
  try {
    return new Date(d).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return d;
  }
}

export default async function EstadoSyncPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;
  const authorized = !!process.env.SYNC_SECRET && secret === process.env.SYNC_SECRET;

  if (!authorized) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-extrabold text-texto">Estado de sincronización</h1>
        <p className="mt-2 text-sm text-texto-suave">
          Acceso restringido. Abrí esta página con <code>?secret=TU_SYNC_SECRET</code>.
        </p>
      </main>
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let logs: LogRow[] = [];
  let error = "";
  if (!url || !key) {
    error = "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.";
  } else {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error: e } = await supabase
      .from("sync_logs")
      .select("*")
      .order("iniciado_at", { ascending: false })
      .limit(15);
    if (e) error = e.message;
    else logs = (data ?? []) as LogRow[];
  }

  const last = logs[0];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-extrabold text-texto">Estado de sincronización</h1>
          <p className="text-sm text-texto-suave">Google Sheets (Catalogo) → Supabase → web</p>
        </div>
        <form action={syncAction}>
          <input type="hidden" name="secret" value={secret} />
          <button
            type="submit"
            className="rounded-md border border-acero bg-acero-tenue px-4 py-2.5 text-sm font-extrabold text-texto hover:bg-grafito"
          >
            Sincronizar ahora
          </button>
        </form>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-titanio">
          {error}
        </p>
      )}

      {last && (
        <div className="mb-6 rounded-xl border border-borde-fuerte bg-fondo-2 p-4">
          <p className="text-xs uppercase tracking-wide text-texto-suave">Última corrida</p>
          <p className="mt-1 text-sm text-texto">
            <span className="font-bold">{last.estado.toUpperCase()}</span> · {fmt(last.iniciado_at)} · fuente {last.fuente}
          </p>
          <p className="mt-2 text-sm text-texto-suave">
            Leídas {last.filas_leidas} · vistos {last.skus_vistos} · nuevas {last.creados} · actualizadas{" "}
            {last.actualizados} · sin cambios {last.sin_cambios} · rechazadas {last.saltados_invalidos} · despublicadas{" "}
            {last.despublicados}
            {last.duracion_ms != null ? ` · ${last.duracion_ms} ms` : ""}
          </p>
          {last.motivo && <p className="mt-1 text-xs text-titanio">{last.motivo}</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-borde">
        <table className="w-full text-left text-xs">
          <thead className="bg-superficie text-texto-suave">
            <tr>
              {["Fecha", "Fuente", "Estado", "Leídas", "Vistos", "Nuevas", "Actual.", "Sin camb.", "Rechaz.", "Despub.", "ms", "Motivo"].map(
                (h) => (
                  <th key={h} className="px-2 py-2 font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.sync_id} className="border-t border-borde/70 text-texto">
                <td className="px-2 py-2 whitespace-nowrap">{fmt(l.iniciado_at)}</td>
                <td className="px-2 py-2">{l.fuente}</td>
                <td className="px-2 py-2 font-semibold">{l.estado}</td>
                <td className="px-2 py-2">{l.filas_leidas}</td>
                <td className="px-2 py-2">{l.skus_vistos}</td>
                <td className="px-2 py-2">{l.creados}</td>
                <td className="px-2 py-2">{l.actualizados}</td>
                <td className="px-2 py-2">{l.sin_cambios}</td>
                <td className="px-2 py-2">{l.saltados_invalidos}</td>
                <td className="px-2 py-2">{l.despublicados}</td>
                <td className="px-2 py-2">{l.duracion_ms ?? ""}</td>
                <td className="max-w-[220px] truncate px-2 py-2 text-titanio" title={l.motivo ?? ""}>
                  {l.motivo ?? ""}
                </td>
              </tr>
            ))}
            {logs.length === 0 && !error && (
              <tr>
                <td colSpan={12} className="px-2 py-6 text-center text-texto-suave">
                  Todavía no hay corridas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
