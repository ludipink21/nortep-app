-- Hierarquia administrativa NorteP
-- founder: conta matriz protegida
-- primary: administrador principal operacional, criado apenas pela fundadora
-- secondary: administrador operacional, criado pela fundadora ou pelo primary

alter table public.profiles add column if not exists admin_level text;

update public.profiles
set admin_level = case
  when role = 'admin' and is_primary_admin then 'founder'
  when role = 'admin' then coalesce(admin_level, 'secondary')
  else null
end;

alter table public.profiles drop constraint if exists profiles_admin_level_check;
alter table public.profiles add constraint profiles_admin_level_check
check (
  (role = 'admin' and admin_level in ('founder', 'primary', 'secondary'))
  or (role <> 'admin' and admin_level is null)
);

alter table public.access_invites add column if not exists admin_level text;

update public.access_invites
set admin_level = case
  when role = 'admin' then coalesce(admin_level, 'secondary')
  else null
end;

alter table public.access_invites drop constraint if exists access_invites_admin_level_check;
alter table public.access_invites add constraint access_invites_admin_level_check
check (
  (role = 'admin' and admin_level in ('primary', 'secondary'))
  or (role <> 'admin' and admin_level is null)
);

create table if not exists public.profile_presence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  session_started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  current_path text,
  device_label text,
  updated_at timestamptz not null default now()
);

alter table public.profile_presence enable row level security;
revoke all on table public.profile_presence from anon, authenticated;

create or replace function public.is_founder_or_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and admin_level in ('founder', 'primary')
      and active
      and access_removed_at is null
  );
$$;

revoke all on function public.is_founder_or_primary_admin() from public, anon, authenticated;

