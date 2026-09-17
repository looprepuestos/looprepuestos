-- Incorpora las variantes al payload de cada producto padre. De este modo se
-- mantiene una única lectura pública y una única vista de catálogo.

drop view if exists public.catalogo_variantes_publico;

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
        and v.stock_sheet > 0
    ),
    '[]'::jsonb
  ) as variantes
from public.products p
where p.publicado = true;

comment on view public.catalogo_publico is
  'Payload público del catálogo. Incluye variantes de color disponibles, sin stock numérico, costo ni precios privados.';

grant select on public.catalogo_publico to anon, authenticated;
