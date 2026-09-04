-- =============================================================================
-- LOOP REPUESTOS — Bundle Fase 1: migraciones 0001 -> 0006 en orden.
-- Pegar en el SQL Editor del proyecto Supabase (auth/roles ya existen).
-- NO incluye el stub de tests (00_bootstrap): eso es sólo para Postgres local.
-- =============================================================================

-- >>>>>>>>>> migrations/0001_init.sql >>>>>>>>>>

-- =============================================================================
-- LOOP REPUESTOS — Migración 0001: esquema base
-- Supabase / PostgreSQL. Requiere las extensiones y el esquema `auth` de Supabase.
-- =============================================================================

-- --- Enums -------------------------------------------------------------------
create type public.user_role as enum ('PUBLICO', 'MAYORISTA', 'ADMIN');
create type public.request_status as enum ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- Estados de pedido. Regla de RESERVA de stock:
--   pendiente               -> RESERVA
--   confirmado              -> RESERVA
--   entregado (no reconc.)  -> RESERVA   (sigue reservando hasta reconciliar con Sheets)
--   entregado (reconciliado)-> LIBERA
--   cancelado               -> LIBERA
create type public.order_status as enum
  ('pendiente', 'confirmado', 'entregado', 'cancelado');

-- Máquina de estados de la baja de inventario contra Google Sheets (Etapa 7).
-- Google Sheets y Postgres son sistemas externos: NO hay transacción atómica
-- entre ambos. Este estado hace el flujo idempotente y tolerante a fallos:
--   pending       : entrega registrada; la baja aún NO se aplicó al Sheet. RESERVA.
--   sheet_applied : la baja física fue escrita/confirmada en el Sheet. RESERVA (seguro).
--   reconciled    : reserva liberada (paso final). LIBERA.
--   error         : un intento falló; permite reintento sin doble descuento. RESERVA.
create type public.stock_sync_status as enum
  ('pending', 'sheet_applied', 'reconciled', 'error');

-- --- Utilidad: updated_at ----------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --- profiles (extiende auth.users) ------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null,
  nombre      text,
  role        public.user_role not null default 'PUBLICO',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Alta automática de perfil cuando se crea un usuario en auth.users.
-- SIEMPRE nace como PUBLICO (nunca desde cliente).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, nombre)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- products (modelo comercial + stock) -------------------------------------
-- Columnas PÚBLICAS y PRIVADAS conviven en la tabla; la separación de exposición
-- se hace por VISTA (catalogo_publico) + RLS. Ver 0003/0004.
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text not null unique,
  nombre          text not null,
  marca           text not null default '',
  modelo          text not null default '',
  tipo            text not null default '',
  calidad         text not null default '',
  marco           text not null default '',
  compatibilidad  text not null default '',

  -- Precios: público (visible), promocional (visible), mayorista y costo (PRIVADOS)
  precio_publico       numeric(12,2) not null default 0 check (precio_publico >= 0),
  precio_promocional   numeric(12,2) check (precio_promocional >= 0),
  precio_mayorista     numeric(12,2) check (precio_mayorista >= 0),   -- PRIVADO, por SKU
  precio_costo         numeric(12,2) check (precio_costo >= 0),       -- PRIVADO

  -- STOCK (PRIVADO en número). Modelo anti-sync:
  --   stock_sheet     = stock físico declarado por el admin (fuente: Google Sheets).
  --                     Lo sobrescribe SÓLO la sincronización.
  --   stock_reservado = unidades comprometidas por pedidos LOOP abiertos.
  --                     Lo mantiene la app (trigger). La sync NUNCA lo toca.
  --   stock_efectivo  = disponible real = max(sheet - reservado, 0). Derivado.
  stock_sheet      integer not null default 0 check (stock_sheet >= 0),
  stock_reservado  integer not null default 0 check (stock_reservado >= 0),
  stock_efectivo   integer generated always as
                     (greatest(stock_sheet - stock_reservado, 0)) stored,

  publicado        boolean not null default false,

  -- Flags comerciales (PÚBLICAS): alimentan las secciones de la Home.
  es_novedad        boolean not null default false,
  es_nuevo_ingreso  boolean not null default false,
  es_promocion      boolean not null default false,
  es_destacado      boolean not null default false,
  fecha_ingreso     date,
  orden_destacado   integer not null default 999,

  search_text      text,  -- normalizado para búsqueda (se llena en Etapa 2/3)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index products_publicado_idx      on public.products (publicado);
