-- All fixture changes are rolled back. Run against a DB with at least one customer.
begin;
do $$
declare
  v_owner uuid;
  v_id uuid;
  v_version timestamptz := now()-interval '1 minute';
  v_result jsonb;
  v_changed integer;
  v_state text;
begin
  select id into v_owner from public.profiles where role <> 'ADMIN' limit 1;
  if v_owner is null then raise exception 'A customer fixture is required'; end if;
  insert into public.whatsapp_orders(user_id,customer_name,locality,delivery,items,total_estimated,updated_at)
  values(v_owner,'TEST ROLLBACK','Test','Retiro','[{"sku":"A51","nombre":"Placa A51","cantidad":1,"precio_unitario":6000,"subtotal":6000},{"sku":"BAT13","nombre":"Batería 13","cantidad":1,"precio_unitario":20000,"subtotal":20000}]',26000,v_version)
  returning id into v_id;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  execute 'set local role authenticated';
  -- A different customer cannot access this order even through the RPC.
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.change_customer_order(v_id,'cancel',null,v_version);
    raise exception 'FAIL: another customer edited the order';
  exception when sqlstate 'PT404' then null; end;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  -- Direct updates stay forbidden by RLS.
  update public.whatsapp_orders set total_estimated=1 where id=v_id;
  get diagnostics v_changed = row_count;
  if v_changed<>0 then raise exception 'FAIL: direct customer update allowed'; end if;
  begin
    perform public.change_customer_order(v_id,'remove_item',99,v_version);
    raise exception 'FAIL: invalid item index accepted';
  exception when sqlstate 'PT409' then null; end;
  v_result:=public.change_customer_order(v_id,'remove_item',0,v_version);
  if (v_result->>'total_estimated')::numeric<>20000 or jsonb_array_length(v_result->'items')<>1 or v_result->>'estado'<>'NUEVO' or v_result->>'notes' not like '%Cliente quitó 1× Placa A51%' then raise exception 'FAIL: removal/total/audit'; end if;
  begin
    perform public.change_customer_order(v_id,'remove_item',0,v_version);
    raise exception 'FAIL: stale edit accepted';
  exception when sqlstate 'PT409' then null; end;
  v_version:=(v_result->>'updated_at')::timestamptz;
  v_result:=public.change_customer_order(v_id,'remove_item',0,v_version);
  if v_result->>'estado'<>'CANCELADO' or jsonb_array_length(v_result->'items')<>1 or (v_result->>'total_estimated')::numeric<>20000 then raise exception 'FAIL: last-item cancellation/history'; end if;
  foreach v_state in array array['CONFIRMADO','PREPARADO','ENTREGADO','CANCELADO'] loop
    execute 'reset role';
    update public.whatsapp_orders set estado=v_state where id=v_id;
    execute 'set local role authenticated';
    begin
      perform public.change_customer_order(v_id,'cancel',null,now());
      raise exception 'FAIL: protected status edited';
    exception when sqlstate 'PT409' then null; end;
  end loop;
  execute 'reset role';
  update public.whatsapp_orders set estado='NUEVO',hidden_by_admin=true where id=v_id;
  execute 'set local role authenticated';
  begin
    perform public.change_customer_order(v_id,'cancel',null,now());
    raise exception 'FAIL: hidden order edited';
  exception when sqlstate 'PT404' then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.change_customer_order(v_id,'cancel',null,now());
    raise exception 'FAIL: missing identity accepted';
  exception when sqlstate 'PT401' then null; end;
  execute 'reset role';
  if has_function_privilege('anon','public.change_customer_order(uuid,text,integer,timestamptz)','execute') then raise exception 'FAIL: anonymous RPC execution allowed'; end if;
end $$;
rollback;
select 'PASS: ownership, RLS, totals, audit, cancellation, status, stale edits and anonymous access; fixtures rolled back' as result;
