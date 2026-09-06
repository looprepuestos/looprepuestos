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
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div>
      <label htmlFor="catalog-search" className="mb-2 block text-sm font-extrabold text-texto">
        ¿Qué repuesto necesitás?
      </label>
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
          id="catalog-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Modelo, producto o código"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-13 w-full rounded-xl border border-borde-fuerte bg-superficie pl-11 pr-4 text-base font-medium text-texto shadow-sm placeholder:font-normal placeholder:text-titanio focus:border-acero focus:outline-none focus:ring-3 focus:ring-acero/15"
        />
      </div>
    </div>
  );
}
