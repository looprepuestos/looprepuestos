-- LOOP REPUESTOS — foto pública opcional por producto.
-- La URL se sincronizará desde Google Sheets. No se inventan imágenes.
alter table public.products
  add column if not exists imagen_url text;

create or replace view public.catalogo_publico
with (security_invoker = true)
as
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
    p.precio_promocional,
    (p.stock_efectivo > 0) as en_stock,
    p.es_novedad,
    p.es_nuevo_ingreso,
    p.es_promocion,
    p.es_destacado,
    p.fecha_ingreso,
    p.orden_destacado
from public.products p
where p.publicado = true;

grant select on public.catalogo_publico to anon, authenticated;
