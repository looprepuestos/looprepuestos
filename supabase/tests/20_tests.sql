\set ON_ERROR_STOP on
\timing off

\echo '================ TEST 1: separación de payload público ================'
-- anon NO puede leer la tabla products directamente.
do $$
begin
  set local role anon;
  begin
    perform 1 from public.products limit 1;
    raise exception 'FALLO: anon leyó products directamente';
  exception when insufficient_privilege then
    raise notice 'OK: anon NO puede leer products directamente';
  end;
end $$;

-- anon SÍ ve el catálogo público (sólo publicados => 2).
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from public.catalogo_publico;
  assert n = 3, format('esperaba 3 publicados, obtuve %s', n);
  raise notice 'OK: anon ve % productos en catalogo_publico', n;
end $$;

-- La vista NO tiene columnas privadas.
do $$
declare cols text;
begin
  select string_agg(column_name, ',') into cols
    from information_schema.columns
   where table_schema='public' and table_name='catalogo_publico';
  assert cols not like '%precio_mayorista%', 'la vista expone precio_mayorista';
  assert cols not like '%precio_costo%',    'la vista expone precio_costo';
  assert cols not like '%stock_sheet%',     'la vista expone stock_sheet';
  assert cols not like '%stock_reservado%', 'la vista expone stock_reservado';
  assert cols not like '%stock_efectivo%',  'la vista expone stock numérico';
  raise notice 'OK: catalogo_publico no expone mayorista/costo/stock numérico';
end $$;

\echo '================ TEST 2: precios mayoristas restringidos ================'
-- PUBLICO no puede obtener precios mayoristas.
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.get_wholesale_prices();
    raise exception 'FALLO: PUBLICO obtuvo precios mayoristas';
  exception when insufficient_privilege then
    raise notice 'OK: PUBLICO no puede obtener precios mayoristas';
  end;
end $$;

\echo '================ TEST 3: anti-escalada de rol ================'
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    update public.profiles set role = 'ADMIN' where id = auth.uid();
    raise exception 'FALLO: PUBLICO se auto-promovió a ADMIN';
  exception when insufficient_privilege then
    raise notice 'OK: un cliente no-admin no puede cambiar su rol';
  end;
end $$;

\echo '================ TEST 4: aprobación mayorista (RPC admin) ================'
-- mayo crea su solicitud.
set role authenticated;
select set_config('app.uid', '33333333-3333-3333-3333-333333333333', false);
insert into public.account_requests (user_id, nombre, service_local, localidad, whatsapp)
values ('33333333-3333-3333-3333-333333333333', 'Juan', 'Service Centro', 'Córdoba', '3510000000')
returning id as req_id \gset
reset role;

-- admin aprueba.
set role authenticated;
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', false);
select public.resolver_solicitud_mayorista(:'req_id', true);
reset role;

do $$
declare r public.user_role;
begin
  select role into r from public.profiles
    where id = '33333333-3333-3333-3333-333333333333';
  assert r = 'MAYORISTA', format('esperaba MAYORISTA, es %s', r);
  raise notice 'OK: solicitud aprobada => rol MAYORISTA';
end $$;

\echo '================ TEST 5: STOCK anti-sync (escenario clave) ============='
-- Estado inicial MOD-X: sheet=10, reservado=0, efectivo=10.
do $$
declare ef int;
begin
  select stock_efectivo into ef from public.products where sku='MOD-X';
  assert ef = 10, format('efectivo inicial esperado 10, es %s', ef);
  raise notice 'Inicial: sheet=10 reservado=0 efectivo=%', ef;
end $$;

-- LOOP vende 2 (place_order server-side como PUBLICO logueado).
set role authenticated;
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
select public.place_order('[{"sku":"MOD-X","cantidad":2}]'::jsonb) as ord_id \gset
reset role;

do $$
declare sh int; rv int; ef int;
begin
  select stock_sheet, stock_reservado, stock_efectivo into sh, rv, ef
    from public.products where sku='MOD-X';
  assert sh=10 and rv=2 and ef=8, format('post-venta sheet=%s reservado=%s efectivo=%s', sh, rv, ef);
  raise notice 'Post-venta: sheet=% reservado=% efectivo=%', sh, rv, ef;
end $$;

-- >>> SIMULACIÓN DE RE-SYNC DESDE GOOGLE SHEETS <<<
-- La sync escribe SÓLO stock_sheet (vuelve a poner 10). No debe restaurar lo vendido.
update public.products set stock_sheet = 10 where sku = 'MOD-X';

