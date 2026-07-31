-- NorteP Pesquisa · hierarquia territorial, supervisão e mobilização com consentimento.
-- Esta migração preserva contas e dados. A limpeza do piloto é feita em migração separada,
-- somente depois dos testes controlados.

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check (role in ('admin', 'coordenador', 'supervisor', 'pesquisador', 'observador'));

alter table public.access_invites drop constraint if exists access_invites_role_check;
alter table public.access_invites add constraint access_invites_role_check
check (role in ('admin', 'coordenador', 'supervisor', 'pesquisador', 'observador'));

alter table public.surveys drop constraint if exists surveys_survey_type_check;
alter table public.surveys add constraint surveys_survey_type_check
check (survey_type in ('quantitative', 'qualitative', 'directional', 'electoral', 'data_collection', 'relationship'));

create table if not exists public.team_links (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_id <> manager_id)
);

create index if not exists team_links_manager_idx
  on public.team_links (manager_id, active);

drop trigger if exists team_links_set_updated_at on public.team_links;
create trigger team_links_set_updated_at
before update on public.team_links
for each row execute function public.set_updated_at();

insert into public.team_links (member_id, manager_id, active, assigned_by, created_at, updated_at)
select researcher_id, coordinator_id, active, assigned_by, created_at, updated_at
from public.coordinator_memberships
on conflict (member_id) do update set
  manager_id = excluded.manager_id,
  active = excluded.active,
  assigned_by = excluded.assigned_by,
  updated_at = now();

create table if not exists public.profile_territories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('cidade', 'regiao', 'bairro')),
  scope_value text not null,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, scope_type, scope_value)
);

create index if not exists profile_territories_profile_idx
  on public.profile_territories (profile_id, active);

drop trigger if exists profile_territories_set_updated_at on public.profile_territories;
create trigger profile_territories_set_updated_at
before update on public.profile_territories
for each row execute function public.set_updated_at();

insert into public.profile_territories (profile_id, scope_type, scope_value, active, assigned_by, created_at, updated_at)
select coordinator_id, scope_type, scope_value, active, assigned_by, created_at, updated_at
from public.coordinator_territories
on conflict (profile_id, scope_type, scope_value) do update set
  active = excluded.active,
  assigned_by = excluded.assigned_by,
  updated_at = now();

alter table public.access_invites
  add column if not exists manager_id uuid references public.profiles(id);

update public.access_invites
set manager_id = coordinator_id
where manager_id is null and coordinator_id is not null;

create or replace function public.is_operations_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'coordenador', 'supervisor')
      and active
      and access_removed_at is null
  );
$$;

create or replace function public.manager_can_access_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_full_admin()
    or p_profile_id = auth.uid()
    or exists (
      with recursive descendants(id) as (
        select member_id
        from public.team_links
        where manager_id = auth.uid() and active
        union
        select links.member_id
        from public.team_links links
        join descendants d on links.manager_id = d.id
        where links.active
      )
      select 1 from descendants where id = p_profile_id
    );
$$;

create or replace function public.manager_can_access_survey(p_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_full_admin()
    or exists (
      select 1
      from public.survey_assignments a
      where a.survey_id = p_survey_id
        and a.active
        and public.manager_can_access_profile(a.researcher_id)
    )
    or exists (
      select 1 from public.surveys s
      where s.id = p_survey_id and s.created_by = auth.uid()
    );
$$;

revoke all on function public.is_operations_manager() from public, anon;
revoke all on function public.manager_can_access_profile(uuid) from public, anon;
revoke all on function public.manager_can_access_survey(uuid) from public, anon;
grant execute on function public.is_operations_manager() to authenticated, service_role;
grant execute on function public.manager_can_access_profile(uuid) to authenticated, service_role;
grant execute on function public.manager_can_access_survey(uuid) to authenticated, service_role;

alter table public.team_links enable row level security;
alter table public.profile_territories enable row level security;

drop policy if exists team_links_read_scoped on public.team_links;
create policy team_links_read_scoped
on public.team_links for select to authenticated
using (
  public.is_full_admin()
  or public.manager_can_access_profile(member_id)
  or public.manager_can_access_profile(manager_id)
);

drop policy if exists profile_territories_read_scoped on public.profile_territories;
create policy profile_territories_read_scoped
on public.profile_territories for select to authenticated
using (public.is_full_admin() or public.manager_can_access_profile(profile_id));

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin
on public.profiles for select to authenticated
using (public.manager_can_access_profile(id));

drop policy if exists profiles_admin_update on public.profiles;

drop policy if exists surveys_read_assigned on public.surveys;
create policy surveys_read_assigned
on public.surveys for select to authenticated
using (
  public.is_full_admin()
  or public.manager_can_access_survey(id)
  or exists (
    select 1 from public.survey_assignments a
    where a.survey_id = id and a.researcher_id = auth.uid() and a.active
  )
);

drop policy if exists questions_read_visible_survey on public.survey_questions;
create policy questions_read_visible_survey
on public.survey_questions for select to authenticated
using (
  public.is_full_admin()
  or public.manager_can_access_survey(survey_id)
  or exists (
    select 1 from public.survey_assignments a
    where a.survey_id = survey_questions.survey_id
      and a.researcher_id = auth.uid() and a.active
  )
);

drop policy if exists assignments_read_own_or_admin on public.survey_assignments;
create policy assignments_read_own_or_admin
on public.survey_assignments for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.manager_can_access_profile(researcher_id)
);

