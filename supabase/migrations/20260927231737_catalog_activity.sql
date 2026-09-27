-- Historial privado de uso del catálogo. Los visitantes no pueden leer eventos.
create table public.catalog_activity (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid not null,
  event_type text not null check (event_type in ('visit', 'search', 'product_view')),
  search_term text check (search_term is null or char_length(search_term) between 2 and 80),
  result_count integer check (result_count is null or result_count between 0 and 10000),
  product_sku text check (product_sku is null or char_length(product_sku) between 1 and 100),
  product_name text check (product_name is null or char_length(product_name) between 1 and 180),
  constraint catalog_activity_payload_check check (
    (event_type = 'visit' and search_term is null and result_count is null and product_sku is null and product_name is null)
    or (event_type = 'search' and search_term is not null and result_count is not null and product_sku is null and product_name is null)
    or (event_type = 'product_view' and product_sku is not null and product_name is not null and search_term is null and result_count is null)
  )
);

create index catalog_activity_created_idx on public.catalog_activity (created_at desc);
create index catalog_activity_user_idx on public.catalog_activity (user_id, created_at desc) where user_id is not null;
create index catalog_activity_session_idx on public.catalog_activity (session_id, created_at desc);

alter table public.catalog_activity enable row level security;
revoke all on public.catalog_activity from anon, authenticated;
grant insert on public.catalog_activity to anon, authenticated;
grant select on public.catalog_activity to authenticated;
grant usage on sequence public.catalog_activity_id_seq to anon, authenticated;

create policy catalog_activity_insert_guest on public.catalog_activity
  for insert to anon with check (user_id is null);
create policy catalog_activity_insert_user on public.catalog_activity
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy catalog_activity_admin_read on public.catalog_activity
  for select to authenticated using ((select public.is_admin()));
