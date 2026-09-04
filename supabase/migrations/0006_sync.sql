-- =============================================================================
-- LOOP REPUESTOS — Migración 0006: sincronización Google Sheets -> Supabase
--
-- Objetivo: aplicar una lectura del Sheet a `products` de forma ATÓMICA e
-- idempotente. El orquestador (scripts/sync-sheets.ts) lee y valida el Sheet y
-- manda el lote a la RPC `apply_sheet_sync`, que hace UPSERT + reconciliación de
-- borrados + escritura de sync_log DENTRO DE UNA SOLA TRANSACCIÓN.
--
-- Reglas MVP respetadas:
--  * Nunca toca stock_reservado, orders ni order_items (infra dormida y desacoplada).
--  * El estado público EN/SIN STOCK depende EXCLUSIVAMENTE de stock_sheet (Sheet).
--  * Público nunca ve costo, precio_mayorista ni stock numérico (vista pública).
--  * Fila inválida NO se considera SKU ausente (no se despublica): la
--    reconciliación usa el conjunto de SKU vistos, no el de filas válidas.
-- =============================================================================

-- --- Columnas de control en products ----------------------------------------
alter table public.products
  add column if not exists en_planilla     boolean     not null default true,
  add column if not exists synced_at       timestamptz,
  add column if not exists source_row_hash text;

-- --- Log de sincronizaciones -------------------------------------------------
create table if not exists public.sync_logs (
  sync_id            uuid primary key default gen_random_uuid(),
  fuente             text not null default 'manual',   -- 'cron' | 'admin' | 'manual'
  estado             text not null,                    -- 'ok' | 'abortado' | 'error'
  motivo             text,
  filas_leidas       integer not null default 0,
  skus_vistos        integer not null default 0,
  creados            integer not null default 0,
  actualizados       integer not null default 0,
  sin_cambios        integer not null default 0,
  saltados_invalidos integer not null default 0,
  despublicados      integer not null default 0,
  errores            jsonb   not null default '[]'::jsonb,
  duracion_ms        integer,
  iniciado_at        timestamptz not null default now(),
  finalizado_at      timestamptz
);

alter table public.sync_logs enable row level security;
-- Sólo ADMIN puede leer los logs desde el cliente; el job usa service_role.
grant select on public.sync_logs to authenticated;
create policy sync_logs_admin_read on public.sync_logs
  for select to authenticated using (public.is_admin());

-- --- Vista pública: corrección + desacople de stock -------------------------
-- (1) SIN security_invoker: la vista corre con privilegios del owner y expone
--     SÓLO columnas públicas; así anon puede leer el catálogo aunque products
--     esté bajo RLS (sin filtrar costo/mayorista/stock numérico).
-- (2) en_stock depende EXCLUSIVAMENTE de stock_sheet (no de stock_efectivo),
--     para que la infra dormida de reservas no pueda afectar el catálogo.
-- Se recrea (drop+create) porque cambia security_invoker y el conjunto de
-- columnas respecto de 0005; `create or replace` no permite ese cambio.
drop view if exists public.catalogo_publico;
create view public.catalogo_publico as
select
    p.sku,
    p.nombre,
    p.marca,
    p.modelo,
    p.tipo,
    p.calidad,
    p.marco,
    p.compatibilidad,
    p.imagen_url,
    p.precio_publico,
    case
      when p.es_promocion and p.precio_promocional is not null
      then p.precio_promocional
    end as precio_promocional,
    (p.stock_sheet > 0) as en_stock,
    p.es_novedad,
    p.es_nuevo_ingreso,
    p.es_promocion,
    p.es_destacado,
    p.fecha_ingreso,
    p.orden_destacado
from public.products p
where p.publicado = true;

grant select on public.catalogo_publico to anon, authenticated;

