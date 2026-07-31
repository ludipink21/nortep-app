-- NorteP Pesquisa · administradores podem incluir pesquisadores em uma coordenação.
-- Mantém a fundadora como única responsável pela criação de administradores.

begin;

create or replace function public.create_managed_access_invite(
  p_email text,
  p_role text,
  p_coordinator_id uuid default null,
  p_cities text[] default '{}'::text[],
  p_regions text[] default '{}'::text[],
  p_neighborhoods text[] default '{}'::text[]
)
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
  v_coordinator_id uuid;
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
  if v_actor.role = 'coordenador' and p_role <> 'pesquisador' then
    raise exception 'Coordenadores podem convidar somente pesquisadores da própria equipe.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  if p_role = 'pesquisador' then
    v_coordinator_id := case when v_actor.role = 'coordenador' then v_actor.id else p_coordinator_id end;
    if v_coordinator_id is null then raise exception 'Escolha o coordenador responsável pelo pesquisador.'; end if;
    if not exists (
      select 1 from public.profiles
      where id = v_coordinator_id and role = 'coordenador'
        and active and access_removed_at is null
    ) then raise exception 'Coordenador responsável não encontrado ou inativo.'; end if;
  end if;

  update public.access_invites set revoked_at = now()
  where lower(email) = v_email and role = p_role
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (
    email, role, token_hash, created_by, expires_at, coordinator_id,
    territory_cities, territory_regions, territory_neighborhoods
  )
  values (
    v_email, p_role, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(),
    now() + interval '72 hours', v_coordinator_id,
    coalesce(p_cities, '{}'::text[]), coalesce(p_regions, '{}'::text[]),
    coalesce(p_neighborhoods, '{}'::text[])
  )
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'role', p_role, 'coordinator_id', v_coordinator_id, 'expires_in_hours', 72));
  return v_code;
end;
$$;

revoke all on function public.create_managed_access_invite(text, text, uuid, text[], text[], text[]) from public, anon;
grant execute on function public.create_managed_access_invite(text, text, uuid, text[], text[], text[]) to authenticated, service_role;

commit;
