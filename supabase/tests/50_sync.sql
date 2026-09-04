-- =============================================================================
-- LOOP REPUESTOS — Tests de sincronización atómica (migración 0006).
-- Corre después de 0001-0006 + seed. Cubre los escenarios OBLIGATORIOS:
--   * misma corrida x2 = sin cambios (idempotencia)
--   * cambio de precio = sólo ese SKU actualizado
--   * fila inválida = reportada pero NO despublicada
--   * SKU borrado del Sheet = soft-unpublish
--   * lectura vacía = aborta sin modificar products
--   * crash a mitad de aplicación = rollback total
--   * foto vacía / válida / inválida
--   * promo inválida no publica un precio falso
--   * NUNCA modifica stock_reservado, orders ni order_items
--   * EN/SIN STOCK público depende EXCLUSIVAMENTE de stock_sheet
-- Se ejecuta como `loop` (contexto servidor / service_role).
-- =============================================================================
\set ON_ERROR_STOP on
\timing off

-- Sacamos del "universo en planilla" a todo lo que NO sea de estos tests, para
-- que la guardia y la reconciliación operen sólo sobre los SKU SYNC-*.
update public.products set en_planilla = false where sku not like 'SYNC-%';

-- --- Helpers de test (temporales) -------------------------------------------
-- Fila de Sheet ya mapeada+validada, tal como la manda el orquestador.
create or replace function public._srow(
  p_sku text,
  p_hash text,
  p_precio numeric default 1000,
  p_stock integer default 5,
  p_pub boolean default true,
  p_promo boolean default false,
  p_promo_precio numeric default null,
  p_imagen text default null
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'sku', p_sku,
    'nombre', 'Producto ' || p_sku,
    'marca', 'Samsung',
    'modelo', 'Galaxy A10',
    'tipo', 'Módulo',
    'calidad', 'Incell',
    'marco', 'Con marco',
    'compatibilidad', 'A10',
    'imagen_url', p_imagen,
    'precio_publico', p_precio,
    'precio_promocional', p_promo_precio,
    'precio_mayorista', p_precio * 0.8,
    'precio_costo', p_precio * 0.5,
    'stock_sheet', p_stock,
    'publicado', p_pub,
    'es_novedad', false,
    'es_nuevo_ingreso', false,
    'es_promocion', p_promo,
    'es_destacado', false,
    'fecha_ingreso', null,
    'orden_destacado', 999,
    'search_text', 'producto ' || lower(p_sku),
    'source_row_hash', p_hash
  );
$$;

-- Reinicia la línea base: 5 productos SYNC-A..E, en planilla y publicados.
create or replace function public._sync_reset() returns void language plpgsql as $$
begin
  delete from public.products where sku like 'SYNC-%';
  insert into public.products
    (sku, nombre, marca, modelo, tipo, calidad, marco, compatibilidad,
     precio_publico, precio_mayorista, precio_costo, stock_sheet, stock_reservado,
     publicado, en_planilla, source_row_hash)
  values
    ('SYNC-A','Producto SYNC-A','Samsung','Galaxy A10','Módulo','Incell','Con marco','A10',1000, 800, 500,5,0,true,true,'hA1'),
    ('SYNC-B','Producto SYNC-B','Samsung','Galaxy A10','Módulo','Incell','Con marco','A10',2000,1600,1000,0,0,true,true,'hB1'),
    ('SYNC-C','Producto SYNC-C','Samsung','Galaxy A10','Módulo','Incell','Con marco','A10',3000,2400,1500,3,0,true,true,'hC1'),
    ('SYNC-D','Producto SYNC-D','Samsung','Galaxy A10','Módulo','Incell','Con marco','A10',4000,3200,2000,1,0,true,true,'hD1'),
    ('SYNC-E','Producto SYNC-E','Samsung','Galaxy A10','Módulo','Incell','Con marco','A10',5000,4000,2500,9,0,true,true,'hE1');
end $$;

\echo '================ TEST S1: idempotencia (misma corrida x2) ================'
do $$
declare v_log public.sync_logs; v_rows jsonb; v_seen jsonb;
begin
  perform public._sync_reset();
  v_rows := jsonb_build_array(
    public._srow('SYNC-A','hA1'), public._srow('SYNC-B','hB1',2000,0),
    public._srow('SYNC-C','hC1',3000,3), public._srow('SYNC-D','hD1',4000,1),
    public._srow('SYNC-E','hE1',5000,9));
  v_seen := '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb;
  -- 1ra corrida: todo igual al baseline (mismos hashes) => sin cambios.
  v_log := public.apply_sheet_sync(v_rows, v_seen, '[]'::jsonb, 5, 'manual');
  assert v_log.estado = 'ok', 'S1: estado esperado ok';
  assert v_log.sin_cambios = 5, format('S1: esperaba 5 sin_cambios, obtuve %s', v_log.sin_cambios);
  assert v_log.creados = 0 and v_log.actualizados = 0 and v_log.despublicados = 0, 'S1: no debía crear/actualizar/despublicar';
  -- 2da corrida idéntica => idéntico resultado (idempotente).
  v_log := public.apply_sheet_sync(v_rows, v_seen, '[]'::jsonb, 5, 'manual');
  assert v_log.sin_cambios = 5 and v_log.actualizados = 0 and v_log.despublicados = 0, 'S1: 2da corrida no debía cambiar nada';
  raise notice 'OK S1: dos corridas idénticas no producen cambios';