-- --- RPC: aplicar una sincronización completa, atómica -----------------------
-- p_rows       : jsonb array de filas VÁLIDAS ya mapeadas (snake_case + source_row_hash)
-- p_seen_skus  : jsonb array de TODOS los SKU presentes en la lectura (válidos o no)
-- p_errors     : jsonb array de errores por fila (para el log)
-- p_filas_leidas, p_fuente
-- p_min_ratio  : guardia anti-desastre (default 0.70); si skus_vistos < ratio*activos -> aborta
-- p_force      : true saltea la guardia (cambios masivos deliberados; el cron nunca fuerza)
create or replace function public.apply_sheet_sync(
  p_rows        jsonb,
  p_seen_skus   jsonb,
  p_errors      jsonb default '[]'::jsonb,
  p_filas_leidas integer default 0,
  p_fuente      text default 'manual',
  p_min_ratio   numeric default 0.70,
  p_force       boolean default false
)
returns public.sync_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start      timestamptz := clock_timestamp();
  v_sync_id    uuid := gen_random_uuid();
  v_seen       text[];
  v_seen_count integer;
  v_activos    integer;
  v_creados    integer := 0;
  v_actualizados integer := 0;
  v_sincambios integer := 0;
  v_despub     integer := 0;
  v_saltados   integer := coalesce(jsonb_array_length(p_errors), 0);
  v_row        jsonb;
  v_sku        text;
  v_existing   public.products%rowtype;
  v_found      boolean;
  v_log        public.sync_logs;
