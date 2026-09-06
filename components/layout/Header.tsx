"use client";

import { useCart } from "@/lib/cart/CartContext";
import { Logo } from "./Logo";

/** Header funcional del MVP: identidad LOOP + acceso directo al pedido. */
export function Header() {
  const { totalItems, openCart } = useCart();

  return (
    <header className="border-b border-borde bg-white">
      <div className="relative mx-auto flex max-w-7xl items-center justify-center px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col items-center">
          <Logo size={112} />
          <p className="mt-2 text-base font-black tracking-[-0.02em] text-texto">
            LOOP <span className="text-plata">REPUESTOS</span>
          </p>
          <p className="mt-1 text-xs font-semibold tracking-[0.06em] text-titanio">
            Repuestos e insumos para celulares
          </p>
        </div>

        <button
          type="button"
          aria-label={totalItems > 0 ? `Ver pedido, ${totalItems} productos` : "Carrito vacío"}
          onClick={openCart}
          disabled={totalItems === 0}
          className="absolute right-4 top-5 flex h-10 items-center justify-center gap-2 rounded-lg border border-borde bg-fondo-2 px-3 text-texto-suave transition-colors hover:border-borde-fuerte hover:text-texto disabled:cursor-default disabled:opacity-40 sm:right-6 sm:top-6 lg:right-8"
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
