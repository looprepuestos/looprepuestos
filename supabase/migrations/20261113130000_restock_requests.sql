create table public.restock_requests (
  sku text not null references public.products(sku) on update cascade on delete cascade,
  whatsapp text not null check (whatsapp ~ '^[1-9][0-9]{9,14}$'),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (sku, whatsapp)
);

alter table public.restock_requests enable row level security;
revoke all on public.restock_requests from anon, authenticated;
grant select, update (notified_at) on public.restock_requests to authenticated;
grant all on public.restock_requests to service_role;

create policy restock_admin_read on public.restock_requests
  for select to authenticated using ((select public.is_admin()));
create policy restock_admin_notify on public.restock_requests
  for update to authenticated using ((select public.is_admin()))
  with check ((select public.is_admin()));

create function public.request_restock(product_sku text, phone text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.products p
  where p.sku = product_sku and p.stock_sheet = 0
    and (p.publicado or (p.tipo = 'Tapa color' and exists (
      select 1 from public.products parent
      where parent.sku = p.compatibilidad and parent.publicado
    )))
  for share;
  if not found then
    return false;
  end if;

  insert into public.restock_requests (sku, whatsapp)
  values (product_sku, phone)
  on conflict (sku, whatsapp) do update
    set notified_at = null, created_at = now()
    where restock_requests.notified_at is not null;
  return true;
end;
$$;

revoke execute on function public.request_restock(text, text) from public, anon, authenticated;
grant execute on function public.request_restock(text, text) to service_role;

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
  p.imagen_url,
  p.precio_publico,
  case
    when p.es_promocion and p.precio_promocional is not null
    then p.precio_promocional
    else null::numeric
  end as precio_promocional,
  (p.stock_sheet > 0) as en_stock,
  p.es_novedad,
  p.es_nuevo_ingreso,
  p.es_promocion,
  p.es_destacado,
  p.fecha_ingreso,
  p.orden_destacado,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'sku', v.sku,
          'parent_sku', v.compatibilidad,
          'nombre', v.nombre,
          'modelo', v.modelo,
          'color', v.calidad,
          'presentacion', v.marco,
          'imagen_url', v.imagen_url,
          'en_stock', (v.stock_sheet > 0)
        )
        order by v.calidad
      )
      from public.products v
      where v.tipo = 'Tapa color'
        and v.compatibilidad = p.sku
    ),
    '[]'::jsonb
  ) as variantes
from public.products p
where p.publicado = true;

