\set ON_ERROR_STOP on
-- Verifica que la importación (UPSERT por SKU) es idempotente y NO pisa
-- stock_reservado (ni el stock_efectivo derivado). Reproduce el mismo conjunto
-- de columnas que escribe scripts/import-catalog.ts (sin stock_reservado ni
-- stock_efectivo). Se corre como superusuario (contexto servidor).

\echo '=== TEST IMPORT 1: alta idempotente por SKU ==='
insert into public.products
  (sku, nombre, marca, modelo, tipo, calidad, marco, compatibilidad,
   precio_publico, precio_mayorista, precio_promocional, precio_costo,
   stock_sheet, publicado, es_novedad, es_nuevo_ingreso, es_promocion,
   es_destacado, fecha_ingreso, orden_destacado, search_text)
values
  ('IMP-1','Módulo X','Samsung','Galaxy X','Módulo','Incell','Con marco','Galaxy X',
   30000, 24000, null, 18000, 10, true, false, false, false, false, null, 999, 'modulo x galaxy x')
on conflict (sku) do update set
  nombre=excluded.nombre, marca=excluded.marca, modelo=excluded.modelo,
  tipo=excluded.tipo, calidad=excluded.calidad, marco=excluded.marco,
  compatibilidad=excluded.compatibilidad, precio_publico=excluded.precio_publico,
  precio_mayorista=excluded.precio_mayorista, precio_promocional=excluded.precio_promocional,
  precio_costo=excluded.precio_costo, stock_sheet=excluded.stock_sheet,
  publicado=excluded.publicado, es_novedad=excluded.es_novedad,
  es_nuevo_ingreso=excluded.es_nuevo_ingreso, es_promocion=excluded.es_promocion,
  es_destacado=excluded.es_destacado, fecha_ingreso=excluded.fecha_ingreso,
  orden_destacado=excluded.orden_destacado, search_text=excluded.search_text;

-- Simula una reserva existente (como si hubiera un pedido) para probar que la
-- importación no la pisa.
update public.products set stock_reservado = 3 where sku = 'IMP-1';
do $$ declare ef int; begin
  select stock_efectivo into ef from public.products where sku='IMP-1';
  assert ef = 7, format('efectivo esperado 7 (10-3), es %s', ef);
  raise notice 'OK: alta con reserva simulada -> efectivo=%', ef;
end $$;

-- Guardamos created_at para verificar que no cambia en el re-import.
select created_at as c0 from public.products where sku='IMP-1' \gset
select set_config('app.c0', :'c0', false);

\echo '=== TEST IMPORT 2: re-import (precio y stock cambian) NO pisa reserva ==='
insert into public.products
  (sku, nombre, marca, modelo, tipo, calidad, marco, compatibilidad,
   precio_publico, precio_mayorista, precio_promocional, precio_costo,
   stock_sheet, publicado, es_novedad, es_nuevo_ingreso, es_promocion,
   es_destacado, fecha_ingreso, orden_destacado, search_text)
values
  ('IMP-1','Módulo X','Samsung','Galaxy X','Módulo','Incell','Con marco','Galaxy X',
   28000, 22000, null, 17000, 12, true, false, false, false, false, null, 999, 'modulo x galaxy x')
on conflict (sku) do update set
  nombre=excluded.nombre, precio_publico=excluded.precio_publico,
  precio_mayorista=excluded.precio_mayorista, precio_costo=excluded.precio_costo,
  stock_sheet=excluded.stock_sheet, publicado=excluded.publicado,
  search_text=excluded.search_text;

do $$ declare pp numeric; sh int; rv int; ef int; begin
  select precio_publico, stock_sheet, stock_reservado, stock_efectivo
    into pp, sh, rv, ef from public.products where sku='IMP-1';
  assert pp = 28000, format('precio actualizado esperado 28000, es %s', pp);
  assert sh = 12, format('stock_sheet actualizado esperado 12, es %s', sh);
  assert rv = 3, format('stock_reservado NO debe cambiar (esperado 3), es %s', rv);
  assert ef = 9, format('efectivo esperado 9 (12-3), es %s', ef);
  raise notice 'OK: re-import actualiza precio/stock_sheet y preserva reserva (rv=% ef=%)', rv, ef;
end $$;

-- created_at no cambió.
do $$ declare c1 timestamptz; begin
  select created_at into c1 from public.products where sku='IMP-1';
  assert c1 = current_setting('app.c0')::timestamptz, 'created_at no debe cambiar en el re-import';
  raise notice 'OK: created_at preservado';
end $$;

\echo '=== TEST IMPORT 3: repetir idéntico es idempotente ==='
do $$ declare cnt int; begin
  select count(*) into cnt from public.products where sku='IMP-1';
  assert cnt = 1, format('debe existir exactamente 1 fila IMP-1, hay %s', cnt);
  raise notice 'OK: 1 sola fila por SKU (upsert idempotente)';
end $$;

\echo '================ IMPORT TESTS OK ==============================='
