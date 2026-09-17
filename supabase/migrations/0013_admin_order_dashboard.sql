-- Panel operativo para consultas enviadas por WhatsApp.
-- Sigue siendo informativo: no reserva ni descuenta stock.

alter table public.whatsapp_orders
  add column if not exists payment_method text,
  add column if not exists updated_at timestamptz not null default now();

update public.whatsapp_orders
set payment_method = case
  when notes ilike '%Forma de pago: Transferencia%' then 'Transferencia'
  when notes ilike '%Forma de pago: Efectivo%' then 'Efectivo'
  else payment_method
end
where payment_method is null;

alter table public.whatsapp_orders
  drop constraint if exists whatsapp_orders_payment_method_check;

alter table public.whatsapp_orders
  add constraint whatsapp_orders_payment_method_check
  check (payment_method is null or payment_method in ('Efectivo', 'Transferencia'));

alter table public.whatsapp_orders
  drop constraint if exists whatsapp_orders_estado_check;

update public.whatsapp_orders
set estado = 'NUEVO'
where estado = 'ENVIADO';

alter table public.whatsapp_orders
  alter column estado set default 'NUEVO';

alter table public.whatsapp_orders
  add constraint whatsapp_orders_estado_check
  check (estado in ('NUEVO', 'CONFIRMADO', 'PREPARADO', 'ENTREGADO', 'CANCELADO'));

drop trigger if exists whatsapp_orders_set_updated_at on public.whatsapp_orders;
create trigger whatsapp_orders_set_updated_at
  before update on public.whatsapp_orders
  for each row execute function public.set_updated_at();

create index if not exists whatsapp_orders_estado_created_idx
  on public.whatsapp_orders (estado, created_at desc);

drop policy if exists whatsapp_orders_insert_own on public.whatsapp_orders;
create policy whatsapp_orders_insert_own on public.whatsapp_orders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and estado = 'NUEVO');

drop policy if exists whatsapp_orders_update_admin on public.whatsapp_orders;
create policy whatsapp_orders_update_admin on public.whatsapp_orders
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

grant select, insert, update on public.whatsapp_orders to authenticated;
