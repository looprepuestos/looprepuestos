import { Header } from "@/components/layout/Header";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { CartBar } from "@/components/cart/CartBar";
import { CartProvider } from "@/lib/cart/CartContext";
import { getPublicCatalog, deriveFacets } from "@/lib/db/catalog";

// Catálogo cacheado (ISR): se regenera periódicamente, no en cada request.
export const revalidate = 300;

export default async function HomePage() {
  const products = await getPublicCatalog();
  const { marcas, tipos, modelos, calidades, marcos } = deriveFacets(products);

  return (
    <CartProvider products={products}>
      <div className="min-h-dvh">
        <Header />

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8">
          <div className="mb-6 grid gap-4 border-b border-borde/70 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-acero-fuerte">
                Catálogo profesional
              </p>
              <h1 className="max-w-2xl text-2xl font-black tracking-[-0.035em] text-texto sm:text-3xl">
                El repuesto que buscás, sin perder tiempo.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-texto-suave sm:text-base">
                Consultá disponibilidad, compará calidades y armá tu pedido directo por WhatsApp.
              </p>
            </div>
            <div className="flex items-center gap-5 rounded-xl border border-borde bg-fondo-2/70 px-4 py-3 lg:min-w-64">
              <div>
                <p className="text-lg font-black tabular-nums text-texto">{products.length}</p>
                <p className="text-xs text-texto-suave">repuestos publicados</p>
              </div>
              <div className="h-8 w-px bg-borde" />
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold text-texto"><span className="h-2 w-2 rounded-full bg-stock-on" />Actualizado</p>
                <p className="text-xs text-texto-suave">stock visible</p>
              </div>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-borde bg-superficie px-6 py-14 text-center">
              <p className="text-sm font-semibold text-texto">
                Estamos actualizando el catálogo
              </p>
              <p className="mt-1 text-xs text-texto-suave">
                Volvé a intentar en unos minutos.
              </p>
            </div>
          ) : (
            <CatalogShell products={products} marcas={marcas} tipos={tipos} modelos={modelos} calidades={calidades} marcos={marcos} />
          )}
        </main>

        <CartBar />
      </div>
    </CartProvider>
  );
}
