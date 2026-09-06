"use client";

import { useCart } from "@/lib/cart/CartContext";
import { Logo } from "./Logo";

/** Header funcional del MVP: identidad LOOP + acceso directo al pedido. */
export function Header() {
  const { totalItems, openCart } = useCart();

  return (
    <header className="loop-header sticky top-0 z-30 border-b border-[#29323a] bg-[#151a1f]/95 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <Logo size={40} />
          <div className="leading-none">
            <p className="text-[15px] font-black tracking-[-0.02em] text-white">
              LOOP <span className="text-[#c3c8cb]">REPUESTOS</span>
            </p>
            <p className="mt-0.5 hidden text-[10px] font-semibold tracking-[0.08em] text-[#8e989e] min-[390px]:block">
              Repuestos e insumos para celulares
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label={totalItems > 0 ? `Ver pedido, ${totalItems} productos` : "Carrito vacío"}
          onClick={openCart}
          disabled={totalItems === 0}
          className="relative flex h-10 items-center justify-center gap-2 rounded-lg border border-[#39444c] bg-[#20272d] px-3 text-[#c3c8cb] transition-colors hover:border-[#66747e] hover:text-white disabled:cursor-default disabled:opacity-60"
        >
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span className="hidden text-xs font-bold sm:inline">Mi pedido</span>
          {totalItems > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-acero px-1 text-[9px] font-extrabold leading-none text-fondo">
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