drop policy if exists assignments_admin_all on public.survey_assignments;
create policy assignments_admin_all
on public.survey_assignments for all to authenticated
using (
  public.is_full_admin()
  or (public.is_operations_manager() and public.manager_can_access_profile(researcher_id))
)
with check (
  public.is_full_admin()
  or (public.is_operations_manager() and public.manager_can_access_profile(researcher_id))
);

drop policy if exists interviews_read_own_or_admin on public.interviews;
create policy interviews_read_own_or_admin
on public.interviews for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.manager_can_access_profile(researcher_id)
);

drop policy if exists interviews_update_own_or_admin on public.interviews;
create policy interviews_update_own_or_admin
on public.interviews for update to authenticated
using (researcher_id = auth.uid() or public.is_full_admin())
with check (researcher_id = auth.uid() or public.is_full_admin());

drop policy if exists answers_read_own_or_admin on public.interview_answers;
create policy answers_read_own_or_admin
on public.interview_answers for select to authenticated
using (
  exists (
    select 1 from public.interviews i
    where i.id = interview_id
      and (
        i.researcher_id = auth.uid()
        or public.is_full_admin()
        or public.manager_can_access_profile(i.researcher_id)
      )
  )
);

drop policy if exists consents_read_own_or_admin on public.consent_records;
create policy consents_read_own_or_admin
on public.consent_records for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.manager_can_access_profile(researcher_id)
);

drop policy if exists field_events_read_own_or_admin on public.field_events;
create policy field_events_read_own_or_admin
on public.field_events for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.manager_can_access_profile(researcher_id)
);

drop policy if exists access_invites_admin_read on public.access_invites;
create policy access_invites_admin_read
on public.access_invites for select to authenticated
using (public.is_full_admin() or created_by = auth.uid());

revoke update on public.profiles from authenticated;
revoke insert, update, delete on public.team_links, public.profile_territories from authenticated;
grant select on public.team_links, public.profile_territories to authenticated;

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
  v_manager public.profiles;
  v_code text := encode(gen_random_bytes(18), 'hex');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite_id uuid;
  v_manager_id uuid;
