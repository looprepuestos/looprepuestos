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
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-titanio"
      >
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
        aria-label="Buscar repuestos"
        placeholder="Buscar A12, G20, batería iPhone 11, placa A13..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-borde bg-superficie pl-11 pr-4 text-base text-texto placeholder:text-titanio focus:border-acero focus:outline-none focus:ring-2 focus:ring-acero/25"
      />
    </div>
  );
}