do $$
declare sh int; rv int; ef int;
begin
  select stock_sheet, stock_reservado, stock_efectivo into sh, rv, ef
    from public.products where sku='MOD-X';
  assert ef = 8, format('tras re-sync efectivo esperado 8, es %s', ef);
  raise notice 'Tras RE-SYNC (sheet=10): reservado=% efectivo=%  => venta preservada', rv, ef;
end $$;

-- (La ENTREGA y su RECONCILIACIÓN se prueban en los Tests 8 y 9, usando este
--  mismo pedido de MOD-X: por ahora queda pendiente, reservado=2, efectivo=8.)

\echo '================ TEST 6: precio/stock resueltos server-side ==========='
-- PUBLICO paga precio promocional en PROMO-Y (7000), no el público (10000).
set role authenticated;
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
select public.place_order('[{"sku":"PROMO-Y","cantidad":1}]'::jsonb) as pub_ord \gset
reset role;
do $$
declare pu numeric; tot numeric;
begin
  select oi.precio_unitario, o.total into pu, tot
    from public.orders o join public.order_items oi on oi.order_id=o.id
   where o.user_id = '22222222-2222-2222-2222-222222222222' and oi.sku='PROMO-Y';
  assert pu = 7000, format('PUBLICO promo esperado 7000, es %s', pu);
  assert tot = 7000, format('total esperado 7000, es %s', tot);
  raise notice 'OK: PUBLICO paga promo=%, total=%', pu, tot;
end $$;

-- MAYORISTA paga precio mayorista en PROMO-Y (6000).
set role authenticated;
select set_config('app.uid', '33333333-3333-3333-3333-333333333333', false);
select public.place_order('[{"sku":"PROMO-Y","cantidad":2}]'::jsonb) as may_ord \gset
reset role;
do $$
declare pu numeric; tot numeric; rol public.user_role;
begin
  select oi.precio_unitario, o.total, o.rol_aplicado into pu, tot, rol
    from public.orders o join public.order_items oi on oi.order_id=o.id
   where o.user_id = '33333333-3333-3333-3333-333333333333' and oi.sku='PROMO-Y';
  assert pu = 6000, format('MAYORISTA esperado 6000, es %s', pu);
  assert tot = 12000, format('total esperado 12000, es %s', tot);
  assert rol = 'MAYORISTA', 'rol_aplicado incorrecto';
  raise notice 'OK: MAYORISTA paga mayorista=%, total=% (2u)', pu, tot;
end $$;

\echo '================ TEST 7: no permite sobreventa ========================'
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.place_order('[{"sku":"MOD-X","cantidad":9999}]'::jsonb);
    raise exception 'FALLO: permitió sobreventa';
  exception when others then
    if sqlerrm like '%Stock insuficiente%' then
      raise notice 'OK: bloqueó sobreventa: %', sqlerrm;
    else raise;
    end if;
  end;
end $$;

-- Guardamos el id del pedido de MOD-X en un GUC para poder usarlo dentro de
-- bloques DO (psql no interpola :vars dentro de $$...$$).
select set_config('app.test_ord', :'ord_id', false);

\echo '=== TEST 8: máquina de estados de inventario (entregado sigue reservando)'
-- Entregamos el pedido de MOD-X (2u). Estado sync = pending (default). sheet=10.
update public.orders set estado = 'entregado' where id = :'ord_id';
do $$
declare rv int; ef int; st public.stock_sync_status;
begin
  select stock_reservado, stock_efectivo into rv, ef from public.products where sku='MOD-X';
  select stock_sync_status into st from public.orders where id = current_setting('app.test_ord')::uuid;
  assert rv = 2 and ef = 8, format('entregado/pending debe reservar: rv=%s ef=%s', rv, ef);
  assert st = 'pending', format('estado sync esperado pending, es %s', st);
  raise notice 'OK: entregado (pending) reserva=% efectivo=% (no restaura)', rv, ef;
end $$;

-- Un intento de sync que falla: marcar_stock_error => sigue reservando (retry seguro).
do $$
declare v_ord uuid := current_setting('app.test_ord')::uuid; rv int; st public.stock_sync_status;
begin
  set local role authenticated;
  perform set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);
  perform public.marcar_stock_error(v_ord);
  reset role;
  select stock_reservado into rv from public.products where sku='MOD-X';
  select stock_sync_status into st from public.orders where id = v_ord;
  assert rv = 2 and st = 'error', format('error debe seguir reservando: rv=%s st=%s', rv, st);
  raise notice 'OK: estado error sigue reservando (reintentable)';
