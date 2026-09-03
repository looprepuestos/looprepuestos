const arsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/** Formatea un precio en pesos argentinos (ej. 48900 -> "$ 48.900"). */
export function formatARS(value: number): string {
  return arsFormatter.format(value);
}