begin
  select * into v_actor
  from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador', 'supervisor');

  if v_actor.id is null then raise exception 'Acesso de gestão não autorizado.'; end if;
  if p_role not in ('admin', 'coordenador', 'supervisor', 'pesquisador', 'observador') then
    raise exception 'Função de acesso inválida.';
  end if;
  if p_role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode criar outro administrador.';
  end if;
  if v_actor.role = 'coordenador' and p_role not in ('supervisor', 'pesquisador') then
    raise exception 'Coordenadores podem convidar supervisores e pesquisadores da própria equipe.';
  end if;
  if v_actor.role = 'supervisor' and p_role <> 'pesquisador' then
    raise exception 'Supervisores podem convidar somente pesquisadores da própria equipe.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  if p_role in ('supervisor', 'pesquisador') then
    v_manager_id := case
      when v_actor.role in ('coordenador', 'supervisor') then v_actor.id
      else p_coordinator_id
    end;
    if v_manager_id is null then
      raise exception 'Escolha o responsável direto por este acesso.';
    end if;
    select * into v_manager from public.profiles
    where id = v_manager_id and active and access_removed_at is null;
    if v_manager.id is null then raise exception 'Responsável escolhido não está ativo.'; end if;
    if p_role = 'supervisor' and v_manager.role <> 'coordenador' then
      raise exception 'Todo supervisor deve estar vinculado a um coordenador.';
    end if;
    if p_role = 'pesquisador' and v_manager.role not in ('coordenador', 'supervisor') then
      raise exception 'O pesquisador deve estar vinculado a um coordenador ou supervisor.';
    end if;
    if v_actor.role <> 'admin' and v_manager.id <> v_actor.id
       and not public.manager_can_access_profile(v_manager.id) then
      raise exception 'O responsável escolhido não pertence à sua área.';
    end if;
  end if;

  update public.access_invites
  set revoked_at = now()
  where lower(email) = v_email
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (
    email, role, token_hash, created_by, expires_at, coordinator_id, manager_id,
    territory_cities, territory_regions, territory_neighborhoods
  )
  values (
    v_email, p_role, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(),
    now() + interval '72 hours',
    case when v_manager.role = 'coordenador' then v_manager_id else null end,
    v_manager_id,
    coalesce(p_cities, '{}'::text[]), coalesce(p_regions, '{}'::text[]),
    coalesce(p_neighborhoods, '{}'::text[])
  )
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object(
      'email', v_email, 'role', p_role, 'manager_id', v_manager_id,
      'territory_cities', coalesce(p_cities, '{}'::text[]),
      'territory_regions', coalesce(p_regions, '{}'::text[]),
      'territory_neighborhoods', coalesce(p_neighborhoods, '{}'::text[]),
      'expires_in_hours', 72
    )
  );
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
    and lower(email) = v_email
    and used_at is null and revoked_at is null and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail.';
  end if;

  update public.profiles
  set role = v_invite.role, active = true, access_removed_at = null, updated_at = now()
  where id = auth.uid() and lower(email) = v_email;
  if not found then raise exception 'Perfil não encontrado para este convite.'; end if;

  if v_invite.manager_id is not null then
    insert into public.team_links (member_id, manager_id, active, assigned_by)
    values (auth.uid(), v_invite.manager_id, true, v_invite.created_by)
    on conflict (member_id) do update set
      manager_id = excluded.manager_id,
      active = true,
      assigned_by = excluded.assigned_by,
      updated_at = now();
  end if;

  if v_invite.role = 'pesquisador' and v_invite.coordinator_id is not null then
    insert into public.coordinator_memberships (researcher_id, coordinator_id, active, assigned_by)
    values (auth.uid(), v_invite.coordinator_id, true, v_invite.created_by)
    on conflict (researcher_id) do update set
      coordinator_id = excluded.coordinator_id,
      active = true,
      assigned_by = excluded.assigned_by,
      updated_at = now();
  end if;

  if v_invite.role in ('coordenador', 'supervisor') then
    insert into public.profile_territories (profile_id, scope_type, scope_value, assigned_by)
    select auth.uid(), scope_type, scope_value, v_invite.created_by
    from (
      select 'cidade'::text scope_type, trim(value) scope_value from unnest(v_invite.territory_cities) value
      union all
      select 'regiao', trim(value) from unnest(v_invite.territory_regions) value
      union all
      select 'bairro', trim(value) from unnest(v_invite.territory_neighborhoods) value
    ) scopes
    where scope_value <> ''
    on conflict (profile_id, scope_type, scope_value) do update set
      active = true, assigned_by = excluded.assigned_by, updated_at = now();
  end if;

  update public.access_invites set used_at = now(), used_by = auth.uid() where id = v_invite.id;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'invite_redeemed', 'access_invite', v_invite.id::text,
    jsonb_build_object('email', v_email, 'role', v_invite.role, 'manager_id', v_invite.manager_id)
  );
  return v_invite.role;
end;
$$;