end $$;

-- Reconciliar ANTES de aplicar al Sheet => error controlado, sin alterar stock.
do $$
declare v_ord uuid := current_setting('app.test_ord')::uuid; rv int;
begin
  set local role authenticated;
  perform set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);
  begin
    perform public.reconciliar_pedido(v_ord);
    raise exception 'FALLO: reconcilió antes de sheet_applied';
  exception when sqlstate '55000' then
    reset role;
    select stock_reservado into rv from public.products where sku='MOD-X';
    assert rv = 2, format('el stock no debe cambiar tras el error, rv=%s', rv);
    raise notice 'OK: no se puede reconciliar antes de aplicar la baja al Sheet';
  end;
end $$;

\echo '=== TEST 9: sheet_applied seguro, reconciliado libera, retry idempotente '
-- El worker escribe la baja física en el Sheet (10 -> 8) y confirma.
update public.products set stock_sheet = 8 where sku = 'MOD-X';
-- Marca sheet_applied: sigue reservando (seguro). efectivo = 8 - 2 = 6 (conservador).
do $$
declare v_ord uuid := current_setting('app.test_ord')::uuid; rv int; ef int; st public.stock_sync_status;
begin
  set local role authenticated;
  perform set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);
  perform public.marcar_sheet_aplicado(v_ord);
  reset role;
  select stock_reservado, stock_efectivo into rv, ef from public.products where sku='MOD-X';
  select stock_sync_status into st from public.orders where id = v_ord;
  assert st = 'sheet_applied', format('estado esperado sheet_applied, es %s', st);
  assert rv = 2, format('sheet_applied debe seguir reservando, rv=%s', rv);
  raise notice 'OK: sheet_applied sigue reservando (rv=% ef=%, seguro)', rv, ef;
end $$;

-- Reconciliar: libera la reserva. efectivo = 8 - 0 = 8.
do $$
declare v_ord uuid := current_setting('app.test_ord')::uuid; rv int; ef int; st public.stock_sync_status;
begin
  set local role authenticated;
  perform set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);
  perform public.reconciliar_pedido(v_ord);
  reset role;
  select stock_reservado, stock_efectivo into rv, ef from public.products where sku='MOD-X';
  select stock_sync_status into st from public.orders where id = v_ord;
  assert st = 'reconciled' and rv = 0 and ef = 8,
    format('reconciliado debe liberar: st=%s rv=%s ef=%s', st, rv, ef);
  raise notice 'OK: reconciliado libera reserva (rv=% ef=%)', rv, ef;
end $$;

-- Retry: reconciliar de nuevo es idempotente => NO produce segunda liberación.
do $$
declare v_ord uuid := current_setting('app.test_ord')::uuid; rv int; ef int;
begin
  set local role authenticated;
  perform set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);
  perform public.reconciliar_pedido(v_ord);   -- no debe fallar ni cambiar nada
  perform public.marcar_sheet_aplicado(v_ord);-- idempotente también
  reset role;
  select stock_reservado, stock_efectivo into rv, ef from public.products where sku='MOD-X';
  assert rv = 0 and ef = 8, format('retry no debe alterar stock: rv=%s ef=%s', rv, ef);
  raise notice 'OK: reconciliar/aplicar repetido es idempotente (sin segunda liberación)';
end $$;

