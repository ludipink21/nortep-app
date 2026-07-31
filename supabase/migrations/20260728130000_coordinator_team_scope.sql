-- NorteP Pesquisa · escopo real das equipes de coordenação.
-- Preserva usuários, pesquisas, entrevistas, respostas e auditoria existentes.
-- Remove a liberação automática de todas as pesquisas e aplica o menor privilégio.

begin;

drop trigger if exists profiles_assign_on_activation on public.profiles;

create table if not exists public.coordinator_memberships (
  researcher_id uuid primary key references public.profiles(id) on delete cascade,
  coordinator_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (researcher_id <> coordinator_id)
);

create index if not exists coordinator_memberships_coordinator_idx
  on public.coordinator_memberships (coordinator_id, active);

drop trigger if exists coordinator_memberships_set_updated_at on public.coordinator_memberships;
create trigger coordinator_memberships_set_updated_at
before update on public.coordinator_memberships
for each row execute function public.set_updated_at();

alter table public.coordinator_memberships enable row level security;

alter table public.access_invites
  add column if not exists coordinator_id uuid references public.profiles(id);

create or replace function public.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'coordenador'
      and active
      and access_removed_at is null
  );
$$;

create or replace function public.coordinator_can_access_researcher(p_researcher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coordinator_memberships cm
    join public.profiles coordinator on coordinator.id = cm.coordinator_id
    join public.profiles researcher on researcher.id = cm.researcher_id
    where cm.coordinator_id = auth.uid()
      and cm.researcher_id = p_researcher_id
      and cm.active
      and coordinator.role = 'coordenador'
      and coordinator.active
      and coordinator.access_removed_at is null
      and researcher.role = 'pesquisador'
      and researcher.access_removed_at is null
  );
$$;

create or replace function public.coordinator_can_access_survey(p_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coordinator_memberships cm
    join public.survey_assignments sa on sa.researcher_id = cm.researcher_id
    where cm.coordinator_id = auth.uid()
      and cm.active
      and sa.survey_id = p_survey_id
      and sa.active
  );
$$;

revoke all on function public.is_coordinator() from public, anon;
revoke all on function public.coordinator_can_access_researcher(uuid) from public, anon;
revoke all on function public.coordinator_can_access_survey(uuid) from public, anon;
grant execute on function public.is_coordinator() to authenticated, service_role;
grant execute on function public.coordinator_can_access_researcher(uuid) to authenticated, service_role;
grant execute on function public.coordinator_can_access_survey(uuid) to authenticated, service_role;

drop policy if exists coordinator_memberships_read_scoped on public.coordinator_memberships;
create policy coordinator_memberships_read_scoped
on public.coordinator_memberships for select to authenticated
using (
  public.is_full_admin()
  or coordinator_id = auth.uid()
  or researcher_id = auth.uid()
);

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or public.is_full_admin()
  or public.coordinator_can_access_researcher(id)
);

drop policy if exists surveys_read_assigned on public.surveys;
create policy surveys_read_assigned
on public.surveys for select to authenticated
using (
  public.is_full_admin()
  or public.coordinator_can_access_survey(id)
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
  or public.coordinator_can_access_survey(survey_id)
  or exists (
    select 1 from public.survey_assignments a
    where a.survey_id = survey_id and a.researcher_id = auth.uid() and a.active
  )
);

drop policy if exists assignments_read_own_or_admin on public.survey_assignments;
create policy assignments_read_own_or_admin
on public.survey_assignments for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.coordinator_can_access_researcher(researcher_id)
);

drop policy if exists assignments_admin_all on public.survey_assignments;
create policy assignments_admin_all
on public.survey_assignments for all to authenticated
using (public.is_full_admin())
with check (public.is_full_admin());

drop policy if exists interviews_read_own_or_admin on public.interviews;
create policy interviews_read_own_or_admin
on public.interviews for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.coordinator_can_access_researcher(researcher_id)
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
        or public.coordinator_can_access_researcher(i.researcher_id)
      )
  )
);

drop policy if exists consents_read_own_or_admin on public.consent_records;
create policy consents_read_own_or_admin
on public.consent_records for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.coordinator_can_access_researcher(researcher_id)
);

drop policy if exists field_events_read_own_or_admin on public.field_events;
create policy field_events_read_own_or_admin
on public.field_events for select to authenticated
using (
  researcher_id = auth.uid()
  or public.is_full_admin()
  or public.coordinator_can_access_researcher(researcher_id)
);

drop policy if exists audit_admin_read on public.audit_events;
create policy audit_admin_read
on public.audit_events for select to authenticated
using (public.is_full_admin() or actor_id = auth.uid());

