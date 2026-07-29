-- NorteP Pesquisa: descadastramento voluntário com preservação da auditoria.
-- A conta principal permanece protegida. Entrevistas e ocorrências não são apagadas.

create or replace function public.remove_own_profile_access()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if v_profile.id is null then
    raise exception 'Perfil não encontrado.';
  end if;
  if v_profile.access_removed_at is not null then
    raise exception 'Este acesso já foi descadastrado.';
  end if;
  if v_profile.is_primary_admin then
    raise exception 'A conta principal é protegida.';
  end if;

  update public.survey_assignments
  set active = false
  where researcher_id = v_profile.id;

  update public.vault_access_grants
  set active = false, revoked_at = now()
  where profile_id = v_profile.id;

  delete from public.vault_sessions where profile_id = v_profile.id;
  delete from public.vault_keys where profile_id = v_profile.id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    v_profile.id,
    'self_access_removed',
    'profile',
    v_profile.id::text,
    jsonb_build_object('former_role', v_profile.role)
  );

  update public.profiles
  set
    name = 'Usuário descadastrado',
    email = 'removido-' || replace(v_profile.id::text, '-', '') || '@nortep.invalid',
    active = false,
    access_removed_at = now(),
    updated_at = now()
  where id = v_profile.id;

  return jsonb_build_object('removed', true);
end;
$$;

revoke all on function public.remove_own_profile_access() from public;
revoke all on function public.remove_own_profile_access() from anon;
grant execute on function public.remove_own_profile_access() to authenticated;
grant execute on function public.remove_own_profile_access() to service_role;
