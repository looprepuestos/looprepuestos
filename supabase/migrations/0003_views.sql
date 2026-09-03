-- =============================================================================
-- LOOP REPUESTOS — Migración 0003: vista pública del catálogo
-- =============================================================================

-- Vista con SÓLO columnas públicas. Es la única forma en que anon/PUBLICO ven
-- el catálogo. Nunca expone precio_mayorista, precio_costo ni stock numérico.
-- El stock se publica como booleano (en_stock). Corre como SECURITY DEFINER
-- (owner del esquema), por eso filtra columnas a nivel de vista y sólo muestra
-- productos publicados.
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
    p.precio_publico,
    case
      when p.es_promocion and p.precio_promocional is not null
      then p.precio_promocional
    end as precio_promocional,
    (p.stock_efectivo > 0) as en_stock,
    p.es_novedad,
    p.es_nuevo_ingreso,
    p.es_promocion,
    p.es_destacado,
    p.fecha_ingreso,
    p.orden_destacado
  from public.products p
  where p.publicado;

comment on view public.catalogo_publico is
  'Payload público del catálogo. Sólo columnas públicas + en_stock booleano. '
  'Nunca precio_mayorista / precio_costo / stock numérico.';
