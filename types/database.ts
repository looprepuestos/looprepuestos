/**
 * Tipos de la base de datos LOOP REPUESTOS (escritos a mano para Etapa 1).
 *
 * En cuanto exista el proyecto Supabase, se pueden REGENERAR automáticamente:
 *   npx supabase gen types typescript --project-id <ref> --schema public > types/database.ts
 *
 * Mantiene el contrato de separación de datos: la fila pública (`CatalogoPublicoRow`)
 * NO contiene precio_mayorista, precio_costo ni stock numérico.
 */

export type UserRole = "PUBLICO" | "MAYORISTA" | "ADMIN";
export type RequestStatus = "PENDIENTE" | "APROBADO" | "RECHAZADO";
export type OrderStatus = "pendiente" | "confirmado" | "entregado" | "cancelado";
/** Máquina de estados de la baja de inventario contra Google Sheets (Etapa 7). */
export type StockSyncStatus =
  | "pending"
  | "sheet_applied"
  | "reconciled"
  | "error";

/** Fila completa de `products` (privada: sólo accesible a ADMIN / servicio). */
export interface ProductRow {
  id: string;
  sku: string;
  nombre: string;
  marca: string;
  modelo: string;
  tipo: string;
  calidad: string;
  marco: string;
  compatibilidad: string;
  imagen_url: string | null;
  precio_publico: number;
  precio_promocional: number | null;
  precio_mayorista: number | null; // PRIVADO
  precio_costo: number | null; // PRIVADO
  stock_sheet: number; // PRIVADO — fuente: Google Sheets
  stock_reservado: number; // PRIVADO — mantenido por la app
  stock_efectivo: number; // PRIVADO — derivado (generated)
  publicado: boolean;
  es_novedad: boolean;
  es_nuevo_ingreso: boolean;
  es_promocion: boolean;
  es_destacado: boolean;
  fecha_ingreso: string | null;
  orden_destacado: number;
  search_text: string | null;
  created_at: string;
  updated_at: string;
}

/** Fila de la vista `catalogo_publico` — ÚNICO payload público del catálogo. */
export interface CatalogoPublicoRow {
  sku: string;
  nombre: string;
  marca: string;
  modelo: string;
  tipo: string;
  calidad: string;
  marco: string;
  compatibilidad: string;
  imagen_url: string | null;
  precio_publico: number;
  precio_promocional: number | null;
  en_stock: boolean;
  es_novedad: boolean;
  es_nuevo_ingreso: boolean;
  es_promocion: boolean;
  es_destacado: boolean;
  fecha_ingreso: string | null;
  orden_destacado: number;
}

export interface ProfileRow {
  id: string;
  email: string;
  nombre: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface AccountRequestRow {
  id: string;
  user_id: string;
  nombre: string;
  service_local: string;
  localidad: string;
  whatsapp: string;
  estado: RequestStatus;
  revisado_por: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface OrderRow {
  id: string;
  user_id: string;
  estado: OrderStatus;
  rol_aplicado: UserRole;
  total: number;
  /**
   * Máquina de estados de la baja de inventario contra Sheets. Un pedido
   * `entregado` SIGUE reservando stock hasta llegar a `reconciled` (evita la
   * ventana de sobreventa; idempotente y tolerante a fallos). Ver MODELO-STOCK.md.
   */
  stock_sync_status: StockSyncStatus;
  /** Cuándo se confirmó la baja física en el Sheet. */
  stock_sheet_applied_at: string | null;
  /** Cuándo se liberó la reserva (paso final). */
  stock_reconciliado_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

/** Ítem de entrada para la RPC `place_order`. */
export interface PlaceOrderItem {
  sku: string;
  cantidad: number;
}

/** Fila devuelta por la RPC `get_wholesale_prices`. */
export interface WholesalePriceRow {
  sku: string;
  precio_mayorista: number;
}
