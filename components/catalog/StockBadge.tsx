/**
 * Badge de stock público. Sólo EN STOCK / SIN STOCK (nunca el número real).
 */
export function StockBadge({ enStock }: { enStock: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        enStock ? "bg-stock-on/12 text-stock-on" : "bg-grafito text-stock-off",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "h-1.5 w-1.5 rounded-full",
          enStock ? "bg-stock-on" : "bg-stock-off",
        ].join(" ")}
      />
      {enStock ? "En stock" : "Sin stock"}
    </span>
  );
}
