import { Header } from "@/components/layout/Header";
import { CatalogShell } from "@/components/catalog/CatalogShell";
import { CartBar } from "@/components/cart/CartBar";
import { CartProvider } from "@/lib/cart/CartContext";
import { getPublicCatalog, getPublicHighlights, deriveFacets } from "@/lib/db/catalog";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { AccountPanel } from "@/components/account/AccountPanel";

// Catálogo cacheado (ISR): se regenera periódicamente, no en cada request.
export const revalidate = 300;

export default async function HomePage() {
  const [products, highlights] = await Promise.all([getPublicCatalog(), getPublicHighlights()]);
  const { marcas, tipos, modelos, calidades, marcos } = deriveFacets(products);

  return (
    <AuthProvider>
      <CartProvider products={products}>
        <div className="min-h-dvh">
        <Header />

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:px-8">
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
            <CatalogShell products={products} highlights={highlights} marcas={marcas} tipos={tipos} modelos={modelos} calidades={calidades} marcos={marcos} />
          )}
        </main>

          <CartBar />
          <AccountPanel />
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
