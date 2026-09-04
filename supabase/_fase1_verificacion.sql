-- =============================================================================
-- LOOP REPUESTOS — Fase 1 · Verificación post-migraciones (paso 3).
-- Read-only: NO modifica datos. Pegar en el SQL Editor de Supabase y revisar
-- que cada bloque devuelva lo esperado (comentado a la derecha).
-- =============================================================================

-- 1) RLS habilitado en las tablas sensibles -----------------------------------
--    Esperado: products, sync_logs, orders, order_items, profiles => rowsecurity = true
select relname as tabla, relrowsecurity as rls_habilitado
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('products','sync_logs','orders','order_items','profiles','account_requests')
order by relname;

-- 2) La vista pública NO expone columnas privadas -----------------------------
--    Esperado: 0 filas (no debe aparecer costo/mayorista/stock numérico).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'catalogo_publico'
  and column_name in ('precio_costo','precio_mayorista','costo',
                      'stock','stock_sheet','stock_reservado','stock_efectivo');

-- 3) Columnas que SÍ expone catalogo_publico (referencia visual) --------------
--    Esperado incluye: sku,nombre,marca,modelo,tipo,calidad,marco,compatibilidad,
--    imagen_url,precio_publico,precio_promocional,en_stock,flags...,fecha_ingreso,orden_destacado
select string_agg(column_name, ', ' order by ordinal_position) as columnas_publicas
from information_schema.columns
where table_schema = 'public' and table_name = 'catalogo_publico';

-- 4) en_stock depende de stock_sheet (definición de la vista) ------------------
--    Esperado: la definición contiene "stock_sheet > 0" y NO "stock_efectivo".
select pg_get_viewdef('public.catalogo_publico'::regclass, true) as definicion_vista;

-- 5) RPC apply_sheet_sync: existe, SECURITY DEFINER, y sólo service_role ejecuta
--    Esperado: security_definer = true; acl muestra EXECUTE para service_role y NO para public/anon/authenticated.
select p.proname,
       p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args,
       p.proacl as permisos_execute
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'apply_sheet_sync';

-- 6) sync_logs tiene las columnas nuevas (sync_id, duracion_ms) ----------------
--    Esperado: aparecen sync_id (uuid) y duracion_ms (integer).
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'sync_logs'
  and column_name in ('sync_id','duracion_ms','estado','fuente','despublicados','skus_vistos')
order by column_name;

-- 7) Columnas de control en products ------------------------------------------
--    Esperado: en_planilla (boolean), synced_at (timestamptz), source_row_hash (text).
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'products'
  and column_name in ('en_planilla','synced_at','source_row_hash')
order by column_name;

-- 8) Estado inicial: products vacío antes del primer sync ----------------------
--    Esperado (proyecto nuevo): 0.
select count(*) as productos_actuales from public.products;
