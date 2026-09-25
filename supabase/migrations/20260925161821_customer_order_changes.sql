-- Narrow authenticated RPC; direct customer UPDATE remains denied by RLS.
create schema if not exists loop_order_actions;
revoke all on schema loop_order_actions from public, anon;
grant usage on schema loop_order_actions to authenticated;

create or replace function loop_order_actions.change_customer_order(
  p_order_id uuid, p_action text, p_item_index integer, p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_order public.whatsapp_orders%rowtype;
  v_items jsonb;
  v_removed jsonb;
  v_total numeric;
  v_cancel boolean;
  v_note text;
begin
  if v_uid is null then raise exception using errcode='PT401', message='Primero iniciá sesión.'; end if;
  if p_action is null or p_action not in ('cancel','remove_item') or p_expected_updated_at is null then
    raise exception using errcode='PT400', message='Acción inválida.';
  end if;
  select * into v_order from public.whatsapp_orders
    where id=p_order_id and user_id=v_uid and hidden_by_admin=false for update;
  if not found then raise exception using errcode='PT404', message='No se encontró el pedido.'; end if;
  if v_order.estado <> 'NUEVO' then
    raise exception using errcode='PT409', message='Solo podés modificar pedidos nuevos. Coordiná este cambio con LOOP.';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='PT409', message='El pedido cambió. Actualizá el historial antes de continuar.';
  end if;
  if p_action='remove_item' and (p_item_index is null or p_item_index<0 or p_item_index>=jsonb_array_length(v_order.items)) then
    raise exception using errcode='PT409', message='El producto ya no está en el pedido. Actualizá el historial.';
  end if;
  v_cancel := p_action='cancel' or jsonb_array_length(v_order.items)=1;
  if v_cancel then
    v_items := v_order.items;
    v_total := v_order.total_estimated;
    v_note := 'Cliente canceló el pedido.';
  else
    v_removed := v_order.items -> p_item_index;
    v_items := v_order.items - p_item_index;
    select round(sum((item->>'subtotal')::numeric),2) into v_total from jsonb_array_elements(v_items) as item;
    if v_total is null or v_total<0 then raise exception using errcode='PT400', message='El pedido necesita revisión de LOOP.'; end if;
    v_note := format('Cliente quitó %s× %s (%s), subtotal $%s.',v_removed->>'cantidad',v_removed->>'nombre',v_removed->>'sku',v_removed->>'subtotal');
  end if;
  update public.whatsapp_orders set
    items=v_items,total_estimated=v_total,estado=case when v_cancel then 'CANCELADO' else 'NUEVO' end,
    notes=concat_ws(E'\n',nullif(v_order.notes,''),'[' || to_char(clock_timestamp() at time zone 'America/Argentina/Cordoba','DD/MM/YYYY HH24:MI:SS') || '] ' || v_note)
    where id=v_order.id and user_id=v_uid returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function loop_order_actions.change_customer_order(uuid,text,integer,timestamptz) from public, anon;
grant execute on function loop_order_actions.change_customer_order(uuid,text,integer,timestamptz) to authenticated;

create or replace function public.change_customer_order(
  p_order_id uuid, p_action text, p_item_index integer, p_expected_updated_at timestamptz
) returns jsonb
language sql security invoker set search_path = '' as $$
  select loop_order_actions.change_customer_order(p_order_id,p_action,p_item_index,p_expected_updated_at);
$$;
revoke all on function public.change_customer_order(uuid,text,integer,timestamptz) from public, anon;
grant execute on function public.change_customer_order(uuid,text,integer,timestamptz) to authenticated;
notify pgrst, 'reload schema';