create or replace function public.set_profile_territories_manager(
  p_profile_id uuid,
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
  v_target_role text;
begin
  if not public.is_operations_manager() then raise exception 'Acesso de gestão não autorizado.'; end if;
  select role into v_target_role from public.profiles
  where id = p_profile_id and active and access_removed_at is null;
  if v_target_role not in ('coordenador', 'supervisor') then
    raise exception 'Territórios só podem ser atribuídos a coordenadores ou supervisores.';
  end if;
  if not public.is_full_admin() and not public.manager_can_access_profile(p_profile_id) then
    raise exception 'Este perfil não pertence à sua área.';
  end if;

  update public.profile_territories
  set active = false, updated_at = now(), assigned_by = auth.uid()
  where profile_id = p_profile_id;

  insert into public.profile_territories (profile_id, scope_type, scope_value, assigned_by)
  select p_profile_id, scope_type, scope_value, auth.uid()
  from (
    select 'cidade'::text scope_type, trim(value) scope_value from unnest(coalesce(p_cities, '{}'::text[])) value
    union all
    select 'regiao', trim(value) from unnest(coalesce(p_regions, '{}'::text[])) value
    union all
    select 'bairro', trim(value) from unnest(coalesce(p_neighborhoods, '{}'::text[])) value
  ) chosen
  where scope_value <> ''
  on conflict (profile_id, scope_type, scope_value) do update set
    active = true, assigned_by = excluded.assigned_by, updated_at = now();

  select count(*) into v_count
  from public.profile_territories where profile_id = p_profile_id and active;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'profile_territories_updated', 'profile', p_profile_id::text,
    jsonb_build_object('territory_count', v_count)
  );
  return v_count;
end;
$$;

create or replace function public.set_coordinator_territories_admin(
  p_coordinator_id uuid,
  p_cities text[],
  p_regions text[],
  p_neighborhoods text[]
)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.set_profile_territories_manager(
    p_coordinator_id, p_cities, p_regions, p_neighborhoods
  );
$$;

create or replace function public.set_survey_assignments_admin(
  p_survey_id uuid,
  p_researcher_ids uuid[],
  p_team_name text,
  p_city text,
  p_region text,
  p_neighborhood text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_count integer;
begin
  select * into v_actor from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador', 'supervisor');
  if v_actor.id is null then raise exception 'Acesso de gestão não autorizado.'; end if;
  if not exists (select 1 from public.surveys where id = p_survey_id and archived_at is null) then
    raise exception 'Pesquisa não encontrada ou arquivada.';
  end if;
  if v_actor.role <> 'admin' and exists (
    select 1 from unnest(coalesce(p_researcher_ids, '{}'::uuid[])) chosen(id)
    where not public.manager_can_access_profile(chosen.id)
  ) then
    raise exception 'Você só pode liberar pesquisas para pesquisadores da sua equipe.';
  end if;

  if v_actor.role = 'admin' then
    update public.survey_assignments set active = false where survey_id = p_survey_id;
  else
    update public.survey_assignments a set active = false
    where a.survey_id = p_survey_id and public.manager_can_access_profile(a.researcher_id);
  end if;

  insert into public.survey_assignments (
    survey_id, researcher_id, active, assigned_by, team_name, city, region, neighborhood
  )
  select
    p_survey_id, p.id, true, auth.uid(),
    nullif(trim(coalesce(p_team_name, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), '')
  from public.profiles p
  where p.id = any(coalesce(p_researcher_ids, '{}'::uuid[]))
    and p.role = 'pesquisador' and p.active and p.access_removed_at is null
    and (v_actor.role = 'admin' or public.manager_can_access_profile(p.id))
  on conflict (survey_id, researcher_id) do update set
    active = true, assigned_by = auth.uid(), team_name = excluded.team_name,
    city = excluded.city, region = excluded.region, neighborhood = excluded.neighborhood;

  get diagnostics v_count = row_count;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'survey_assignments_updated', 'survey', p_survey_id::text,
    jsonb_build_object(
      'researcher_count', v_count, 'team', p_team_name, 'city', p_city,
      'region', p_region, 'neighborhood', p_neighborhood
    )
  );
  return v_count;
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
     or v_actor.role not in ('admin', 'coordenador', 'supervisor') then
    raise exception 'Ação não autorizada.';
  end if;
  if v_target.id is null or v_target.access_removed_at is not null then raise exception 'Acesso não encontrado.'; end if;
  if v_target.id = v_actor.id then raise exception 'Você não pode alterar o próprio acesso.'; end if;
  if v_target.is_primary_admin then raise exception 'A conta da administradora fundadora é protegida.'; end if;
  if v_target.role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode alterar outro administrador.';
  end if;
  if v_actor.role <> 'admin' and not public.manager_can_access_profile(v_target.id) then
    raise exception 'Este acesso não pertence à sua equipe.';
  end if;
  if v_actor.role = 'supervisor' and v_target.role <> 'pesquisador' then
    raise exception 'Supervisores podem alterar somente pesquisadores da própria equipe.';
  end if;

  update public.profiles set active = p_active, updated_at = now()
  where id = p_profile_id returning * into v_result;
  if not p_active then
    update public.survey_assignments set active = false where researcher_id = p_profile_id;
    update public.team_links set active = false where member_id = p_profile_id;
  else
    update public.team_links set active = true where member_id = p_profile_id;
  end if;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    v_actor.id,
    case when p_active then 'access_reactivated' else 'access_suspended' end,
    'profile', p_profile_id::text, jsonb_build_object('target_role', v_target.role)
  );
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
     or v_actor.role not in ('admin', 'coordenador', 'supervisor') then
    raise exception 'Ação não autorizada.';
  end if;
  if v_target.id is null or v_target.access_removed_at is not null then raise exception 'Acesso não encontrado.'; end if;
  if v_target.id = v_actor.id then raise exception 'Você não pode apagar o próprio acesso.'; end if;
  if v_target.is_primary_admin then raise exception 'A conta da administradora fundadora é protegida.'; end if;
  if v_target.role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode apagar outro administrador.';
  end if;
  if v_actor.role <> 'admin' and not public.manager_can_access_profile(v_target.id) then
    raise exception 'Este acesso não pertence à sua equipe.';
  end if;
  if v_actor.role = 'supervisor' and v_target.role <> 'pesquisador' then
    raise exception 'Supervisores podem apagar somente pesquisadores da própria equipe.';
  end if;

  update public.survey_assignments set active = false where researcher_id = p_profile_id;
  update public.team_links set active = false where member_id = p_profile_id or manager_id = p_profile_id;
  update public.profile_territories set active = false where profile_id = p_profile_id;
  update public.profiles
  set active = false, access_removed_at = now(), updated_at = now()
  where id = p_profile_id returning * into v_result;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    v_actor.id, 'access_removed', 'profile', p_profile_id::text,
    jsonb_build_object('target_role', v_target.role, 'target_email', v_target.email)
  );
  return v_result;
