-- Variantes públicas de color para tapas traseras.
--
-- Las variantes viven en `products` para reutilizar el sincronizador de
-- Google Sheets y el cargador de fotos existentes. Permanecen con
-- `publicado = false`, por lo que nunca generan tarjetas independientes en
-- `catalogo_publico`. Esta vista expone únicamente los datos necesarios para
-- elegir un color disponible, sin costo, precio mayorista ni stock numérico.

create or replace view public.catalogo_variantes_publico as
select
  p.sku,
  p.compatibilidad as parent_sku,
  p.nombre,
  p.modelo,
  p.calidad as color,
  p.marco as presentacion,
  p.imagen_url,
  (p.stock_sheet > 0) as en_stock
from public.products p
where p.tipo = 'Tapa color'
  and p.compatibilidad <> ''
  and p.stock_sheet > 0;

comment on view public.catalogo_variantes_publico is
  'Variantes de color disponibles para tapas. No expone stock numérico, costo ni precios privados.';

grant select on public.catalogo_variantes_publico to anon, authenticated;