create index products_marca_idx          on public.products (marca);
create index products_tipo_idx           on public.products (tipo);
create index products_novedad_idx        on public.products (es_novedad)       where es_novedad;
create index products_nuevo_ingreso_idx  on public.products (es_nuevo_ingreso) where es_nuevo_ingreso;
create index products_promocion_idx      on public.products (es_promocion)     where es_promocion;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- --- settings (config global) ------------------------------------------------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- Descuento mayorista general por defecto (fallback si un SKU no tiene
-- precio_mayorista propio). Ej: 0.15 = 15% off sobre precio_publico.
insert into public.settings (key, value) values
  ('descuento_mayorista_general', '0.15'::jsonb),
  ('whatsapp', '""'::jsonb);

-- --- account_requests (solicitud mayorista, SIN CUIT) ------------------------
create table public.account_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  nombre         text not null,
  service_local  text not null,
  localidad      text not null,
  whatsapp       text not null,
  estado         public.request_status not null default 'PENDIENTE',
  revisado_por   uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz
);

-- Una sola solicitud pendiente por usuario.
create unique index account_requests_one_pending
  on public.account_requests (user_id)
  where estado = 'PENDIENTE';

-- --- orders / order_items ----------------------------------------------------
-- Se crean desde ya (V1) para que el modelo de stock/reserva quede íntegro.
-- La creación se hace SIEMPRE server-side vía la función place_order (0002):
-- el cliente nunca envía precio ni total.
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete restrict,
  estado        public.order_status not null default 'pendiente',
  rol_aplicado  public.user_role not null,          -- rol con el que se fijaron precios
  total         numeric(12,2) not null default 0 check (total >= 0),
  -- Máquina de estados de la baja de inventario (ver enum stock_sync_status).
  -- Una entrega deja de reservar stock SÓLO al llegar a 'reconciled', y sólo
  -- después de que la baja física quedó confirmada en Google Sheets (Etapa 7).
  -- Esto evita la ventana de sobreventa y es idempotente ante reintentos.
  stock_sync_status      public.stock_sync_status not null default 'pending',
  stock_sheet_applied_at timestamptz,   -- cuándo se confirmó la baja en el Sheet
  stock_reconciliado_at  timestamptz,   -- cuándo se liberó la reserva
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index orders_user_idx   on public.orders (user_id);
create index orders_estado_idx on public.orders (estado);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  product_id      uuid not null references public.products (id) on delete restrict,
  -- Snapshots: preservan el histórico aunque el producto cambie luego.
  sku             text not null,
  nombre          text not null,
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  subtotal        numeric(12,2) not null check (subtotal >= 0),
  unique (order_id, product_id)
);

create index order_items_order_idx   on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- --- Reserva de stock: recomputo por producto --------------------------------
-- stock_reservado = SUM(cantidad) de items en pedidos que RETIENEN stock:
--   * 'pendiente' o 'confirmado', o
--   * 'entregado' cuya baja de inventario AÚN NO está 'reconciled'.
-- Esto cierra la ventana de sobreventa: una entrega no libera disponibilidad
-- hasta que la baja física quede confirmada en el Sheet Y se reconcilie.
create or replace function public.recompute_stock_reservado(p_ids uuid[])
returns void
language sql
as $$
  update public.products p
     set stock_reservado = coalesce((
       select sum(oi.cantidad)
         from public.order_items oi
         join public.orders o on o.id = oi.order_id
        where oi.product_id = p.id
          and (
            o.estado in ('pendiente', 'confirmado')
            or (o.estado = 'entregado' and o.stock_sync_status <> 'reconciled')
          )
     ), 0)
   where p.id = any(p_ids);