begin
  -- Conjunto de SKU vistos (todos los presentes, incluso de filas inválidas).
  v_seen := array(select distinct jsonb_array_elements_text(p_seen_skus));
  v_seen_count := coalesce(array_length(v_seen, 1), 0);

  -- Universo actual "en planilla".
  select count(*) into v_activos from public.products where en_planilla;

  -- --- GUARDIA anti-desastre (configurable, salteable con force) ---
  -- Evita despublicar en masa por una lectura vacía/rota.
  if not p_force and v_activos > 0
     and v_seen_count < ceil(p_min_ratio * v_activos) then
    insert into public.sync_logs(
      sync_id, fuente, estado, motivo, filas_leidas, skus_vistos, errores,
      duracion_ms, iniciado_at, finalizado_at)
    values (
      v_sync_id, p_fuente, 'abortado',
      format('Guardia: vistos %s < %s%% de %s activos. Usar force=true para forzar.',
             v_seen_count, round(p_min_ratio*100), v_activos),
      p_filas_leidas, v_seen_count, p_errors,
      (extract(epoch from (clock_timestamp() - v_start)) * 1000)::int,
      v_start, clock_timestamp())
    returning * into v_log;
    return v_log;  -- sin tocar products
  end if;

  -- --- UPSERT de filas válidas (por SKU) ---
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_sku := v_row ->> 'sku';
    select * into v_existing from public.products where sku = v_sku;
    v_found := found;

    if not v_found then
      insert into public.products (
        sku, nombre, marca, modelo, tipo, calidad, marco, compatibilidad,
        imagen_url, precio_publico, precio_promocional, precio_mayorista,
        precio_costo, stock_sheet, publicado, es_novedad, es_nuevo_ingreso,
        es_promocion, es_destacado, fecha_ingreso, orden_destacado, search_text,
        en_planilla, synced_at, source_row_hash
      ) values (
        v_sku,
        v_row ->> 'nombre', v_row ->> 'marca', v_row ->> 'modelo', v_row ->> 'tipo',
        v_row ->> 'calidad', v_row ->> 'marco', v_row ->> 'compatibilidad',
        nullif(v_row ->> 'imagen_url', ''),
        (v_row ->> 'precio_publico')::numeric,
        (v_row ->> 'precio_promocional')::numeric,
        (v_row ->> 'precio_mayorista')::numeric,
        (v_row ->> 'precio_costo')::numeric,
        coalesce((v_row ->> 'stock_sheet')::integer, 0),
        coalesce((v_row ->> 'publicado')::boolean, false),
        coalesce((v_row ->> 'es_novedad')::boolean, false),
        coalesce((v_row ->> 'es_nuevo_ingreso')::boolean, false),
        coalesce((v_row ->> 'es_promocion')::boolean, false),
        coalesce((v_row ->> 'es_destacado')::boolean, false),
        (v_row ->> 'fecha_ingreso')::date,
        coalesce((v_row ->> 'orden_destacado')::integer, 999),
        v_row ->> 'search_text',
        true, now(), v_row ->> 'source_row_hash'
      );
      v_creados := v_creados + 1;

    elsif v_existing.source_row_hash is distinct from (v_row ->> 'source_row_hash')
          or not v_existing.en_planilla then
      -- Cambió el contenido, o el SKU había sido despublicado y reaparece.
      -- NUNCA se tocan stock_reservado / stock_efectivo (generado) / created_at.
      update public.products set
        nombre = v_row ->> 'nombre',
        marca = v_row ->> 'marca',
        modelo = v_row ->> 'modelo',
        tipo = v_row ->> 'tipo',
        calidad = v_row ->> 'calidad',
        marco = v_row ->> 'marco',
        compatibilidad = v_row ->> 'compatibilidad',
        imagen_url = nullif(v_row ->> 'imagen_url', ''),
        precio_publico = (v_row ->> 'precio_publico')::numeric,
        precio_promocional = (v_row ->> 'precio_promocional')::numeric,
        precio_mayorista = (v_row ->> 'precio_mayorista')::numeric,
        precio_costo = (v_row ->> 'precio_costo')::numeric,
        stock_sheet = coalesce((v_row ->> 'stock_sheet')::integer, 0),
        publicado = coalesce((v_row ->> 'publicado')::boolean, false),
        es_novedad = coalesce((v_row ->> 'es_novedad')::boolean, false),
        es_nuevo_ingreso = coalesce((v_row ->> 'es_nuevo_ingreso')::boolean, false),
        es_promocion = coalesce((v_row ->> 'es_promocion')::boolean, false),
        es_destacado = coalesce((v_row ->> 'es_destacado')::boolean, false),
        fecha_ingreso = (v_row ->> 'fecha_ingreso')::date,
        orden_destacado = coalesce((v_row ->> 'orden_destacado')::integer, 999),
        search_text = v_row ->> 'search_text',
        en_planilla = true,
        synced_at = now(),
        source_row_hash = v_row ->> 'source_row_hash'
      where sku = v_sku;
      v_actualizados := v_actualizados + 1;

    else
      -- Hash igual y ya en planilla: sin cambios (idempotente).
      v_sincambios := v_sincambios + 1;
    end if;
  end loop;

  -- --- RECONCILIACIÓN de borrados (contra SKU VISTOS, no filas válidas) ---
  -- SKU que estaban en planilla y ya NO aparecen físicamente en la lectura:
  -- soft-unpublish. Una fila inválida sigue "vista" -> NO se despublica.
  update public.products
     set publicado = false, en_planilla = false, synced_at = now()
   where en_planilla = true
     and not (sku = any(v_seen));
  get diagnostics v_despub = row_count;

  -- --- Log final ---
  insert into public.sync_logs(
    sync_id, fuente, estado, filas_leidas, skus_vistos, creados, actualizados,
    sin_cambios, saltados_invalidos, despublicados, errores, duracion_ms,
    iniciado_at, finalizado_at)
  values (
    v_sync_id, p_fuente, 'ok', p_filas_leidas, v_seen_count, v_creados,
    v_actualizados, v_sincambios, v_saltados, v_despub, p_errors,
    (extract(epoch from (clock_timestamp() - v_start)) * 1000)::int,
    v_start, clock_timestamp())
  returning * into v_log;

  return v_log;
end;
$$;

-- --- Endurecimiento: sólo el service_role (job server-side) ejecuta la RPC ---
revoke execute on function
  public.apply_sheet_sync(jsonb, jsonb, jsonb, integer, text, numeric, boolean)
  from public;
grant execute on function
  public.apply_sheet_sync(jsonb, jsonb, jsonb, integer, text, numeric, boolean)
  to service_role;
