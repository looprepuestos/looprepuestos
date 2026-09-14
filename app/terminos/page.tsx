import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export const metadata = {
  title: "Términos y condiciones | LOOP Repuestos",
};

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-fondo-2">
      <header className="border-b border-borde bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Volver al inicio de LOOP Repuestos">
            <Logo size={36} />
            <div className="leading-tight">
              <p className="text-sm font-black text-texto">LOOP <span className="text-plata">REPUESTOS</span></p>
              <p className="text-[10px] font-semibold text-titanio">Repuestos e insumos para celulares</p>
            </div>
          </Link>
          <Link href="/" className="rounded-lg border border-borde-fuerte px-3 py-2 text-xs font-bold text-texto-suave hover:text-texto">Volver al catálogo</Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <article className="rounded-2xl border border-borde bg-white p-5 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-acero-fuerte">LOOP Repuestos</p>
          <h1 className="mt-2 text-2xl font-black text-texto sm:text-3xl">Términos y condiciones</h1>

          <section className="mt-8">
            <h2 className="text-xl font-black text-texto">Condiciones de garantía</h2>
            <p className="mt-3 leading-7 text-texto-suave">
              LOOP Repuestos ofrece una garantía comercial de <strong className="text-texto">3 meses (90 días) desde la fecha de compra</strong>, que cubre exclusivamente defectos de fabricación, sin perjuicio de la garantía legal que pudiera corresponder.
            </p>
            <p className="mt-3 leading-7 text-texto-suave">
              Los módulos, flex, placas y demás repuestos deberán probarse con el equipo desarmado antes de su instalación definitiva.
            </p>
          </section>

          <section className="mt-7">
            <h3 className="text-base font-black text-texto">Estado necesario para solicitar una revisión</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-texto-suave">
              <li>Sin roturas, golpes ni rayaduras.</li>
              <li>Sin restos de pegamento.</li>
              <li>Sin flex cortados, doblados o dañados.</li>
              <li>Sin soldaduras ni modificaciones.</li>
              <li>Con sus films, sellos y etiquetas originales.</li>
              <li>En las mismas condiciones en las que fue entregado.</li>
            </ul>
          </section>

          <section className="mt-7">
            <h3 className="text-base font-black text-texto">Cobertura</h3>
            <p className="mt-3 text-sm leading-6 text-texto-suave">
              La garantía comercial no cubre daños provocados por instalación incorrecta, presión, humedad, temperatura, electricidad, golpes, manipulación o identificación incorrecta del modelo.
            </p>
          </section>

          <section className="mt-7">
            <h3 className="text-base font-black text-texto">Revisión y resolución</h3>
            <p className="mt-3 text-sm leading-6 text-texto-suave">
              La existencia de una falla de fabricación será verificada por LOOP Repuestos. Si corresponde, se realizará el cambio por el mismo producto. Si no hubiera disponibilidad, se ofrecerá un producto equivalente o saldo a favor, respetando siempre los derechos legales aplicables.
            </p>
          </section>

          <p className="mt-8 border-t border-borde pt-4 text-xs text-titanio">Versión vigente: 14 de septiembre de 2026.</p>
        </article>
      </main>
    </div>
  );
}
