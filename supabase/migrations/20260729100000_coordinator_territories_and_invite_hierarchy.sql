-- NorteP Pesquisa · hierarquia de convites e territórios da coordenação.
-- Fundadora cria administradores; administração cria coordenadores;
-- coordenadores criam pesquisadores da própria equipe.

begin;

create table if not exists public.coordinator_territories (
  id uuid primary key default gen_random_uuid(),
  coordinator_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('cidade', 'regiao', 'bairro')),
  scope_value text not null,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coordinator_id, scope_type, scope_value)
);

create index if not exists coordinator_territories_coordinator_idx
  on public.coordinator_territories (coordinator_id, active);

drop trigger if exists coordinator_territories_set_updated_at on public.coordinator_territories;
create trigger coordinator_territories_set_updated_at
before update on public.coordinator_territories
for each row execute function public.set_updated_at();

alter table public.coordinator_territories enable row level security;

drop policy if exists coordinator_territories_read_scoped on public.coordinator_territories;
create policy coordinator_territories_read_scoped
on public.coordinator_territories for select to authenticated
using (public.is_full_admin() or coordinator_id = auth.uid());

alter table public.access_invites
  add column if not exists territory_cities text[] not null default '{}'::text[],
  add column if not exists territory_regions text[] not null default '{}'::text[],
  add column if not exists territory_neighborhoods text[] not null default '{}'::text[];

create or replace function public.create_team_access_invite(
  p_email text,
  p_role text default 'pesquisador',
  p_coordinator_id uuid default null
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
  if v_actor.role = 'admin' and p_role = 'pesquisador' then
    raise exception 'Pesquisadores devem ser convidados pelo coordenador responsável.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  v_coordinator_id := case when v_actor.role = 'coordenador' and p_role = 'pesquisador' then v_actor.id else null end;

  update public.access_invites set revoked_at = now()
  where lower(email) = v_email and role = p_role
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (email, role, token_hash, created_by, expires_at, coordinator_id)
  values (v_email, p_role, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(), now() + interval '72 hours', v_coordinator_id)
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'role', p_role, 'coordinator_id', v_coordinator_id, 'expires_in_hours', 72));
  return v_code;
end;
$$;

create or replace function public.create_scoped_access_invite(
  p_email text,
  p_role text,
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
  if v_actor.role = 'admin' and p_role = 'pesquisador' then
    raise exception 'Pesquisadores devem ser convidados pelo coordenador responsável.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  v_coordinator_id := case when v_actor.role = 'coordenador' and p_role = 'pesquisador' then v_actor.id else null end;

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
    jsonb_build_object(
      'email', v_email, 'role', p_role, 'coordinator_id', v_coordinator_id,
      'territory_cities', coalesce(p_cities, '{}'::text[]),
      'territory_regions', coalesce(p_regions, '{}'::text[]),
      'territory_neighborhoods', coalesce(p_neighborhoods, '{}'::text[]),
      'expires_in_hours', 72
    ));
  return v_code;
end;
$$;

