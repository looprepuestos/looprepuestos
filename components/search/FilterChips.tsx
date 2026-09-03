"use client";

import type { FacetOption } from "@/types/product";

/**
 * Fila de chips de filtro (marcas / tipos), scrollable en horizontal.
 * Presentacional: recibe opciones, conjunto activo y notifica toggles.
 * Estados activos con acento acero sutil.
 */
interface FilterChipsProps {
  label: string;
  options: FacetOption[];
  active: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

export function FilterChips({
  label,
  options,
  active,
  onToggle,
}: FilterChipsProps) {
  return (
    <div>
      <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-titanio">
        {label}
      </p>
      <div
        role="group"
        aria-label={label}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {options.map((option) => {
          const isActive = active.has(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(option.id)}
              className={[
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-acero bg-acero-tenue text-texto"
                  : "border-borde bg-superficie text-texto-suave hover:border-borde-fuerte hover:text-texto",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