drop policy if exists access_invites_admin_read on public.access_invites;
create policy access_invites_admin_read
on public.access_invites for select to authenticated
using (public.is_full_admin() or created_by = auth.uid());

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
  where id = auth.uid()
    and active
    and access_removed_at is null
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
    if v_coordinator_id is not null and not exists (
      select 1 from public.profiles
      where id = v_coordinator_id
        and role = 'coordenador'
        and active
        and access_removed_at is null
    ) then
      raise exception 'Coordenador escolhido não está ativo.';
    end if;
  end if;

  update public.access_invites
  set revoked_at = now()
  where lower(email) = v_email
    and role = p_role
    and used_at is null
    and revoked_at is null
    and expires_at > now();

  insert into public.access_invites (email, role, token_hash, created_by, expires_at, coordinator_id)
  values (
    v_email,
    p_role,
    encode(digest(v_code, 'sha256'), 'hex'),
    auth.uid(),
    now() + interval '72 hours',
    v_coordinator_id
  )
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'invite_created',
    'access_invite',
    v_invite_id::text,
    jsonb_build_object(
      'email', v_email,
      'role', p_role,
      'coordinator_id', v_coordinator_id,
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
  if auth.uid() is null then
    raise exception 'Entre em sua conta para aceitar o convite.';
  end if;

  select * into v_invite
  from public.access_invites
  where token_hash = encode(digest(trim(coalesce(p_code, '')), 'sha256'), 'hex')
    and lower(email) = v_email
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail.';
  end if;

  update public.profiles
  set role = v_invite.role,
      active = true,
      access_removed_at = null,
      updated_at = now()
  where id = auth.uid() and lower(email) = v_email;

  if not found then raise exception 'Perfil não encontrado para este convite.'; end if;

  if v_invite.role = 'pesquisador' and v_invite.coordinator_id is not null then
    insert into public.coordinator_memberships (
      researcher_id, coordinator_id, active, assigned_by
    )
    values (
      auth.uid(), v_invite.coordinator_id, true, v_invite.created_by
    )
    on conflict (researcher_id) do update set
      coordinator_id = excluded.coordinator_id,
      active = true,
      assigned_by = excluded.assigned_by,
      updated_at = now();
  end if;

  update public.access_invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'invite_redeemed',
    'access_invite',
    v_invite.id::text,
    jsonb_build_object(
      'email', v_email,
      'role', v_invite.role,
      'coordinator_id', v_invite.coordinator_id,
      'reactivated', true
    )
  );
  return v_invite.role;
end;
$$;

create or replace function public.set_coordinator_members_admin(
  p_coordinator_id uuid,
  p_researcher_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_full_admin() then
    raise exception 'Somente a administração pode organizar equipes.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_coordinator_id
      and role = 'coordenador'
      and active
      and access_removed_at is null
  ) then
    raise exception 'Coordenador não encontrado ou inativo.';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_researcher_ids, '{}'::uuid[])) chosen(id)
    left join public.profiles p on p.id = chosen.id
    where p.id is null
      or p.role <> 'pesquisador'
      or not p.active
      or p.access_removed_at is not null
  ) then
    raise exception 'A equipe contém um pesquisador inválido ou inativo.';
  end if;

  update public.coordinator_memberships
  set active = false, updated_at = now(), assigned_by = auth.uid()
  where coordinator_id = p_coordinator_id
    and researcher_id <> all(coalesce(p_researcher_ids, '{}'::uuid[]));

  insert into public.coordinator_memberships (
    researcher_id, coordinator_id, active, assigned_by
  )
  select id, p_coordinator_id, true, auth.uid()
  from unnest(coalesce(p_researcher_ids, '{}'::uuid[])) chosen(id)
  on conflict (researcher_id) do update set
    coordinator_id = excluded.coordinator_id,
    active = true,
    assigned_by = excluded.assigned_by,
    updated_at = now();

  select count(*) into v_count
  from public.coordinator_memberships
  where coordinator_id = p_coordinator_id and active;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'coordinator_members_updated',
    'profile',
    p_coordinator_id::text,
    jsonb_build_object('researcher_count', v_count)
  );
  return v_count;
