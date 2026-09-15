const BRANDS = ["Samsung", "Motorola", "iPhone", "Xiaomi", "TCL", "ZTE", "Tecno", "JCID"] as const;

export function CatalogHero() {
  return (
    <section
      aria-labelledby="catalog-hero-title"
      className="catalog-hero overflow-hidden rounded-[var(--radius-card)] border border-borde bg-white shadow-sm"
    >
      <div className="relative px-5 py-7 sm:px-8 sm:py-9">
        <div className="relative z-10 max-w-2xl">
          <span className="commercial-pill gap-2">
            <span aria-hidden className="catalog-hero-dot h-1.5 w-1.5 rounded-full bg-stock-on" />
            Pensado para técnicos
          </span>

          <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-acero-fuerte">
            LOOP Repuestos
          </p>
          <h1
            id="catalog-hero-title"
            className="mt-2 max-w-xl text-3xl font-black leading-[1.05] tracking-[-0.035em] text-texto sm:text-5xl"
          >
            Stock para entrega inmediata
          </h1>
          <p className="mt-4 max-w-lg text-sm font-medium leading-relaxed text-texto-suave sm:text-base">
            Repuestos e insumos para celulares <span aria-hidden>·</span> Gualeguay
          </p>

          <a
            href="#catalogo-loop"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-acero bg-acero px-5 py-2.5 text-sm font-extrabold text-white transition-colors hover:border-acero-fuerte hover:bg-acero-fuerte"
          >
            Ver catálogo
            <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </a>
        </div>

        <div aria-hidden className="catalog-hero-orbit catalog-hero-orbit-one" />
        <div aria-hidden className="catalog-hero-orbit catalog-hero-orbit-two" />
      </div>

      <div className="catalog-brand-ticker border-t border-borde bg-fondo-2 py-3" aria-label={`Marcas: ${BRANDS.join(", ")}`}>
        <div className="catalog-brand-track flex w-max items-center">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} className="flex shrink-0 items-center">
              {BRANDS.map((brand) => (
                <span key={`${copy}-${brand}`} className="flex items-center gap-4 px-4 text-[11px] font-black uppercase tracking-[0.09em] text-texto-suave sm:px-6 sm:text-xs">
                  {brand}
                  <span aria-hidden className="h-1 w-1 rounded-full bg-acero" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function InstagramBanner() {
  return (
    <aside className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-borde bg-white px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-borde bg-fondo-2 text-acero-fuerte">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.4" cy="6.6" r="0.8" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-black text-texto">Seguinos en Instagram</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-texto-suave sm:text-sm">
            Mirá antes que nadie los nuevos ingresos de LOOP Repuestos.
          </p>
        </div>
      </div>

      <a
        href="https://www.instagram.com/looprepuestos/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-acero px-4 py-2 text-xs font-extrabold text-acero-fuerte transition-colors hover:bg-acero-tenue"
      >
        Ver Instagram
        <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </a>
    </aside>
  );
}