end;
$$;

-- Administradores e coordenadores podem criar/editar pesquisas dentro do próprio escopo.
create or replace function public.protect_survey_structure_for_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'coordenador')
      and active and access_removed_at is null
  ) then
    raise exception 'Somente a administração ou a coordenação autorizada pode editar perguntas.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.upsert_survey_admin(
  p_id uuid,
  p_title text,
  p_description text,
  p_status text,
  p_survey_type text,
  p_estimated_minutes integer,
  p_consent_text text,
  p_is_test boolean,
  p_target_cities text[],
  p_target_regions text[],
  p_target_neighborhoods text[],
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_id uuid;
  v_slug text;
  v_question jsonb;
  v_order integer := 0;
begin
  select * into v_actor from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador');
  if v_actor.id is null then raise exception 'Somente a administração ou coordenação pode editar pesquisas.'; end if;
  if length(trim(coalesce(p_title, ''))) < 4 then raise exception 'Informe um título para a pesquisa.'; end if;
  if p_status not in ('draft', 'pilot', 'active', 'closed') then raise exception 'Situação da pesquisa inválida.'; end if;
  if p_survey_type not in ('quantitative', 'qualitative', 'directional', 'electoral', 'data_collection', 'relationship') then
    raise exception 'Tipo de pesquisa inválido.';
  end if;
  if p_survey_type = 'relationship' and v_actor.role <> 'admin' then
    raise exception 'Somente a administração pode editar formulários de relacionamento.';
  end if;

  if p_id is null then
    v_slug := trim(both '-' from regexp_replace(lower(trim(p_title)), '[^a-z0-9]+', '-', 'g'));
    if v_slug = '' then v_slug := 'pesquisa'; end if;
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 8);
    insert into public.surveys (
      slug, title, description, status, survey_type, estimated_minutes,
      consent_version, consent_text, is_test, target_cities, target_regions,
      target_neighborhoods, created_by
    ) values (
      v_slug, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_status,
      p_survey_type, greatest(1, least(coalesce(p_estimated_minutes, 10), 180)),
      to_char(now(), 'YYYY-MM-DD-HH24MI'), trim(coalesce(p_consent_text, '')),
      coalesce(p_is_test, false), coalesce(p_target_cities, '{}'::text[]),
      coalesce(p_target_regions, '{}'::text[]),
      coalesce(p_target_neighborhoods, '{}'::text[]), auth.uid()
    ) returning id into v_id;
  else
    if v_actor.role = 'coordenador' and not public.manager_can_access_survey(p_id) then
      raise exception 'Esta pesquisa não pertence à sua coordenação.';
    end if;
    update public.surveys set
      title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      status = p_status,
      survey_type = p_survey_type,
      estimated_minutes = greatest(1, least(coalesce(p_estimated_minutes, 10), 180)),
      consent_text = trim(coalesce(p_consent_text, '')),
      consent_version = to_char(now(), 'YYYY-MM-DD-HH24MI'),
      is_test = coalesce(p_is_test, false),
      target_cities = coalesce(p_target_cities, '{}'::text[]),
      target_regions = coalesce(p_target_regions, '{}'::text[]),
      target_neighborhoods = coalesce(p_target_neighborhoods, '{}'::text[]),
      archived_at = case when p_status = 'closed' then coalesce(archived_at, now()) else null end,
      updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Pesquisa não encontrada.'; end if;
  end if;

  delete from public.survey_questions where survey_id = v_id;
  for v_question in select value from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) loop
    v_order := v_order + 1;
    insert into public.survey_questions (
      survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition
    ) values (
      v_id,
      coalesce(nullif(trim(v_question ->> 'code'), ''), 'q' || v_order),
      coalesce(nullif(trim(v_question ->> 'section'), ''), 'Perguntas'),
      v_order,
      coalesce(nullif(v_question ->> 'type', ''), 'short_text'),
      trim(coalesce(v_question ->> 'prompt', 'Pergunta ' || v_order)),
      nullif(trim(coalesce(v_question ->> 'help_text', '')), ''),
      coalesce((v_question ->> 'required')::boolean, false),
      coalesce(v_question -> 'options', '[]'::jsonb),
      v_question -> 'condition'
    );
  end loop;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), case when p_id is null then 'survey_created' else 'survey_updated' end,
    'survey', v_id::text,
    jsonb_build_object('title', trim(p_title), 'question_count', v_order, 'is_test', p_is_test)
  );
  return v_id;
