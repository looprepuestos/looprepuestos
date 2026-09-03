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
