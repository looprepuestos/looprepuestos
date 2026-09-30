-- Avisos persistentes privados. Sólo el destinatario puede leerlos o marcarlos.
alter table public.whatsapp_orders add column if not exists customer_message text not null default '' check (length(customer_message) <= 500);
create table public.order_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 order_id uuid not null references public.whatsapp_orders(id) on delete cascade,
 title text not null,
 message text not null,
 changes jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index order_notifications_user_created_idx on public.order_notifications(user_id,created_at desc);
create index order_notifications_unread_idx on public.order_notifications(user_id) where read_at is null;
create index order_notifications_order_idx on public.order_notifications(order_id);
alter table public.order_notifications enable row level security;
revoke all on public.order_notifications from anon, authenticated;
grant select on public.order_notifications to authenticated;
grant update(read_at) on public.order_notifications to authenticated;
create policy order_notifications_read_own on public.order_notifications for select to authenticated using (user_id = (select auth.uid()));
create policy order_notifications_mark_own on public.order_notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- La función interna necesita insertar el aviso durante la transacción del admin.
create schema if not exists private;
create or replace function private.notify_order_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_changes jsonb := '{}'::jsonb; v_title text; v_message text;
begin
 if auth.uid() is null or not public.is_admin() or new.user_id is null or new.hidden_by_admin or new.hidden_by_customer then return new; end if;
 if new.estado is not distinct from old.estado and new.items is not distinct from old.items
 and new.total_estimated is not distinct from old.total_estimated and new.delivery is not distinct from old.delivery
 and new.payment_method is not distinct from old.payment_method and new.customer_message is not distinct from old.customer_message then return new; end if;
 v_title := 'Actualizamos tu pedido';
 v_message := 'Revisá los cambios de tu pedido.';
 if new.estado is distinct from old.estado then
  v_changes := v_changes || jsonb_build_object('estado',jsonb_build_object('antes',old.estado,'ahora',new.estado));
  v_title := case new.estado when 'PREPARADO' then 'Tu pedido está preparado' when 'CONFIRMADO' then 'Tu pedido fue confirmado' when 'ENTREGADO' then 'Tu pedido fue entregado' when 'CANCELADO' then 'Tu pedido fue cancelado' else 'Actualizamos tu pedido' end;
  v_message := case when new.estado='PREPARADO' and new.delivery='Retiro' then 'Ya está listo para retirar.' when new.estado='PREPARADO' then 'Ya está preparado. Coordiná el envío con LOOP.' else 'Consultá el estado actualizado en tus pedidos.' end;
 end if;
 if new.items is distinct from old.items then v_changes := v_changes || jsonb_build_object('items',jsonb_build_object('antes',old.items,'ahora',new.items)); end if;
 if new.total_estimated is distinct from old.total_estimated then v_changes := v_changes || jsonb_build_object('total',jsonb_build_object('antes',old.total_estimated,'ahora',new.total_estimated)); end if;
 if new.delivery is distinct from old.delivery then v_changes := v_changes || jsonb_build_object('entrega',jsonb_build_object('antes',old.delivery,'ahora',new.delivery)); end if;
 if new.payment_method is distinct from old.payment_method then v_changes := v_changes || jsonb_build_object('pago',jsonb_build_object('antes',old.payment_method,'ahora',new.payment_method)); end if;
 if new.customer_message <> '' then v_message := v_message || E'\n\nMensaje de LOOP: ' || new.customer_message; end if;
 insert into public.order_notifications(user_id,order_id,title,message,changes) values(new.user_id,new.id,v_title,v_message,v_changes);
 return new;
end $$;
revoke all on function private.notify_order_customer() from public, anon, authenticated;
create trigger whatsapp_orders_notify_customer after update on public.whatsapp_orders for each row execute function private.notify_order_customer();
