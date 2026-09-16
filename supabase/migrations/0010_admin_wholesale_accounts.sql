-- Administración segura de cuentas mayoristas desde el panel web.
-- La consulta sigue protegida por RLS y estas acciones validan auth.uid().

grant update (role) on public.profiles to authenticated;

create or replace function public.admin_delete_account(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target_role public.user_role;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'No podés eliminar tu propia cuenta administradora' using errcode = '42501';
  end if;

  select role into v_target_role
    from public.profiles
   where id = p_user_id;

  if not found then
    raise exception 'La cuenta no existe' using errcode = 'P0002';
  end if;

  if v_target_role = 'ADMIN' then
    raise exception 'No se puede eliminar otra cuenta administradora' using errcode = '42501';
  end if;

  -- Retira primero el beneficio. Si existe historial con FK restrictiva,
  -- se conserva la cuenta pública para no borrar trazabilidad comercial.
  update public.profiles set role = 'PUBLICO' where id = p_user_id;

  begin
    delete from auth.users where id = p_user_id;
    return 'DELETED';
  exception when foreign_key_violation then
    return 'REVOKED_HISTORY';
  end;
end;
$$;

revoke all on function public.admin_delete_account(uuid) from public;
revoke execute on function public.admin_delete_account(uuid) from anon;
grant execute on function public.admin_delete_account(uuid) to authenticated;
