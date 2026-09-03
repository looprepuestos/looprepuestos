/**
 * Modelo de producto para la vista pública.
 *
 * IMPORTANTE (decisión de arquitectura): este tipo representa ÚNICAMENTE el
 * payload público. NO incluye precio mayorista, costo ni stock numérico.
 * Esos datos se sirven por API autenticada en etapas posteriores y jamás
 * viajan en el catálogo público. El stock se expone sólo como booleano.
 *
 * Los campos comerciales (novedad / nuevo ingreso / promoción / destacado)
 * SÍ son públicos: alimentan las secciones de la Home. Se poblarán desde la
 * base (sincronizada con Google Sheets) en etapas posteriores.
 */
export interface PublicProduct {
  sku: string;
  nombre: string;
  marca: string;
  modelo: string;
  /** Tipo de repuesto: módulo, batería, placa de carga, tapa, flex, insumo. */
  tipo: string;
  /** Calidad: original, incell, oled, etc. */
  calidad: string;
  /** Con o sin marco (o N/A cuando no aplica). */
  marco: string;
  compatibilidad: string;
  /** URL pública de la foto del producto. Vacío/null hasta que se cargue desde la planilla. */
  imagenUrl: string | null;
  precioPublico: number;
  /** Precio promocional público (si aplica). `null` cuando no hay promo. */
  precioPromocional: number | null;
  /** Stock público expuesto sólo como booleano (EN STOCK / SIN STOCK). */
  enStock: boolean;

  // --- Flags comerciales (públicos, para secciones de la Home) ---
  esNovedad: boolean;
  esNuevoIngreso: boolean;
  esPromocion: boolean;
  esDestacado: boolean;
  /** ISO date (YYYY-MM-DD) del ingreso; ordena "Nuevos ingresos". */
  fechaIngreso: string;
  /** Orden manual para destacados (menor = primero). */
  ordenDestacado: number;
}

/** Faceta de filtro genérica usada por los chips de la UI. */
export interface FacetOption {
  id: string;
  label: string;
}