end;
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
  select * into v_actor
  from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador');

  if v_actor.id is null then raise exception 'Acesso administrativo não autorizado.'; end if;
  if not exists (select 1 from public.surveys where id = p_survey_id and archived_at is null) then
    raise exception 'Pesquisa não encontrada ou arquivada.';
  end if;
  if v_actor.role = 'coordenador' and exists (
    select 1
    from unnest(coalesce(p_researcher_ids, '{}'::uuid[])) chosen(id)
    where not public.coordinator_can_access_researcher(chosen.id)
  ) then
    raise exception 'O coordenador só pode liberar pesquisas para a própria equipe.';
  end if;

  if v_actor.role = 'admin' then
    update public.survey_assignments set active = false where survey_id = p_survey_id;
  else
    update public.survey_assignments sa
    set active = false
    where sa.survey_id = p_survey_id
      and public.coordinator_can_access_researcher(sa.researcher_id);
  end if;

  insert into public.survey_assignments (
    survey_id, researcher_id, active, assigned_by, team_name, city, region, neighborhood
  )
  select
    p_survey_id,
    p.id,
    true,
    auth.uid(),
    nullif(trim(coalesce(p_team_name, '')), ''),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), '')
  from public.profiles p
  where p.id = any(coalesce(p_researcher_ids, '{}'::uuid[]))
    and p.role = 'pesquisador'
    and p.active
    and p.access_removed_at is null
    and (v_actor.role = 'admin' or public.coordinator_can_access_researcher(p.id))
  on conflict (survey_id, researcher_id) do update set
    active = true,
    assigned_by = auth.uid(),
    team_name = excluded.team_name,
    city = excluded.city,
    region = excluded.region,
    neighborhood = excluded.neighborhood;

  get diagnostics v_count = row_count;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'survey_assignments_updated',
    'survey',
    p_survey_id::text,
    jsonb_build_object(
      'researcher_count', v_count,
      'team', p_team_name,
      'city', p_city,
      'region', p_region,
      'neighborhood', p_neighborhood
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
     or v_actor.role not in ('admin', 'coordenador') then raise exception 'Ação não autorizada.'; end if;
  if v_target.id is null or v_target.access_removed_at is not null then raise exception 'Acesso não encontrado.'; end if;
  if v_target.id = v_actor.id then raise exception 'Você não pode alterar o próprio acesso.'; end if;
  if v_target.is_primary_admin then raise exception 'A conta da administradora fundadora é protegida.'; end if;
  if v_target.role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode alterar outro administrador.';
  end if;
  if v_actor.role = 'coordenador' and (
    v_target.role <> 'pesquisador'
    or not public.coordinator_can_access_researcher(v_target.id)
  ) then
    raise exception 'Coordenadores podem alterar somente pesquisadores da própria equipe.';
  end if;

  update public.profiles set active = p_active, updated_at = now()
  where id = p_profile_id returning * into v_result;
  if not p_active then
    update public.survey_assignments set active = false where researcher_id = p_profile_id;
  end if;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    v_actor.id,
    case when p_active then 'access_reactivated' else 'access_suspended' end,
    'profile',
    p_profile_id::text,
    jsonb_build_object('target_role', v_target.role)
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
     or v_actor.role not in ('admin', 'coordenador') then raise exception 'Ação não autorizada.'; end if;
  if v_target.id is null or v_target.access_removed_at is not null then raise exception 'Acesso não encontrado.'; end if;
  if v_target.id = v_actor.id then raise exception 'Você não pode apagar o próprio acesso.'; end if;
  if v_target.is_primary_admin then raise exception 'A conta da administradora fundadora é protegida.'; end if;
  if v_target.role = 'admin' and not v_actor.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode apagar outro administrador.';
  end if;
  if v_actor.role = 'coordenador' and (
    v_target.role <> 'pesquisador'
    or not public.coordinator_can_access_researcher(v_target.id)
  ) then
    raise exception 'Coordenadores podem apagar somente pesquisadores da própria equipe.';
  end if;

  update public.survey_assignments set active = false where researcher_id = p_profile_id;
  update public.coordinator_memberships set active = false where researcher_id = p_profile_id;
  update public.profiles
  set active = false, access_removed_at = now(), updated_at = now()
  where id = p_profile_id returning * into v_result;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    v_actor.id,
    'access_removed',
    'profile',
    p_profile_id::text,
    jsonb_build_object('target_role', v_target.role, 'target_email', v_target.email)
  );
  return v_result;
end;
$$;

revoke all on table public.coordinator_memberships from public, anon;
grant select on table public.coordinator_memberships to authenticated;

revoke all on function public.create_team_access_invite(text, text, uuid) from public, anon;
revoke all on function public.set_coordinator_members_admin(uuid, uuid[]) from public, anon;
revoke all on function public.redeem_access_invite(text) from public, anon;
revoke all on function public.set_survey_assignments_admin(uuid, uuid[], text, text, text, text) from public, anon;
revoke all on function public.manage_profile_access(uuid, boolean) from public, anon;
revoke all on function public.remove_profile_access(uuid) from public, anon;

grant execute on function public.create_team_access_invite(text, text, uuid) to authenticated, service_role;
grant execute on function public.set_coordinator_members_admin(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.redeem_access_invite(text) to authenticated, service_role;
grant execute on function public.set_survey_assignments_admin(uuid, uuid[], text, text, text, text) to authenticated, service_role;
grant execute on function public.manage_profile_access(uuid, boolean) to authenticated, service_role;
grant execute on function public.remove_profile_access(uuid) to authenticated, service_role;

commit;
