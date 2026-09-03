import type { PublicProduct } from "@/types/product";
import { ProductCard } from "./ProductCard";

interface SectionRowProps {
  title: string;
  products: ReadonlyArray<PublicProduct>;
  max?: number;
  onShowAll?: () => void;
}

export function SectionRow({ title, products, max = 3, onShowAll }: SectionRowProps) {
  if (products.length === 0) return null;
  const visibles = products.slice(0, max);

  return (
    <section aria-label={title} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-texto">
          <span aria-hidden className="h-3 w-0.5 rounded bg-acero" />
          {title}
        </h2>
        {onShowAll && products.length > visibles.length && (
          <button
            type="button"
            onClick={onShowAll}
            className="text-xs font-semibold text-titanio transition-colors hover:text-acero-fuerte"
          >
            Ver todos →
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {visibles.map((product) => (
          <ProductCard key={product.sku} product={product} />
        ))}
      </div>
    </section>
  );
}