$$;

create or replace function public.trg_order_items_reserved()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_stock_reservado(array[new.product_id]);
  elsif tg_op = 'DELETE' then
    perform public.recompute_stock_reservado(array[old.product_id]);
  else -- UPDATE
    perform public.recompute_stock_reservado(
      array_remove(array[new.product_id, old.product_id], null)
    );
  end if;
  return null;
end;
$$;

create trigger order_items_reserved
  after insert or update or delete on public.order_items
  for each row execute function public.trg_order_items_reserved();

create or replace function public.trg_orders_reserved()
returns trigger
language plpgsql
as $$
begin
  -- Recalcular si cambió el estado del pedido O el estado de sync de inventario.
  if new.estado is distinct from old.estado
     or new.stock_sync_status is distinct from old.stock_sync_status then
    perform public.recompute_stock_reservado(
      array(select product_id from public.order_items where order_id = new.id)
    );
  end if;
  return null;
end;
$$;

create trigger orders_reserved
  after update on public.orders
  for each row execute function public.trg_orders_reserved();

-- >>>>>>>>>> migrations/0002_functions.sql >>>>>>>>>>

-- =============================================================================
-- LOOP REPUESTOS — Migración 0002: helpers de rol, seguridad y RPCs
-- =============================================================================

-- --- Rol del usuario actual (para RLS y funciones) ---------------------------
-- SECURITY DEFINER para poder leer profiles sin exponerla; STABLE.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'PUBLICO'::public.user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_user_role() = 'ADMIN';
$$;

create or replace function public.is_mayorista_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_user_role() in ('MAYORISTA', 'ADMIN');
$$;

-- --- Anti-escalada de rol -----------------------------------------------------
-- Nadie puede cambiar su propio `role` (ni el de otro) desde el cliente.
-- El cambio de rol sólo ocurre vía RPC de admin (resolver_solicitud_mayorista),
-- que corre como SECURITY DEFINER y valida is_admin() del solicitante.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Permitido sólo si: (a) contexto de servidor/SQL sin sesión de cliente
  -- (auth.uid() nulo: bootstrap del primer admin, service_role, sync), o
  -- (b) el que ejecuta es ADMIN. Un cliente autenticado no-admin nunca puede.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'No autorizado: el rol sólo puede cambiarlo un ADMIN'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- --- Precios mayoristas (sólo MAYORISTA/ADMIN) -------------------------------
