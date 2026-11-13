create schema if not exists loop_private;
revoke all on schema loop_private from public;
grant usage on schema loop_private to anon, authenticated, service_role;

alter function public.request_restock(text, text) set schema loop_private;
alter function loop_private.request_restock(text, text) security definer;
revoke execute on function loop_private.request_restock(text, text) from public;
grant execute on function loop_private.request_restock(text, text) to anon, authenticated;

create function public.request_restock(product_sku text, phone text)
returns boolean
language sql
set search_path = ''
as $$
  select case
    when length(product_sku) between 1 and 200 and phone ~ '^[1-9][0-9]{9,14}$'
    then loop_private.request_restock(product_sku, phone)
    else false
  end;
$$;

revoke execute on function public.request_restock(text, text) from public;
grant execute on function public.request_restock(text, text) to anon, authenticated, service_role;