end $$;

\echo '================ TEST S2: cambio de precio actualiza SÓLO ese SKU ========'
do $$
declare v_log public.sync_logs; v_a numeric; v_b numeric; v_bhash text;
begin
  perform public._sync_reset();
  v_bhash := (select source_row_hash from public.products where sku='SYNC-B');
  -- SYNC-A cambia (hash nuevo + precio nuevo); el resto igual.
  v_log := public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA2',1500),      -- CAMBIÓ
      public._srow('SYNC-B','hB1',2000,0),
      public._srow('SYNC-C','hC1',3000,3),
      public._srow('SYNC-D','hD1',4000,1),
      public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual');
  assert v_log.actualizados = 1, format('S2: esperaba 1 actualizado, obtuve %s', v_log.actualizados);
  assert v_log.sin_cambios = 4, format('S2: esperaba 4 sin_cambios, obtuve %s', v_log.sin_cambios);
  select precio_publico into v_a from public.products where sku='SYNC-A';
  select precio_publico into v_b from public.products where sku='SYNC-B';
  assert v_a = 1500, format('S2: SYNC-A debía valer 1500, vale %s', v_a);
  assert v_b = 2000, format('S2: SYNC-B NO debía cambiar, vale %s', v_b);
  assert (select source_row_hash from public.products where sku='SYNC-B') = v_bhash, 'S2: hash de SYNC-B no debía cambiar';
  raise notice 'OK S2: sólo SYNC-A fue actualizado';
end $$;

\echo '================ TEST S3: fila inválida NO despublica el SKU =============='
do $$
declare v_log public.sync_logs; v_pub boolean; v_plan boolean;
begin
  perform public._sync_reset();
  -- SYNC-B viene INVÁLIDA: no entra en p_rows, PERO sí en p_seen_skus (está
  -- físicamente en la planilla). El orquestador la reporta en p_errors.
  v_log := public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA1'), public._srow('SYNC-C','hC1',3000,3),
      public._srow('SYNC-D','hD1',4000,1), public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb,
    '[{"sku":"SYNC-B","line":3,"messages":["precio_publico inválido"]}]'::jsonb,
    5, 'manual');
  assert v_log.estado = 'ok', 'S3: estado ok';
  assert v_log.saltados_invalidos = 1, format('S3: esperaba 1 saltado, obtuve %s', v_log.saltados_invalidos);
  assert v_log.despublicados = 0, format('S3: NO debía despublicar, despublicó %s', v_log.despublicados);
  select publicado, en_planilla into v_pub, v_plan from public.products where sku='SYNC-B';
  assert v_pub = true and v_plan = true, 'S3: SYNC-B (inválida pero presente) debe seguir publicada y en planilla';
  raise notice 'OK S3: fila inválida se reporta pero NO se despublica';
end $$;

\echo '================ TEST S4: SKU borrado del Sheet => soft-unpublish ========='
do $$
declare v_log public.sync_logs; v_pub boolean; v_plan boolean; v_a_pub boolean;
begin
  perform public._sync_reset();
  -- SYNC-E ya no aparece (ni en filas ni en seen). Los otros 4 siguen.
  -- activos=5, vistos=4, ceil(0.7*5)=4 => 4>=4 pasa la guardia (sin force).
  v_log := public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA1'), public._srow('SYNC-B','hB1',2000,0),
      public._srow('SYNC-C','hC1',3000,3), public._srow('SYNC-D','hD1',4000,1)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D"]'::jsonb, '[]'::jsonb, 4, 'manual');
  assert v_log.estado = 'ok', 'S4: estado ok';
  assert v_log.despublicados = 1, format('S4: esperaba 1 despublicado, obtuve %s', v_log.despublicados);
  select publicado, en_planilla into v_pub, v_plan from public.products where sku='SYNC-E';
  assert v_pub = false and v_plan = false, 'S4: SYNC-E debe quedar NO publicada y fuera de planilla';
  select publicado into v_a_pub from public.products where sku='SYNC-A';
  assert v_a_pub = true, 'S4: SYNC-A no debía tocarse';
  -- Reaparición: SYNC-E vuelve al Sheet => se re-publica (rama not en_planilla).
  v_log := public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA1'), public._srow('SYNC-B','hB1',2000,0),
      public._srow('SYNC-C','hC1',3000,3), public._srow('SYNC-D','hD1',4000,1),
      public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual', 0.70, true);
  select publicado, en_planilla into v_pub, v_plan from public.products where sku='SYNC-E';
  assert v_pub = true and v_plan = true, 'S4: SYNC-E debía re-publicarse al reaparecer';
  raise notice 'OK S4: borrado real hace soft-unpublish; reaparición re-publica';
