/**
 * Estado vacío del catálogo (sin coincidencias de búsqueda/filtros).
 */
export function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-borde bg-superficie px-6 py-14 text-center">
      <span
        aria-hidden
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-grafito text-titanio"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </span>
      <p className="text-sm font-semibold text-texto">Sin resultados</p>
      <p className="mt-1 max-w-xs text-xs text-texto-suave">
        {query.trim().length > 0
          ? `No encontramos repuestos para “${query}”. Probá con otro modelo o SKU.`
          : "Ajustá los filtros para ver repuestos."}
      </p>
    </div>
  );
}
