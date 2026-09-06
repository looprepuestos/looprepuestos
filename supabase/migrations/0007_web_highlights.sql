create table if not exists public.web_highlights (
  sheet_row integer primary key,
  tipo text not null check (tipo in ('Novedad', 'Nuevo ingreso', 'Oferta')),
  titulo text not null,
  texto text not null default '',
  sku_producto text,
  texto_boton text not null default 'Ver productos',
  fecha_desde date,
  fecha_hasta date,
  orden integer not null default 999,
  activo boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.web_highlights enable row level security;
grant select on public.web_highlights to anon, authenticated;

create policy web_highlights_public_read on public.web_highlights
for select to anon, authenticated
using (
  activo = true
  and (fecha_desde is null or fecha_desde <= current_date)
  and (fecha_hasta is null or fecha_hasta >= current_date)
);
