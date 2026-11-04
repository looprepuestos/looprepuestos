"use client";

/**
 * Buscador principal (protagonista de la home).
 * Componente controlado y presentacional. La lógica real (índice en memoria +
 * sinónimos: pantalla/display→módulo, pila→batería, pin→placa de carga,
 * flex carga→flex de carga) llega en Etapa 3.
 */
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  suggestions?: ReadonlyArray<{ label: string; detail: string; available: boolean }>;
  onSelectSuggestion?: (label: string) => void;
}

export function SearchBar({ value, onChange, suggestions = [], onSelectSuggestion }: SearchBarProps) {
  return (
    <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-acero-fuerte">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        </span>

        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          aria-label="Buscar productos"
          placeholder="Buscá por modelo: G22, A15, iPhone 11..."
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-13 w-full rounded-xl border border-borde-fuerte bg-superficie pl-11 pr-4 text-base font-medium text-texto shadow-sm placeholder:font-normal placeholder:text-titanio focus:border-acero focus:outline-none focus:ring-3 focus:ring-acero/15"
        />
      {value.trim().length >= 2 && suggestions.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-borde bg-white shadow-sm" aria-label="Sugerencias de productos">
          <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-texto-suave">Coincidencias rápidas</p>
          {suggestions.map((suggestion) => (
            <button key={suggestion.label} type="button" onClick={() => onSelectSuggestion?.(suggestion.label)} className="flex w-full items-center justify-between gap-3 border-b border-borde/60 px-3 py-2.5 text-left last:border-0 hover:bg-fondo-2">
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-texto">{suggestion.label}</span><span className="block truncate text-xs text-texto-suave">{suggestion.detail}</span></span>
              <span className={`shrink-0 text-[11px] font-bold ${suggestion.available ? "text-green-700" : "text-titanio"}`}>{suggestion.available ? "Disponible" : "Sin stock"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
