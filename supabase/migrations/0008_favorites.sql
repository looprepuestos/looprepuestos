-- LOOP REPUESTOS — Favoritos privados por usuario.
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  sku        text not null references public.products (sku) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, sku)
);

alter table public.favorites enable row level security;

revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;

create policy favorites_select_own on public.favorites
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy favorites_insert_own on public.favorites
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy favorites_delete_own on public.favorites
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);