end;
$$;

-- Relacionamento por link público, sem cadastro do eleitor.
create sequence if not exists public.mobilization_response_seq start 1;

create table if not exists public.mobilization_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('apoiador', 'lideranca')),
  city text,
  region text,
  neighborhood text,
  public_code text not null unique default encode(gen_random_bytes(18), 'hex'),
  active boolean not null default true,
  thank_you_video_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mobilization_responses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default (
    'MOB-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.mobilization_response_seq')::text, 6, '0')
  ),
  partner_id uuid not null references public.mobilization_partners(id),
  survey_id uuid not null references public.surveys(id),
  answers jsonb not null default '{}'::jsonb,
  city text,
  region text,
  neighborhood text,
  privacy_consent boolean not null,
  content_opt_in boolean not null default false,
  meetings_opt_in boolean not null default false,
  volunteer_opt_in boolean not null default false,
  academic_consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.mobilization_contacts (
  response_id uuid primary key references public.mobilization_responses(id) on delete cascade,
  respondent_name text,
  whatsapp text,
  email text,
  contact_consent boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists mobilization_responses_partner_idx
  on public.mobilization_responses (partner_id, created_at desc);
create index if not exists mobilization_responses_territory_idx
  on public.mobilization_responses (city, region, neighborhood);

drop trigger if exists mobilization_partners_set_updated_at on public.mobilization_partners;
create trigger mobilization_partners_set_updated_at
before update on public.mobilization_partners
for each row execute function public.set_updated_at();

alter table public.mobilization_partners enable row level security;
alter table public.mobilization_responses enable row level security;
alter table public.mobilization_contacts enable row level security;

create or replace function public.create_mobilization_partner(
  p_name text,
  p_kind text,
  p_city text default null,
  p_region text default null,
  p_neighborhood text default null,
  p_video_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.mobilization_partners;
begin
  if not public.is_full_admin() then
    raise exception 'Somente a administração pode criar links de mobilização.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Informe o nome do apoiador ou liderança.'; end if;
  if p_kind not in ('apoiador', 'lideranca') then raise exception 'Tipo de parceiro inválido.'; end if;
  insert into public.mobilization_partners (
    name, kind, city, region, neighborhood, thank_you_video_url, created_by
  ) values (
    trim(p_name), p_kind, nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''), nullif(trim(coalesce(p_neighborhood, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''), auth.uid()
  ) returning * into v_partner;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'mobilization_partner_created', 'mobilization_partner', v_partner.id::text,
    jsonb_build_object('name', v_partner.name, 'kind', v_partner.kind)
  );
  return jsonb_build_object('id', v_partner.id, 'code', v_partner.public_code);
end;
$$;

create or replace function public.list_mobilization_partners()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when not public.is_full_admin() then
      (select jsonb_build_object('error', 'Acesso não autorizado.'))
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'kind', p.kind,
        'city', p.city,
        'region', p.region,
        'neighborhood', p.neighborhood,
        'code', p.public_code,
        'active', p.active,
        'video_url', p.thank_you_video_url,
        'responses', (select count(*) from public.mobilization_responses r where r.partner_id = p.id),
        'content_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.content_opt_in),
        'volunteer_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.volunteer_opt_in),
        'last_response_at', (select max(r.created_at) from public.mobilization_responses r where r.partner_id = p.id)
      ) order by p.created_at desc)
      from public.mobilization_partners p
    ), '[]'::jsonb)
  end;