-- Resuelve el precio mayorista efectivo por SKU: precio_mayorista propio o,
-- si falta, precio_publico con el descuento general. NUNCA devuelve costo ni
-- stock numérico. Los PUBLICO reciben excepción (no filtra datos).
create or replace function public.get_wholesale_prices()
returns table (sku text, precio_mayorista numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desc numeric;
begin
  if not public.is_mayorista_or_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select (value #>> '{}')::numeric into v_desc
    from public.settings where key = 'descuento_mayorista_general';
  v_desc := coalesce(v_desc, 0);

  return query
    select p.sku,
           case
             when p.es_promocion and p.precio_promocional is not null then
               least(round(coalesce(p.precio_mayorista,
                                    p.precio_publico * (1 - v_desc)), 2),
                     p.precio_promocional)
             else
               round(coalesce(p.precio_mayorista,
                              p.precio_publico * (1 - v_desc)), 2)
           end
      from public.products p
     where p.publicado;
end;
$$;

-- --- Crear pedido (resolución 100% server-side) ------------------------------
-- Recibe SÓLO [{ "sku": "...", "cantidad": N }]. El servidor resuelve:
--   SKU -> precio según ROL -> disponibilidad (stock_efectivo) -> total.
-- Ignora cualquier precio/total que mande el cliente. Bloquea filas de producto
-- (FOR UPDATE) para evitar sobreventa concurrente.
create or replace function public.place_order(p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  public.user_role;
  v_desc  numeric;
  v_order uuid;
  v_sku   text;
  v_qty   integer;
  v_prod  public.products%rowtype;
  v_precio numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if v_uid is null then
    raise exception 'Debe iniciar sesión para generar un pedido'
      using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene ítems';
  end if;

  v_role := public.current_user_role();
  select (value #>> '{}')::numeric into v_desc
    from public.settings where key = 'descuento_mayorista_general';
  v_desc := coalesce(v_desc, 0);

  insert into public.orders (user_id, estado, rol_aplicado, total)
  values (v_uid, 'pendiente', v_role, 0)
  returning id into v_order;

  -- Validación por ítem ANTES de agrupar: cada línea requiere sku y cantidad > 0.
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where (e ->> 'sku') is null
        or coalesce((e ->> 'cantidad')::integer, 0) <= 0
  ) then
    raise exception 'Ítems inválidos: cada línea requiere sku y cantidad > 0';
  end if;

  -- SKU duplicado: se NORMALIZA agrupando cantidades por SKU
  -- (p. ej. A10 x2 + A10 x3 => A10 x5). No se depende sólo del unique(order_id, product_id).
  for v_sku, v_qty in
    select e ->> 'sku', sum((e ->> 'cantidad')::integer)::integer
      from jsonb_array_elements(p_items) e
     group by e ->> 'sku'
  loop
    -- Bloquea la fila del producto para serializar ventas concurrentes.
    select * into v_prod from public.products
      where sku = v_sku and publicado for update;
    if not found then
      raise exception 'Producto no disponible: %', v_sku;
    end if;

    -- Precio según rol (server-side).
    if v_role = 'MAYORISTA' then
      v_precio := round(coalesce(v_prod.precio_mayorista,
                                 v_prod.precio_publico * (1 - v_desc)), 2);
      -- Regla comercial: un MAYORISTA nunca paga más que la promo pública vigente.
      if v_prod.es_promocion and v_prod.precio_promocional is not null then
        v_precio := least(v_precio, v_prod.precio_promocional);
      end if;
    elsif v_prod.es_promocion and v_prod.precio_promocional is not null then
      v_precio := v_prod.precio_promocional;
    else
      v_precio := v_prod.precio_publico;
    end if;

    -- Disponibilidad real (descuenta reservas ya existentes).
    if v_prod.stock_efectivo < v_qty then
      raise exception 'Stock insuficiente para % (disponible %, pedido %)',
        v_sku, v_prod.stock_efectivo, v_qty;
    end if;

    insert into public.order_items
      (order_id, product_id, sku, nombre, cantidad, precio_unitario, subtotal)
    values
      (v_order, v_prod.id, v_prod.sku, v_prod.nombre, v_qty, v_precio,
       round(v_precio * v_qty, 2));

    v_total := v_total + round(v_precio * v_qty, 2);
  end loop;

  update public.orders set total = v_total where id = v_order;
  return v_order;
end;
$$;

-- --- Resolver solicitud mayorista (sólo ADMIN) -------------------------------
-- Aprueba/rechaza. Al aprobar, eleva el rol PUBLICO -> MAYORISTA. Único camino
-- por el que un rol puede cambiar.
create or replace function public.resolver_solicitud_mayorista(
  p_request_id uuid,
  p_aprobar boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.account_requests
     set estado = (case when p_aprobar then 'APROBADO' else 'RECHAZADO' end)
                    ::public.request_status,
         revisado_por = auth.uid(),
         decided_at = now()
   where id = p_request_id and estado = 'PENDIENTE'
  returning user_id into v_user;

  if not found then
    raise exception 'Solicitud inexistente o ya resuelta';
  end if;

  if p_aprobar then
    update public.profiles set role = 'MAYORISTA'
      where id = v_user and role = 'PUBLICO';
  end if;
end;
$$;

-- --- Baja de inventario contra Sheets: máquina de estados (Etapa 7) ----------
-- Google Sheets y Postgres son sistemas EXTERNOS: no existe transacción atómica
-- entre ambos. Por eso el flujo es idempotente y tolerante a fallos, orquestado
-- por el worker de sincronización (Etapa 7):
--   1) Pedido 'entregado' con stock_sync_status IN ('pending','error') sigue reservando.
--   2) El worker aplica la baja física en el Sheet con una operación IDEMPOTENTE
--      keyed por order_id (p. ej. una fila de "ledger" con el id del pedido:
--      reintentarla no descuenta dos veces).
--   3) Sheets confirma  -> marcar_sheet_aplicado(order_id)  => 'sheet_applied'.
--   4) reconciliar_pedido(order_id)                          => 'reconciled' (libera).
--   *) Si algo falla    -> marcar_stock_error(order_id)      => 'error' (sigue reservando),
--      y el worker reintenta desde (2). El flag 'sheet_applied' evita re-aplicar,
--      así un retry NUNCA descuenta dos veces la venta en Sheets.

