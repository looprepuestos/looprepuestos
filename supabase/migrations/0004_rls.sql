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
