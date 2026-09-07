-- Historial informativo de consultas enviadas por WhatsApp.
-- No toca products, stock_reservado ni la máquina de estados de pedidos.
create table public.whatsapp_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 160),
  locality text not null check (length(trim(locality)) between 1 and 120),
  delivery text not null check (delivery in ('Envío', 'Retiro')),
  notes text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  total_estimated numeric(12,2) not null check (total_estimated >= 0),
  estado text not null default 'ENVIADO' check (estado in ('ENVIADO', 'CONFIRMADO', 'CANCELADO')),
  created_at timestamptz not null default now()
);

create index whatsapp_orders_user_created_idx on public.whatsapp_orders(user_id, created_at desc);

alter table public.whatsapp_orders enable row level security;
revoke all on public.whatsapp_orders from anon, authenticated;
grant select, insert on public.whatsapp_orders to authenticated;

create policy whatsapp_orders_insert_own on public.whatsapp_orders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and estado = 'ENVIADO');

create policy whatsapp_orders_select_own on public.whatsapp_orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
