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

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-5">
          <div className="mb-5">
            <h1 className="text-lg font-extrabold tracking-tight text-texto">
              Encontrá tu repuesto
            </h1>
            <p className="text-sm text-texto-suave">
              Buscá por modelo, tipo o SKU y armá tu pedido sin salir del
              catálogo.
            </p>
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
