import Image from "next/image";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "loop_preview_access";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function sameSecret(a: string, b: string) {
  const left = digest(a);
  const right = digest(b);
  return timingSafeEqual(left, right);
}

function accessToken(password: string) {
  return createHash("sha256")
    .update(`loop-preview:${password}`)
    .digest("hex");
}

export async function hasPreviewAccess() {
  const password = process.env.LOOP_PREVIEW_PASSWORD;

  // Fail closed in production: if the protection variable is missing,
  // nobody receives access accidentally.
  if (!password) return false;

  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (!cookie) return false;

  return sameSecret(cookie, accessToken(password));
}

async function unlockPreview(formData: FormData) {
  "use server";

  const configuredPassword = process.env.LOOP_PREVIEW_PASSWORD;
  const submittedPassword = String(formData.get("password") ?? "");

  if (!configuredPassword || !sameSecret(submittedPassword, configuredPassword)) {
    redirect("/?access=incorrecta");
  }

  const store = await cookies();
  store.set(COOKIE_NAME, accessToken(configuredPassword), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect("/");
}

export function PreviewAccessGate({ incorrect = false }: { incorrect?: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-fondo px-5 py-10">
      <section className="w-full max-w-md rounded-card border border-borde bg-superficie p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src="/logo-loop.png"
            alt="LOOP REPUESTOS"
            width={92}
            height={92}
            priority
            className="mb-4 h-[92px] w-[92px] object-contain"
          />
          <p className="text-xs font-semibold tracking-[0.2em] text-acero">ACCESO PRIVADO</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-texto">LOOP REPUESTOS</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-texto-suave">
            Estamos terminando el nuevo catálogo. Ingresá la clave de acceso para continuar.
          </p>
        </div>

        <form action={unlockPreview} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-texto">
              Clave de acceso
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="w-full rounded-lg border border-borde-fuerte bg-fondo-2 px-4 py-3 text-base text-texto placeholder:text-titanio focus:border-acero focus:outline-none"
              placeholder="Ingresá la clave"
            />
            {incorrect ? (
              <p className="mt-2 text-sm text-red-300">La clave no es correcta. Probá nuevamente.</p>
            ) : null}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg border border-acero bg-acero-tenue px-4 py-3 text-sm font-semibold text-texto transition hover:bg-grafito"
          >
            INGRESAR
          </button>
        </form>

        <p className="mt-6 border-t border-borde pt-4 text-center text-xs leading-5 text-titanio">
          Sitio en etapa de preparación · Acceso exclusivo LOOP
        </p>
      </section>
    </main>
  );
}
