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