$$;

create or replace function public.get_public_mobilization_form(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'partner', jsonb_build_object(
      'name', partner.name,
      'kind', partner.kind,
      'city', partner.city,
      'region', partner.region,
      'neighborhood', partner.neighborhood
    ),
    'survey', jsonb_build_object(
      'id', survey.id,
      'title', survey.title,
      'description', survey.description,
      'consent_text', survey.consent_text,
      'video_url', coalesce(partner.thank_you_video_url, survey.thank_you_video_url)
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', q.code, 'section', q.section, 'type', q.type,
        'prompt', q.prompt, 'help_text', q.help_text, 'required', q.required,
        'options', q.options, 'condition', q.condition
      ) order by q.sort_order)
      from public.survey_questions q where q.survey_id = survey.id
    ), '[]'::jsonb)
  )
  from public.mobilization_partners partner
  cross join lateral (
    select s.* from public.surveys s
    where s.survey_type = 'relationship'
      and s.status in ('pilot', 'active')
      and s.archived_at is null
    order by s.updated_at desc limit 1
  ) survey
  where partner.public_code = trim(coalesce(p_code, '')) and partner.active;
$$;

create or replace function public.submit_public_mobilization_response(
  p_code text,
  p_answers jsonb,
  p_name text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_contact_consent boolean default false,
  p_content_opt_in boolean default false,
  p_meetings_opt_in boolean default false,
  p_volunteer_opt_in boolean default false,
  p_academic_consent boolean default false,
  p_city text default null,
  p_region text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.mobilization_partners;
  v_survey public.surveys;
  v_response public.mobilization_responses;
  v_has_contact boolean;
begin
  select * into v_partner from public.mobilization_partners
  where public_code = trim(coalesce(p_code, '')) and active;
  if v_partner.id is null then raise exception 'Este link não está ativo.'; end if;
  select * into v_survey from public.surveys
  where survey_type = 'relationship' and status in ('pilot', 'active') and archived_at is null
  order by updated_at desc limit 1;
  if v_survey.id is null then raise exception 'Formulário de relacionamento indisponível.'; end if;
  if not coalesce(p_contact_consent, false) then
    raise exception 'É necessário aceitar o aviso de privacidade para enviar.';
  end if;

  insert into public.mobilization_responses (
    partner_id, survey_id, answers, city, region, neighborhood, privacy_consent,
    content_opt_in, meetings_opt_in, volunteer_opt_in, academic_consent
  ) values (
    v_partner.id, v_survey.id, coalesce(p_answers, '{}'::jsonb),
    coalesce(nullif(trim(coalesce(p_city, '')), ''), v_partner.city),
    coalesce(nullif(trim(coalesce(p_region, '')), ''), v_partner.region),
    coalesce(nullif(trim(coalesce(p_neighborhood, '')), ''), v_partner.neighborhood),
    true, coalesce(p_content_opt_in, false), coalesce(p_meetings_opt_in, false),
    coalesce(p_volunteer_opt_in, false), coalesce(p_academic_consent, false)
  ) returning * into v_response;

  v_has_contact :=
    nullif(trim(coalesce(p_name, '')), '') is not null
    or nullif(trim(coalesce(p_whatsapp, '')), '') is not null
    or nullif(trim(coalesce(p_email, '')), '') is not null;
  if v_has_contact then
    insert into public.mobilization_contacts (
      response_id, respondent_name, whatsapp, email, contact_consent
    ) values (
      v_response.id, nullif(trim(coalesce(p_name, '')), ''),
      nullif(trim(coalesce(p_whatsapp, '')), ''),
      nullif(trim(coalesce(p_email, '')), ''), true
    );
  end if;

  return jsonb_build_object(
    'code', v_response.code,
    'video_url', coalesce(v_partner.thank_you_video_url, v_survey.thank_you_video_url)
  );
end;
$$;

create or replace function public.list_vault_contacts(p_token text, p_limit integer default 100)
returns table(interview_id uuid, respondent_name text, contact_choice text, contact_whatsapp text, contact_email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.vault_sessions
    where profile_id = auth.uid()
      and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex')
      and expires_at > now()
  ) then raise exception 'Cofre bloqueado ou sessão expirada.'; end if;
  insert into public.audit_events(actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'vault_contacts_viewed', 'contact_vault', auth.uid()::text,
    jsonb_build_object('limit', least(greatest(coalesce(p_limit,100),1),250))
  );
  return query
  select source.interview_id, source.respondent_name, source.contact_choice,
         source.contact_whatsapp, source.contact_email, source.created_at
  from (
    select c.interview_id, c.respondent_name, c.contact_choice,
           c.contact_whatsapp, c.contact_email, c.created_at
    from public.contact_vault c
    union all
    select mc.response_id,
           mc.respondent_name,
           concat_ws(' · ',
             'Mobilização',
             case when mr.content_opt_in then 'conteúdo' end,
             case when mr.meetings_opt_in then 'encontros' end,
             case when mr.volunteer_opt_in then 'voluntariado' end,
             case when mr.academic_consent then 'uso acadêmico anonimizado' end
           ),
           mc.whatsapp, mc.email, mc.created_at
    from public.mobilization_contacts mc
    join public.mobilization_responses mr on mr.id = mc.response_id
  ) source
  order by source.created_at desc
  limit least(greatest(coalesce(p_limit,100),1),250);
end;
$$;

revoke all on table public.team_links, public.profile_territories,
  public.mobilization_partners, public.mobilization_responses, public.mobilization_contacts
from public, anon, authenticated;
grant select on public.team_links, public.profile_territories to authenticated;

revoke all on function public.create_managed_access_invite(text,text,uuid,text[],text[],text[]) from public, anon;
revoke all on function public.redeem_access_invite(text) from public, anon;
revoke all on function public.set_profile_territories_manager(uuid,text[],text[],text[]) from public, anon;
revoke all on function public.set_coordinator_territories_admin(uuid,text[],text[],text[]) from public, anon;
revoke all on function public.set_survey_assignments_admin(uuid,uuid[],text,text,text,text) from public, anon;
revoke all on function public.manage_profile_access(uuid,boolean) from public, anon;
revoke all on function public.remove_profile_access(uuid) from public, anon;
revoke all on function public.upsert_survey_admin(uuid,text,text,text,text,integer,text,boolean,text[],text[],text[],jsonb) from public, anon;
revoke all on function public.create_mobilization_partner(text,text,text,text,text,text) from public, anon;
revoke all on function public.list_mobilization_partners() from public, anon;
revoke all on function public.get_public_mobilization_form(text) from public, anon;
revoke all on function public.submit_public_mobilization_response(text,jsonb,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text) from public, anon;
revoke all on function public.list_vault_contacts(text,integer) from public, anon;

grant execute on function public.create_managed_access_invite(text,text,uuid,text[],text[],text[]) to authenticated, service_role;
grant execute on function public.redeem_access_invite(text) to authenticated, service_role;
grant execute on function public.set_profile_territories_manager(uuid,text[],text[],text[]) to authenticated, service_role;
grant execute on function public.set_coordinator_territories_admin(uuid,text[],text[],text[]) to authenticated, service_role;
grant execute on function public.set_survey_assignments_admin(uuid,uuid[],text,text,text,text) to authenticated, service_role;
grant execute on function public.manage_profile_access(uuid,boolean) to authenticated, service_role;
grant execute on function public.remove_profile_access(uuid) to authenticated, service_role;
grant execute on function public.upsert_survey_admin(uuid,text,text,text,text,integer,text,boolean,text[],text[],text[],jsonb) to authenticated, service_role;
grant execute on function public.create_mobilization_partner(text,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.list_mobilization_partners() to authenticated, service_role;
grant execute on function public.get_public_mobilization_form(text) to anon, authenticated, service_role;
grant execute on function public.submit_public_mobilization_response(text,jsonb,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text) to anon, authenticated, service_role;
grant execute on function public.list_vault_contacts(text,integer) to authenticated, service_role;

commit;
