-- NorteP Pesquisa · gestão segura de acessos da equipe.
-- "Apagar acesso" é uma remoção lógica: bloqueia a conta no aplicativo,
-- preservando entrevistas, consentimentos e histórico para auditoria.

alter table public.profiles
  add column if not exists is_primary_admin boolean not null default false,
  add column if not exists access_removed_at timestamptz;

update public.profiles
set is_primary_admin = true, role = 'admin', active = true, access_removed_at = null
where lower(email) = 'bussolanortep@gmail.com';

create unique index if not exists profiles_one_primary_admin_idx
on public.profiles (is_primary_admin)
where is_primary_admin;

create or replace function public.manage_profile_access(p_profile_id uuid, p_active boolean)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_result public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  select * into v_target from public.profiles where id = p_profile_id;

  if v_actor.id is null or not v_actor.active or v_actor.access_removed_at is not null
     or v_actor.role not in ('admin', 'coordenador') then
    raise exception 'Ação não autorizada.';
  end if;
  if v_target.id is null or v_target.access_removed_at is not null then
    raise exception 'Acesso não encontrado.';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'Você não pode alterar o próprio acesso.';
  end if;
  if v_target.is_primary_admin then
    raise exception 'A conta principal é protegida.';
  end if;
  if v_actor.role = 'coordenador' and v_target.role in ('admin', 'coordenador') then
    raise exception 'Coordenadores não podem alterar administradores ou outros coordenadores.';
  end if;

  update public.profiles
  set active = p_active, updated_at = now()
  where id = p_profile_id
  returning * into v_result;

  if not p_active then
    update public.survey_assignments set active = false where researcher_id = p_profile_id;
  end if;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (v_actor.id, case when p_active then 'access_reactivated' else 'access_suspended' end,
          'profile', p_profile_id::text, jsonb_build_object('target_role', v_target.role));
  return v_result;
end;
$$;

create or replace function public.remove_profile_access(p_profile_id uuid)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_result public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  select * into v_target from public.profiles where id = p_profile_id;

  if v_actor.id is null or not v_actor.active or v_actor.access_removed_at is not null
     or v_actor.role not in ('admin', 'coordenador') then
    raise exception 'Ação não autorizada.';
  end if;
  if v_target.id is null or v_target.access_removed_at is not null then
    raise exception 'Acesso não encontrado.';
  end if;
  if v_target.id = v_actor.id then
    raise exception 'Você não pode apagar o próprio acesso.';
  end if;
  if v_target.is_primary_admin then
    raise exception 'A conta principal é protegida.';
  end if;
  if v_actor.role = 'coordenador' and v_target.role in ('admin', 'coordenador') then
    raise exception 'Coordenadores não podem apagar administradores ou outros coordenadores.';
  end if;

  update public.survey_assignments set active = false where researcher_id = p_profile_id;
  update public.profiles
  set active = false, access_removed_at = now(), updated_at = now()
  where id = p_profile_id
  returning * into v_result;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (v_actor.id, 'access_removed', 'profile', p_profile_id::text,
          jsonb_build_object('target_role', v_target.role, 'target_email', v_target.email));
  return v_result;
end;
$$;

revoke all on function public.manage_profile_access(uuid, boolean) from public;
revoke all on function public.remove_profile_access(uuid) from public;
grant execute on function public.manage_profile_access(uuid, boolean) to authenticated;
grant execute on function public.remove_profile_access(uuid) to authenticated;

drop policy if exists profiles_admin_update on public.profiles;
revoke update on public.profiles from authenticated;