end $$;

\echo '================ TEST S5: lectura vacía ABORTA sin tocar products ========='
do $$
declare v_log public.sync_logs; v_pub_antes int; v_pub_desp int;
begin
  perform public._sync_reset();
  select count(*) into v_pub_antes from public.products where sku like 'SYNC-%' and publicado;
  -- Lectura vacía: sin filas, sin seen. activos=5, vistos=0 < ceil(0.7*5)=4 => aborta.
  v_log := public.apply_sheet_sync('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0, 'cron');
  assert v_log.estado = 'abortado', format('S5: esperaba abortado, obtuve %s', v_log.estado);
  assert v_log.despublicados = 0, 'S5: no debía despublicar';
  select count(*) into v_pub_desp from public.products where sku like 'SYNC-%' and publicado;
  assert v_pub_antes = v_pub_desp, format('S5: publicados cambiaron %s -> %s', v_pub_antes, v_pub_desp);
  -- Con force=true, una lectura vacía SÍ despublicaría todo (cambio deliberado).
  raise notice 'OK S5: lectura vacía aborta por guardia, products intacto';
end $$;

\echo '================ TEST S6: crash a mitad => ROLLBACK total (atomicidad) ===='
do $$
declare v_log public.sync_logs; v_a numeric; v_crashed boolean := false;
begin
  perform public._sync_reset();
  -- Fila 1 actualiza SYNC-A (válida); fila 2 tiene precio no-casteable => la RPC
  -- lanza durante el INSERT. Debe revertirse TODO, incluido el update de SYNC-A.
  begin
    v_log := public.apply_sheet_sync(
      jsonb_build_array(
        public._srow('SYNC-A','hA9',9999),                                  -- update válido
        jsonb_build_object('sku','SYNC-CRASH','nombre','x','precio_publico','no-numerico',
                           'stock_sheet',1,'publicado',true,'source_row_hash','hz')),  -- rompe
      '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E","SYNC-CRASH"]'::jsonb,
      '[]'::jsonb, 6, 'manual', 0.70, true);
    raise exception 'S6: la RPC debía fallar y no lo hizo';
  exception when others then
    v_crashed := true;
  end;
  assert v_crashed, 'S6: se esperaba una excepción de la RPC';
  select precio_publico into v_a from public.products where sku='SYNC-A';
  assert v_a = 1000, format('S6: SYNC-A debía revertir a 1000, quedó en %s (aplicación parcial!)', v_a);
  assert not exists (select 1 from public.products where sku='SYNC-CRASH'), 'S6: SYNC-CRASH no debía insertarse';
  raise notice 'OK S6: error a mitad revierte TODO (transacción atómica)';
end $$;

\echo '================ TEST S7: foto vacía / válida / inválida =================='
do $$
declare v_log public.sync_logs; v_img text;
begin
  perform public._sync_reset();
  -- La foto inválida ya la neutraliza el mapper (imagen_url=null); la RPC guarda
  -- exactamente lo validado: URL válida, o null si venía vacía.
  v_log := public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA-img', 1000,5,true,false,null,'https://cdn.looprepuestos.com/a.jpg'),
      public._srow('SYNC-B','hB-img', 2000,0,true,false,null,''),     -- vacía => null
      public._srow('SYNC-C','hC1',3000,3), public._srow('SYNC-D','hD1',4000,1),
      public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual');
  select imagen_url into v_img from public.products where sku='SYNC-A';
  assert v_img = 'https://cdn.looprepuestos.com/a.jpg', format('S7: foto válida debía guardarse, quedó %s', v_img);
  select imagen_url into v_img from public.products where sku='SYNC-B';
  assert v_img is null, 'S7: foto vacía debía quedar null (nullif)';
  -- Y la vista pública expone imagen_url tal cual.
  assert (select imagen_url from public.catalogo_publico where sku='SYNC-A') = 'https://cdn.looprepuestos.com/a.jpg', 'S7: la vista debe exponer la foto';
  raise notice 'OK S7: foto válida se guarda, vacía => null';
end $$;

\echo '================ TEST S8: promo inválida NO publica precio falso =========='
do $$
declare v_promo_view numeric; v_promo_valida numeric;
begin
  perform public._sync_reset();
  -- Caso 1: el mapper desactivó una promo inválida => llega es_promocion=false,
  -- precio_promocional=null. La vista NO debe mostrar precio promocional.
  perform public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA-np', 1000,5,true,false,null),  -- sin promo
      public._srow('SYNC-B','hB1',2000,0), public._srow('SYNC-C','hC1',3000,3),
      public._srow('SYNC-D','hD1',4000,1), public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual');
  select precio_promocional into v_promo_view from public.catalogo_publico where sku='SYNC-A';
  assert v_promo_view is null, format('S8: promo inválida NO debía exponer precio, expuso %s', v_promo_view);
  -- Caso 2: promo válida (700 < 1000) => la vista sí muestra 700.
  perform public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA-p', 1000,5,true,true,700),      -- promo válida
      public._srow('SYNC-B','hB1',2000,0), public._srow('SYNC-C','hC1',3000,3),
      public._srow('SYNC-D','hD1',4000,1), public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual');
  select precio_promocional into v_promo_valida from public.catalogo_publico where sku='SYNC-A';
  assert v_promo_valida = 700, format('S8: promo válida debía exponer 700, expuso %s', v_promo_valida);
  raise notice 'OK S8: la vista sólo muestra promo cuando es válida';
end $$;

\echo '================ TEST S9: NUNCA toca stock_reservado / orders / items ====='
do $$
declare v_log public.sync_logs; v_reserv int; v_ordenes bigint; v_items bigint;
        v_ordenes2 bigint; v_items2 bigint;
begin
  perform public._sync_reset();
  -- Simulamos reserva viva (infra dormida) y contamos orders/items antes.
  update public.products set stock_reservado = 3 where sku='SYNC-A';
  select count(*) into v_ordenes from public.orders;
  select count(*) into v_items   from public.order_items;
  -- Sync que actualiza SYNC-A (hash nuevo).
  v_log := public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA-r',1200), public._srow('SYNC-B','hB1',2000,0),
      public._srow('SYNC-C','hC1',3000,3), public._srow('SYNC-D','hD1',4000,1),
      public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual');
  select stock_reservado into v_reserv from public.products where sku='SYNC-A';
  assert v_reserv = 3, format('S9: stock_reservado debía seguir en 3, quedó %s', v_reserv);
  select count(*) into v_ordenes2 from public.orders;
  select count(*) into v_items2   from public.order_items;
  assert v_ordenes = v_ordenes2, 'S9: la sync no debe crear/borrar orders';
  assert v_items = v_items2, 'S9: la sync no debe crear/borrar order_items';
  raise notice 'OK S9: stock_reservado, orders y order_items intactos';
end $$;

\echo '================ TEST S10: EN/SIN STOCK público = stock_sheet (no reservas)'
do $$
declare v_en_c boolean; v_en_d boolean; v_efectivo_c int;
begin
  perform public._sync_reset();
  -- SYNC-C: stock_sheet=5 pero TODO reservado (efectivo=0). Público: EN STOCK.
  update public.products set stock_reservado = 5 where sku='SYNC-C'; -- efectivo=0
  -- SYNC-D pasa a stock_sheet=0 vía sync. Público: SIN STOCK.
  perform public.apply_sheet_sync(
    jsonb_build_array(
      public._srow('SYNC-A','hA1'), public._srow('SYNC-B','hB1',2000,0),
      public._srow('SYNC-C','hC1',3000,5), public._srow('SYNC-D','hD0',4000,0),
      public._srow('SYNC-E','hE1',5000,9)),
    '["SYNC-A","SYNC-B","SYNC-C","SYNC-D","SYNC-E"]'::jsonb, '[]'::jsonb, 5, 'manual');
  select stock_efectivo into v_efectivo_c from public.products where sku='SYNC-C';
  assert v_efectivo_c = 0, format('S10: efectivo de SYNC-C debía ser 0, es %s', v_efectivo_c);
  select en_stock into v_en_c from public.catalogo_publico where sku='SYNC-C';
  assert v_en_c = true, 'S10: SYNC-C con stock_sheet>0 debe verse EN STOCK aunque efectivo=0';
  select en_stock into v_en_d from public.catalogo_publico where sku='SYNC-D';
  assert v_en_d = false, 'S10: SYNC-D con stock_sheet=0 debe verse SIN STOCK';
  raise notice 'OK S10: EN/SIN STOCK depende de stock_sheet, no de reservas';
end $$;

-- --- Limpieza de helpers y de los datos de prueba ---------------------------
drop function if exists public._srow(text, text, numeric, integer, boolean, boolean, numeric, text);
drop function if exists public._sync_reset();
delete from public.products where sku like 'SYNC-%';

\echo '================ TODOS LOS TESTS DE SYNC PASARON ========================='