-- (3) La baja ya fue confirmada en el Sheet. Idempotente.
create or replace function public.marcar_sheet_aplicado(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_estado public.order_status; v_status public.stock_sync_status;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select estado, stock_sync_status into v_estado, v_status
    from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_estado <> 'entregado' then
    raise exception 'Sólo se aplica al Sheet un pedido entregado';
  end if;
  -- Idempotente: si ya está aplicado o reconciliado, no hace nada.
  if v_status in ('sheet_applied', 'reconciled') then return; end if;
  update public.orders
     set stock_sync_status = 'sheet_applied', stock_sheet_applied_at = now()
   where id = p_order_id;
end;
$$;

-- (4) Libera la reserva. Requiere que la baja ya esté aplicada al Sheet.
-- Idempotente: reconciliar dos veces NO produce una segunda liberación.
create or replace function public.reconciliar_pedido(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_estado public.order_status; v_status public.stock_sync_status;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select estado, stock_sync_status into v_estado, v_status
    from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_estado <> 'entregado' then
    raise exception 'Sólo se reconcilia un pedido entregado';
  end if;
  if v_status = 'reconciled' then return; end if;   -- idempotente: sin segunda liberación
  if v_status <> 'sheet_applied' then
    raise exception 'No se puede reconciliar antes de aplicar la baja al Sheet (estado: %)',
      v_status using errcode = '55000';
  end if;
  update public.orders
     set stock_sync_status = 'reconciled', stock_reconciliado_at = now()
   where id = p_order_id;
  -- El trigger orders_reserved recalcula stock_reservado (libera la reserva).
end;
$$;

-- Registrar un fallo de sync para reintento (el pedido SIGUE reservando).
create or replace function public.marcar_stock_error(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.orders set stock_sync_status = 'error'
   where id = p_order_id and estado = 'entregado' and stock_sync_status <> 'reconciled';
  if not found then
    raise exception 'Pedido inexistente, no entregado o ya reconciliado';
  end if;
end;
$$;

-- --- Actualizar perfil propio (sólo campos permitidos) -----------------------
-- Camino seguro para editar el perfil: nunca toca id, email ni role.
create or replace function public.update_profile(p_nombre text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  update public.profiles set nombre = p_nombre where id = auth.uid();
end;
$$;

-- >>>>>>>>>> migrations/0003_views.sql >>>>>>>>>>

-- =============================================================================
-- LOOP REPUESTOS — Migración 0003: vista pública del catálogo
-- =============================================================================

-- Vista con SÓLO columnas públicas. Es la única forma en que anon/PUBLICO ven
-- el catálogo. Nunca expone precio_mayorista, precio_costo ni stock numérico.
-- El stock se publica como booleano (en_stock). Corre como SECURITY DEFINER
-- (owner del esquema), por eso filtra columnas a nivel de vista y sólo muestra
-- productos publicados.
create or replace view public.catalogo_publico as
  select
    p.sku,
    p.nombre,
    p.marca,
    p.modelo,
    p.tipo,
    p.calidad,
    p.marco,
    p.compatibilidad,
    p.precio_publico,
    case
      when p.es_promocion and p.precio_promocional is not null
      then p.precio_promocional
    end as precio_promocional,
    (p.stock_efectivo > 0) as en_stock,
    p.es_novedad,
    p.es_nuevo_ingreso,
    p.es_promocion,
    p.es_destacado,
    p.fecha_ingreso,
    p.orden_destacado
  from public.products p
  where p.publicado;

comment on view public.catalogo_publico is
  'Payload público del catálogo. Sólo columnas públicas + en_stock booleano. '
  'Nunca precio_mayorista / precio_costo / stock numérico.';

-- >>>>>>>>>> migrations/0004_rls.sql >>>>>>>>>>

-- =============================================================================
-- LOOP REPUESTOS — Migración 0004: RLS, grants y exposición
-- Roles Supabase: anon (visitante), authenticated (logueado), service_role (bypass).
-- Estrategia: negar por defecto y abrir sólo lo necesario.
-- =============================================================================

-- --- Exposición controlada de settings públicos ------------------------------
-- Sólo expone claves whitelisteadas (p. ej. whatsapp). Nunca toda la tabla.
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_object_agg(key, value) filter (where key in ('whatsapp')),
    '{}'::jsonb
  )
  from public.settings;
$$;

-- --- Quitar privilegios amplios ----------------------------------------------
revoke all on public.products         from anon, authenticated;
revoke all on public.profiles         from anon, authenticated;
revoke all on public.settings         from anon, authenticated;
revoke all on public.account_requests from anon, authenticated;
revoke all on public.orders           from anon, authenticated;
revoke all on public.order_items      from anon, authenticated;

-- =============================================================================
-- PRODUCTS: nadie lee la tabla directa salvo ADMIN. El público usa la vista.
-- =============================================================================
alter table public.products enable row level security;

grant select, insert, update, delete on public.products to authenticated;

create policy products_admin_all on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Vista pública: única lectura para anon / logueados.
grant select on public.catalogo_publico to anon, authenticated;

-- Precios mayoristas y settings públicos: sólo por RPC.
grant execute on function public.get_wholesale_prices()          to authenticated;
grant execute on function public.get_public_settings()           to anon, authenticated;
grant execute on function public.current_user_role()             to authenticated;
grant execute on function public.is_admin()                      to authenticated;
grant execute on function public.is_mayorista_or_admin()         to authenticated;

-- =============================================================================
-- PROFILES: cada uno ve/edita el suyo; ADMIN ve/edita todos. El rol lo bloquea
-- el trigger prevent_role_escalation (sólo ADMIN puede cambiarlo).
-- =============================================================================
alter table public.profiles enable row level security;

-- Grant por COLUMNA: el usuario sólo puede escribir `nombre`. Nunca id, email
-- ni role (además del trigger anti-escalada como defensa extra). Camino
-- recomendado: RPC public.update_profile(nombre).
grant select on public.profiles to authenticated;
grant update (nombre) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- SETTINGS: sólo ADMIN. El público usa get_public_settings().
-- =============================================================================
alter table public.settings enable row level security;

grant select, insert, update, delete on public.settings to authenticated;

create policy settings_admin_all on public.settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- ACCOUNT_REQUESTS: el usuario crea/ve las suyas; ADMIN ve todas.
-- La resolución (y elevación de rol) es sólo por RPC resolver_solicitud_mayorista.
-- =============================================================================
alter table public.account_requests enable row level security;

grant select, insert on public.account_requests to authenticated;

-- El cliente no puede falsear metadatos administrativos: sólo su propia
-- solicitud, PENDIENTE y sin revisado_por / decided_at.
create policy account_requests_insert_own on public.account_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and estado = 'PENDIENTE'
    and revisado_por is null
    and decided_at is null
  );

create policy account_requests_select_own on public.account_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant execute on function public.resolver_solicitud_mayorista(uuid, boolean)
  to authenticated;

-- =============================================================================
-- ORDERS / ORDER_ITEMS: el usuario ve los suyos; ADMIN todos. La creación es
-- sólo server-side vía place_order (no hay INSERT directo para clientes).
-- =============================================================================
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

grant select on public.orders to authenticated;
grant update on public.orders to authenticated;  -- sólo ADMIN por policy (estados)
grant select on public.order_items to authenticated;

create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy orders_update_admin on public.orders
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy order_items_select_own on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
       where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

grant execute on function public.place_order(jsonb) to authenticated;

-- =============================================================================
-- ENDURECIMIENTO DE FUNCIONES
-- Por defecto PostgreSQL otorga EXECUTE a PUBLIC en cada función. Se revoca de
-- PUBLIC en TODAS y se otorga sólo lo estrictamente necesario. Las funciones
-- de trigger y los helpers internos no quedan expuestos a roles de cliente
-- (los triggers se ejecutan en contexto del dueño de la tabla igual).
-- =============================================================================
revoke execute on function
  public.set_updated_at(),
  public.handle_new_user(),
  public.prevent_role_escalation(),
  public.recompute_stock_reservado(uuid[]),
  public.trg_order_items_reserved(),
  public.trg_orders_reserved(),
  public.current_user_role(),
  public.is_admin(),
  public.is_mayorista_or_admin(),
  public.get_wholesale_prices(),
  public.get_public_settings(),
  public.place_order(jsonb),
  public.resolver_solicitud_mayorista(uuid, boolean),
  public.marcar_sheet_aplicado(uuid),
  public.reconciliar_pedido(uuid),
  public.marcar_stock_error(uuid),
  public.update_profile(text)
from public;

-- Helpers de rol (los usan las políticas RLS de usuarios autenticados).
grant execute on function public.current_user_role()     to authenticated;
grant execute on function public.is_admin()              to authenticated;
grant execute on function public.is_mayorista_or_admin() to authenticated;

-- RPCs de negocio / administración (con validación interna de rol).
grant execute on function public.marcar_sheet_aplicado(uuid) to authenticated;
grant execute on function public.reconciliar_pedido(uuid)    to authenticated;
grant execute on function public.marcar_stock_error(uuid)    to authenticated;
grant execute on function public.update_profile(text)        to authenticated;
-- (place_order, get_wholesale_prices, resolver_solicitud_mayorista y
--  get_public_settings ya fueron otorgadas arriba.)

-- >>>>>>>>>> migrations/0005_product_images.sql >>>>>>>>>>

-- LOOP REPUESTOS — foto pública opcional por producto.
-- La URL se sincronizará desde Google Sheets. No se inventan imágenes.
alter table public.products
  add column if not exists imagen_url text;

-- `create or replace view` no permite reordenar columnas existentes; como se
-- inserta imagen_url en el medio de la lista, hay que recrear la vista.
drop view if exists public.catalogo_publico;
create view public.catalogo_publico
with (security_invoker = true)
as
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
    p.precio_promocional,
    (p.stock_efectivo > 0) as en_stock,
    p.es_novedad,
    p.es_nuevo_ingreso,
    p.es_promocion,
    p.es_destacado,
    p.fecha_ingreso,
    p.orden_destacado
from public.products p
where p.publicado = true;

grant select on public.catalogo_publico to anon, authenticated;

-- >>>>>>>>>> migrations/0006_sync.sql >>>>>>>>>>

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
