"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PublicProduct } from "@/types/product";

interface CartLine {
  sku: string;
  qty: number;
}

export interface CartDetailLine extends CartLine {
  product: PublicProduct;
  unitPrice: number;
  lineTotal: number;
}

interface CartContextValue {
  lines: ReadonlyArray<CartLine>;
  detailedLines: ReadonlyArray<CartDetailLine>;
  qtyOf: (sku: string) => number;
  add: (sku: string, qty?: number) => void;
  setQty: (sku: string, qty: number) => void;
  clear: () => void;
  totalItems: number;
  totalPrice: number;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "loop-cart-v1";

function unitPrice(product: PublicProduct): number {
  return product.precioPromocional ?? product.precioPublico;
}

export function CartProvider({
  products,
  children,
}: {
  products: ReadonlyArray<PublicProduct>;
  children: React.ReactNode;
}) {
  const [linesBySku, setLinesBySku] = useState<Record<string, number>>({});
  const [hydrated, setHydrated] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const productIndex = useMemo(() => {
    const map = new Map<string, PublicProduct>();
    for (const product of products) map.set(product.sku, product);
    return map;
  }, [products]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const safe: Record<string, number> = {};
        for (const [sku, qty] of Object.entries(parsed)) {
          const product = productIndex.get(sku);
          if (
            product?.enStock &&
            Number.isInteger(qty) &&
            (qty as number) > 0
          ) {
            safe[sku] = Math.min(qty as number, 99);
          }
        }
        setLinesBySku(safe);
      }
    } catch {
      // Si localStorage está corrupto, arrancamos con carrito vacío.
    } finally {
      setHydrated(true);
    }
  }, [productIndex]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(linesBySku));
  }, [hydrated, linesBySku]);

  const setQty = useCallback((sku: string, qty: number) => {
    setLinesBySku((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[sku];
      else next[sku] = Math.min(Math.floor(qty), 99);
      return next;
    });
  }, []);

  const add = useCallback((sku: string, qty = 1) => {
    setLinesBySku((prev) => {
      const current = prev[sku] ?? 0;
      return { ...prev, [sku]: Math.min(current + qty, 99) };
    });
  }, []);

  const clear = useCallback(() => setLinesBySku({}), []);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    const lines: CartLine[] = Object.entries(linesBySku).map(([sku, qty]) => ({ sku, qty }));
    const detailedLines: CartDetailLine[] = lines.flatMap((line) => {
      const product = productIndex.get(line.sku);
      if (!product) return [];
      const price = unitPrice(product);
      return [{ ...line, product, unitPrice: price, lineTotal: price * line.qty }];
    });
    return {
      lines,
      detailedLines,
      qtyOf: (sku: string) => linesBySku[sku] ?? 0,
      add,
      setQty,
      clear,
      totalItems: detailedLines.reduce((acc, line) => acc + line.qty, 0),
      totalPrice: detailedLines.reduce((acc, line) => acc + line.lineTotal, 0),
      cartOpen,
      openCart,
      closeCart,
    };
  }, [linesBySku, productIndex, add, setQty, clear, cartOpen, openCart, closeCart]);

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (ctx === null) throw new Error("useCart debe usarse dentro de <CartProvider>");
  return ctx;
}
