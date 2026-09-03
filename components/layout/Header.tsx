"use client";

import { useCart } from "@/lib/cart/CartContext";
import { Logo } from "./Logo";

/** Header funcional del MVP: identidad LOOP + acceso directo al pedido. */
export function Header() {
  const { totalItems, openCart } = useCart();

  return (
    <header className="sticky top-0 z-30 border-b border-borde bg-fondo-2/95 backdrop-blur supports-[backdrop-filter]:bg-fondo-2/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <div className="leading-none">
            <p className="text-sm font-extrabold tracking-tight text-texto">
              LOOP <span className="text-plata">REPUESTOS</span>
            </p>
            <p className="text-[10px] font-medium tracking-[0.08em] text-titanio">
              Repuestos e insumos para celulares
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label={totalItems > 0 ? `Ver pedido, ${totalItems} productos` : "Carrito vacío"}
          onClick={openCart}
          disabled={totalItems === 0}
          className="relative flex h-10 w-10 items-center justify-center rounded-md text-texto-suave transition-colors hover:bg-grafito hover:text-texto disabled:cursor-default disabled:opacity-60"
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