create or replace function public.touch_profile_presence(
  p_path text default null,
  p_device text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária.'; end if;

  select active and access_removed_at is null
  into v_active
  from public.profiles
  where id = auth.uid();

  if coalesce(v_active, false) is false then raise exception 'Perfil inativo.'; end if;

  insert into public.profile_presence (
    profile_id, session_started_at, last_seen_at, current_path, device_label, updated_at
  ) values (
    auth.uid(), now(), now(), left(nullif(trim(coalesce(p_path, '')), ''), 300),
    left(nullif(trim(coalesce(p_device, '')), ''), 180), now()
  )
  on conflict (profile_id) do update set
    session_started_at = case
      when public.profile_presence.last_seen_at < now() - interval '20 minutes' then now()
      else public.profile_presence.session_started_at
    end,
    last_seen_at = now(),
    current_path = excluded.current_path,
    device_label = excluded.device_label,
    updated_at = now();
end;
$$;

revoke all on function public.touch_profile_presence(text, text) from public, anon;
grant execute on function public.touch_profile_presence(text, text) to authenticated;

create or replace function public.list_profile_presence()
returns table (
  profile_id uuid,
  name text,
  email text,
  role text,
  admin_level text,
  active boolean,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  session_started_at timestamptz,
  last_seen_at timestamptz,
  current_path text,
  online_now boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_founder_or_primary_admin() then
    raise exception 'Somente a Fundadora e o Administrador Primário podem ver a presença da equipe.';
  end if;

  return query
  select p.id, p.name, p.email, p.role, p.admin_level, p.active,
         u.email_confirmed_at, u.last_sign_in_at,
         pr.session_started_at, pr.last_seen_at, pr.current_path,
         coalesce(pr.last_seen_at > now() - interval '60 seconds', false)
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.profile_presence pr on pr.profile_id = p.id
  where p.access_removed_at is null
  order by coalesce(pr.last_seen_at > now() - interval '60 seconds', false) desc,
           pr.last_seen_at desc nulls last,
           u.last_sign_in_at desc nulls last,
           p.created_at desc;
end;
$$;

revoke all on function public.list_profile_presence() from public, anon;
grant execute on function public.list_profile_presence() to authenticated;

create or replace function public.create_primary_admin_invite(p_email text)
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
  where id = auth.uid()
    and role = 'admin'
    and admin_level = 'founder'
    and is_primary_admin
    and active
    and access_removed_at is null;

  if v_actor.id is null then
    raise exception 'Somente a Administradora Fundadora pode criar o Administrador Primário.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;
  if exists (
    select 1 from public.profiles
    where role = 'admin' and admin_level = 'primary'
      and active and access_removed_at is null
  ) then
    raise exception 'Já existe um Administrador Primário ativo.';
  end if;

  update public.access_invites set revoked_at = now()
  where lower(email) = v_email
    and used_at is null and revoked_at is null and expires_at > now();

  update public.access_invites set revoked_at = now()
  where role = 'admin' and admin_level = 'primary'
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (
    email, role, admin_level, token_hash, created_by, expires_at
  ) values (
    v_email, 'admin', 'primary', encode(digest(v_code, 'sha256'), 'hex'),
    auth.uid(), now() + interval '72 hours'
  ) returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'primary_admin_invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'admin_level', 'primary', 'expires_in_hours', 72)
  );
  return v_code;
end;
$$;

revoke all on function public.create_primary_admin_invite(text) from public, anon;
grant execute on function public.create_primary_admin_invite(text) to authenticated;

create or replace function public.create_managed_access_invite(
  p_email text,
  p_role text,
  p_coordinator_id uuid default null,
  p_cities text[] default '{}',
  p_regions text[] default '{}',
  p_neighborhoods text[] default '{}'
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
  v_admin_level text;
begin
  select * into v_actor from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador', 'supervisor');

  if v_actor.id is null then raise exception 'Acesso de gestão não autorizado.'; end if;
  if p_role not in ('admin', 'coordenador', 'supervisor', 'pesquisador', 'observador') then
    raise exception 'Função de acesso inválida.';
  end if;

  if p_role = 'admin' then
    if v_actor.role <> 'admin' or v_actor.admin_level not in ('founder', 'primary') then
      raise exception 'Somente a Fundadora ou o Administrador Primário pode criar Administrador Secundário.';
    end if;
    v_admin_level := 'secondary';
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
    if v_manager_id is null then raise exception 'Escolha o responsável direto por este acesso.'; end if;

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

  update public.access_invites set revoked_at = now()
  where lower(email) = v_email
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (
    email, role, admin_level, token_hash, created_by, expires_at,
    coordinator_id, manager_id,
    territory_cities, territory_regions, territory_neighborhoods
  ) values (
    v_email, p_role, v_admin_level, encode(digest(v_code, 'sha256'), 'hex'),
    auth.uid(), now() + interval '72 hours',
    case when v_manager.role = 'coordenador' then v_manager_id else null end,
    v_manager_id,
    coalesce(p_cities, '{}'), coalesce(p_regions, '{}'), coalesce(p_neighborhoods, '{}')
  ) returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object(
      'email', v_email, 'role', p_role, 'admin_level', v_admin_level,
      'manager_id', v_manager_id,
      'territory_cities', coalesce(p_cities, '{}'),
      'territory_regions', coalesce(p_regions, '{}'),
      'territory_neighborhoods', coalesce(p_neighborhoods, '{}'),
      'expires_in_hours', 72
    )
  );
  return v_code;
end;
$$;

revoke all on function public.create_managed_access_invite(text, text, uuid, text[], text[], text[]) from public, anon;
grant execute on function public.create_managed_access_invite(text, text, uuid, text[], text[], text[]) to authenticated;

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

  select * into v_invite from public.access_invites
  where token_hash = encode(digest(trim(coalesce(p_code, '')), 'sha256'), 'hex')
    and lower(email) = v_email
    and used_at is null and revoked_at is null and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail.';
  end if;

  update public.profiles
  set role = case when is_primary_admin then 'admin' else v_invite.role end,
      admin_level = case
        when is_primary_admin then 'founder'
        when v_invite.role = 'admin' then coalesce(v_invite.admin_level, 'secondary')
        else null
      end,
      observer_mode = case when v_invite.role = 'observador' then v_invite.observer_mode else 'geral' end,
      active = true,
      access_removed_at = null,
      updated_at = now()
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

  update public.access_invites set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'invite_redeemed', 'access_invite', v_invite.id::text,
    jsonb_build_object(
      'email', v_email, 'role', v_invite.role, 'admin_level', v_invite.admin_level,
      'manager_id', v_invite.manager_id, 'observer_mode', v_invite.observer_mode
    )
  );
  return v_invite.role;