create or replace function public.redeem_access_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invite public.access_invites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Entre em sua conta para aceitar o convite.'; end if;

  select * into v_invite
  from public.access_invites
  where token_hash = encode(digest(trim(coalesce(p_code, '')), 'sha256'), 'hex')
    and lower(email) = v_email and used_at is null and revoked_at is null and expires_at > now()
  for update;

  if v_invite.id is null then raise exception 'Convite inválido, expirado ou destinado a outro e-mail.'; end if;

  update public.profiles
  set role = v_invite.role, active = true, access_removed_at = null, updated_at = now()
  where id = auth.uid() and lower(email) = v_email;
  if not found then raise exception 'Perfil não encontrado para este convite.'; end if;

  if v_invite.role = 'pesquisador' and v_invite.coordinator_id is not null then
    insert into public.coordinator_memberships (researcher_id, coordinator_id, active, assigned_by)
    values (auth.uid(), v_invite.coordinator_id, true, v_invite.created_by)
    on conflict (researcher_id) do update set
      coordinator_id = excluded.coordinator_id, active = true,
      assigned_by = excluded.assigned_by, updated_at = now();
  end if;

  if v_invite.role = 'coordenador' then
    insert into public.coordinator_territories (coordinator_id, scope_type, scope_value, assigned_by)
    select auth.uid(), 'cidade', trim(value), v_invite.created_by
    from unnest(v_invite.territory_cities) value where trim(value) <> ''
    on conflict (coordinator_id, scope_type, scope_value) do update set active = true, assigned_by = excluded.assigned_by, updated_at = now();
    insert into public.coordinator_territories (coordinator_id, scope_type, scope_value, assigned_by)
    select auth.uid(), 'regiao', trim(value), v_invite.created_by
    from unnest(v_invite.territory_regions) value where trim(value) <> ''
    on conflict (coordinator_id, scope_type, scope_value) do update set active = true, assigned_by = excluded.assigned_by, updated_at = now();
    insert into public.coordinator_territories (coordinator_id, scope_type, scope_value, assigned_by)
    select auth.uid(), 'bairro', trim(value), v_invite.created_by
    from unnest(v_invite.territory_neighborhoods) value where trim(value) <> ''
    on conflict (coordinator_id, scope_type, scope_value) do update set active = true, assigned_by = excluded.assigned_by, updated_at = now();
  end if;

  update public.access_invites set used_at = now(), used_by = auth.uid() where id = v_invite.id;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_redeemed', 'access_invite', v_invite.id::text,
    jsonb_build_object('email', v_email, 'role', v_invite.role, 'coordinator_id', v_invite.coordinator_id, 'reactivated', true));
  return v_invite.role;
end;
$$;

create or replace function public.set_coordinator_territories_admin(
  p_coordinator_id uuid,
  p_cities text[],
  p_regions text[],
  p_neighborhoods text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_full_admin() then raise exception 'Somente a administração pode definir territórios.'; end if;
  if not exists (
    select 1 from public.profiles where id = p_coordinator_id
      and role = 'coordenador' and active and access_removed_at is null
  ) then raise exception 'Coordenador não encontrado ou inativo.'; end if;

  update public.coordinator_territories set active = false, updated_at = now()
  where coordinator_id = p_coordinator_id;

  insert into public.coordinator_territories (coordinator_id, scope_type, scope_value, assigned_by)
  select p_coordinator_id, scope_type, scope_value, auth.uid()
  from (
    select 'cidade'::text scope_type, trim(value) scope_value from unnest(coalesce(p_cities, '{}'::text[])) value
    union all
    select 'regiao', trim(value) from unnest(coalesce(p_regions, '{}'::text[])) value
    union all
    select 'bairro', trim(value) from unnest(coalesce(p_neighborhoods, '{}'::text[])) value
  ) chosen
  where scope_value <> ''
  on conflict (coordinator_id, scope_type, scope_value) do update set
    active = true, assigned_by = excluded.assigned_by, updated_at = now();

  select count(*) into v_count from public.coordinator_territories
  where coordinator_id = p_coordinator_id and active;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'coordinator_territories_updated', 'profile', p_coordinator_id::text,
    jsonb_build_object('territory_count', v_count));
  return v_count;
end;
$$;

revoke all on table public.coordinator_territories from public, anon;
grant select on table public.coordinator_territories to authenticated;

revoke all on function public.create_team_access_invite(text, text, uuid) from public, anon;
revoke all on function public.create_scoped_access_invite(text, text, text[], text[], text[]) from public, anon;
revoke all on function public.set_coordinator_territories_admin(uuid, text[], text[], text[]) from public, anon;
revoke all on function public.redeem_access_invite(text) from public, anon;
grant execute on function public.create_team_access_invite(text, text, uuid) to authenticated, service_role;
grant execute on function public.create_scoped_access_invite(text, text, text[], text[], text[]) to authenticated, service_role;
grant execute on function public.set_coordinator_territories_admin(uuid, text[], text[], text[]) to authenticated, service_role;
grant execute on function public.redeem_access_invite(text) to authenticated, service_role;

commit;
