-- NorteP Pesquisa · limites entre fundadora, administração e coordenação.
-- Preserva todas as contas e dados. Apenas restringe ações protegidas.

begin;

create or replace function public.is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active
      and access_removed_at is null
      and is_primary_admin
  );
$$;

revoke all on function public.is_primary_admin() from public, anon;
grant execute on function public.is_primary_admin() to authenticated, service_role;

create or replace function public.create_access_invite(p_email text, p_role text default 'pesquisador')
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor public.profiles;
  v_code text := encode(gen_random_bytes(18), 'hex');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite_id uuid;
begin
  select * into v_actor
  from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador');

  if v_actor.id is null then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_role not in ('admin', 'coordenador', 'pesquisador', 'observador') then raise exception 'Função de acesso inválida.'; end if;
  if p_role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode criar outro administrador.';
  end if;
  if v_actor.role = 'coordenador' and p_role not in ('pesquisador', 'observador') then
    raise exception 'Coordenadores podem convidar somente pesquisadores ou observadores.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Informe um e-mail válido.'; end if;

  update public.access_invites
  set revoked_at = now()
  where lower(email) = v_email and role = p_role
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (email, role, token_hash, created_by, expires_at)
  values (v_email, p_role, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(), now() + interval '72 hours')
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'role', p_role, 'expires_in_hours', 72));
  return v_code;
end;
$$;

create or replace function public.manage_profile_access(p_profile_id uuid, p_active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_result public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  select * into v_target from public.profiles where id = p_profile_id;

  if v_actor.id is null or not v_actor.active or v_actor.access_removed_at is not null
     or v_actor.role not in ('admin', 'coordenador') then raise exception 'Ação não autorizada.'; end if;
  if v_target.id is null or v_target.access_removed_at is not null then raise exception 'Acesso não encontrado.'; end if;
  if v_target.id = v_actor.id then raise exception 'Você não pode alterar o próprio acesso.'; end if;
  if v_target.is_primary_admin then raise exception 'A conta da administradora fundadora é protegida.'; end if;
  if v_target.role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode alterar outro administrador.';
  end if;
  if v_actor.role = 'coordenador' and v_target.role not in ('pesquisador', 'observador') then
    raise exception 'Coordenadores podem alterar somente pesquisadores ou observadores.';
  end if;

  update public.profiles set active = p_active, updated_at = now()
  where id = p_profile_id returning * into v_result;
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
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_target public.profiles;
  v_result public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  select * into v_target from public.profiles where id = p_profile_id;

  if v_actor.id is null or not v_actor.active or v_actor.access_removed_at is not null
     or v_actor.role not in ('admin', 'coordenador') then raise exception 'Ação não autorizada.'; end if;
  if v_target.id is null or v_target.access_removed_at is not null then raise exception 'Acesso não encontrado.'; end if;
  if v_target.id = v_actor.id then raise exception 'Você não pode apagar o próprio acesso.'; end if;
  if v_target.is_primary_admin then raise exception 'A conta da administradora fundadora é protegida.'; end if;
  if v_target.role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode apagar outro administrador.';
  end if;
  if v_actor.role = 'coordenador' and v_target.role not in ('pesquisador', 'observador') then
    raise exception 'Coordenadores podem apagar somente pesquisadores ou observadores.';
  end if;

  update public.survey_assignments set active = false where researcher_id = p_profile_id;
  update public.profiles
  set active = false, access_removed_at = now(), updated_at = now()
  where id = p_profile_id returning * into v_result;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (v_actor.id, 'access_removed', 'profile', p_profile_id::text,
    jsonb_build_object('target_role', v_target.role, 'target_email', v_target.email));
  return v_result;
end;
$$;

revoke all on function public.create_access_invite(text, text) from public, anon;
revoke all on function public.manage_profile_access(uuid, boolean) from public, anon;
revoke all on function public.remove_profile_access(uuid) from public, anon;
grant execute on function public.create_access_invite(text, text) to authenticated, service_role;
grant execute on function public.manage_profile_access(uuid, boolean) to authenticated, service_role;
grant execute on function public.remove_profile_access(uuid) to authenticated, service_role;

commit;