end;
$$;

revoke all on function public.redeem_access_invite(text) from public, anon;
grant execute on function public.redeem_access_invite(text) to authenticated;

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
  if v_target.admin_level = 'founder' or v_target.is_primary_admin then
    raise exception 'A conta da Administradora Fundadora é protegida.';
  end if;

  if v_target.role = 'admin' then
    if v_actor.role <> 'admin' then raise exception 'Somente a administração pode alterar administradores.'; end if;
    if v_actor.admin_level = 'secondary' then raise exception 'Administrador Secundário não pode alterar outro administrador.'; end if;
    if v_target.admin_level = 'primary' and v_actor.admin_level <> 'founder' then
      raise exception 'Somente a Fundadora pode alterar o Administrador Primário.';
    end if;
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
    'profile', p_profile_id::text,
    jsonb_build_object('target_role', v_target.role, 'target_admin_level', v_target.admin_level)
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
  if v_target.admin_level = 'founder' or v_target.is_primary_admin then
    raise exception 'A conta da Administradora Fundadora é protegida e não pode ser removida.';
  end if;

  if v_target.role = 'admin' then
    if v_actor.role <> 'admin' then raise exception 'Somente a administração pode apagar administradores.'; end if;
    if v_actor.admin_level = 'secondary' then raise exception 'Administrador Secundário não pode apagar outro administrador.'; end if;
    if v_target.admin_level = 'primary' and v_actor.admin_level <> 'founder' then
      raise exception 'Somente a Fundadora pode apagar o Administrador Primário.';
    end if;
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
  delete from public.profile_presence where profile_id = p_profile_id;

  update public.profiles
  set active = false, access_removed_at = now(), updated_at = now()
  where id = p_profile_id returning * into v_result;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    v_actor.id, 'access_removed', 'profile', p_profile_id::text,
    jsonb_build_object(
      'target_role', v_target.role,
      'target_admin_level', v_target.admin_level,
      'target_email', v_target.email
    )
  );
  return v_result;
end;
$$;

-- Preserve the founder designation when new auth users are created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_is_founder boolean := v_email = 'bussolanortep@gmail.com';
begin
  insert into public.profiles (
    id, name, email, role, active, is_primary_admin, admin_level, access_removed_at
  ) values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(v_email, '@', 1)
    ),
    v_email,
    case when v_is_founder then 'admin' else 'pesquisador' end,
    v_is_founder,
    v_is_founder,
    case when v_is_founder then 'founder' else null end,
    null
  )
  on conflict (id) do update set
    name = case when trim(public.profiles.name) = '' then excluded.name else public.profiles.name end,
    email = excluded.email,
    role = case when v_is_founder then 'admin' else public.profiles.role end,
    active = case when v_is_founder then true else public.profiles.active end,
    is_primary_admin = case when v_is_founder then true else public.profiles.is_primary_admin end,
    admin_level = case
      when v_is_founder then 'founder'
      when public.profiles.role = 'admin' then coalesce(public.profiles.admin_level, 'secondary')
      else null
    end,
    access_removed_at = case when v_is_founder then null else public.profiles.access_removed_at end,
    updated_at = now();

  if v_is_founder then
    insert into public.survey_assignments (survey_id, researcher_id, active)
    select id, new.id, true from public.surveys
    where status in ('pilot', 'active')
    on conflict (survey_id, researcher_id) do update set active = true;
  end if;
  return new;
end;
$$;