\echo '=== TEST 10: cliente no puede insertar metadatos administrativos ======='
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    insert into public.account_requests
      (user_id, nombre, service_local, localidad, whatsapp, revisado_por)
    values ('22222222-2222-2222-2222-222222222222', 'X', 'Y', 'Z', '000',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'FALLO: cliente insertó revisado_por';
  exception when insufficient_privilege then
    raise notice 'OK: RLS bloquea insertar revisado_por/decided_at';
  end;
end $$;

\echo '=== TEST 11: usuario no puede modificar email/role del profile ========='
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    update public.profiles set email = 'hacker@x' where id = auth.uid();
    raise exception 'FALLO: modificó email';
  exception when insufficient_privilege then
    raise notice 'OK: no puede modificar email (grant por columna)';
  end;
end $$;
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    update public.profiles set role = 'ADMIN' where id = auth.uid();
    raise exception 'FALLO: modificó role';
  exception when insufficient_privilege then
    raise notice 'OK: no puede modificar role';
  end;
end $$;
-- Positivo: sí puede cambiar su nombre vía RPC update_profile.
set role authenticated;
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
select public.update_profile('Técnico Actualizado');
reset role;
do $$
declare nm text;
begin
  select nombre into nm from public.profiles
    where id = '22222222-2222-2222-2222-222222222222';
  assert nm = 'Técnico Actualizado', format('esperaba nombre actualizado, es %s', nm);
  raise notice 'OK: update_profile actualiza sólo el nombre';
end $$;

\echo '=== TEST 12: mayorista paga el MENOR entre promo y precio mayorista ===='
-- PROMO-M: mayorista=12000 pero promo=9000 => debe pagar 9000.
set role authenticated;
select set_config('app.uid', '33333333-3333-3333-3333-333333333333', false);
select public.place_order('[{"sku":"PROMO-M","cantidad":1}]'::jsonb) as m2_ord \gset
reset role;
do $$
declare pu numeric;
begin
  select oi.precio_unitario into pu
    from public.orders o join public.order_items oi on oi.order_id=o.id
   where o.user_id='33333333-3333-3333-3333-333333333333' and oi.sku='PROMO-M';
  assert pu = 9000, format('esperaba 9000 (min entre mayorista 12000 y promo 9000), es %s', pu);
  raise notice 'OK: place_order aplica el menor (promo 9000 < mayorista 12000)';
end $$;
-- get_wholesale_prices debe coincidir con place_order.
do $$
declare p numeric;
begin
  set local role authenticated;
  perform set_config('app.uid', '33333333-3333-3333-3333-333333333333', true);
  select gw.precio_mayorista into p from public.get_wholesale_prices() gw where gw.sku='PROMO-M';
  assert p = 9000, format('get_wholesale_prices esperaba 9000, es %s', p);
  raise notice 'OK: get_wholesale_prices coincide con place_order (9000)';
end $$;

\echo '=== TEST 13: funciones internas no ejecutables por roles no autorizados '
-- Helper interno recompute_stock_reservado: revocado de PUBLIC.
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.recompute_stock_reservado(array[]::uuid[]);
    raise exception 'FALLO: ejecutó recompute_stock_reservado';
  exception when insufficient_privilege then
    raise notice 'OK: helper interno recompute_stock_reservado no ejecutable';
  end;
end $$;
-- anon no puede ejecutar place_order.
do $$
begin
  set local role anon;
  begin
    perform public.place_order('[]'::jsonb);
    raise exception 'FALLO: anon ejecutó place_order';
  exception when insufficient_privilege then
    raise notice 'OK: anon no puede ejecutar place_order';
  end;
end $$;
-- PUBLICO no puede reconciliar (RPC admin).
do $$
begin
  set local role authenticated;
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.reconciliar_pedido('00000000-0000-0000-0000-000000000000');
    raise exception 'FALLO: PUBLICO reconcilió';
  exception when insufficient_privilege then
    raise notice 'OK: reconciliar_pedido exige ADMIN';
  end;
end $$;

\echo '=== TEST 14: SKU duplicado en place_order se agrupa =================='
-- [{MOD-X:2},{MOD-X:3}] debe crear UNA línea de cantidad 5 (no dos).
-- MOD-X en este punto: sheet=8, reservado=0, efectivo=8 (>=5).
set role authenticated;
select set_config('app.uid', '22222222-2222-2222-2222-222222222222', false);
select public.place_order('[{"sku":"MOD-X","cantidad":2},{"sku":"MOD-X","cantidad":3}]'::jsonb) as dup_ord \gset
reset role;
select set_config('app.test_dup', :'dup_ord', false);
do $$
declare v_ord uuid := current_setting('app.test_dup')::uuid; n int; q int;
begin
  select count(*), coalesce(sum(cantidad), 0) into n, q
    from public.order_items where order_id = v_ord;
  assert n = 1, format('esperaba 1 línea agrupada, hay %s', n);
  assert q = 5, format('esperaba cantidad agrupada 5, es %s', q);
  raise notice 'OK: SKU duplicado normalizado a 1 línea de cantidad %', q;
end $$;

\echo '================ TODOS LOS TESTS PASARON ==============================='
