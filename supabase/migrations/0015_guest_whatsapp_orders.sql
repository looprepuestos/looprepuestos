-- Consultas de invitados: no reservan ni descuentan stock.
alter table public.whatsapp_orders alter column user_id drop not null;
alter table public.whatsapp_orders add column if not exists customer_phone text;
alter table public.whatsapp_orders add constraint whatsapp_orders_customer_phone_check check (customer_phone is null or (length(trim(customer_phone)) between 8 and 30));
alter table public.whatsapp_orders add constraint whatsapp_orders_guest_phone_required check (user_id is not null or customer_phone is not null);
create index if not exists whatsapp_orders_guest_created_idx on public.whatsapp_orders (created_at desc) where user_id is null;
grant insert on public.whatsapp_orders to anon;
create policy whatsapp_orders_guest_insert on public.whatsapp_orders for insert to anon with check (user_id is null and estado = 'NUEVO' and customer_phone is not null and length(trim(customer_name)) > 0 and length(trim(locality)) > 0 and jsonb_array_length(items) between 1 and 40 and total_estimated between 0 and 100000000);
comment on column public.whatsapp_orders.customer_phone is 'Telefono provisto por el cliente para contacto; requerido en consultas de invitados.';