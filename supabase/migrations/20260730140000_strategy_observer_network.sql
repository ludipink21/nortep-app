-- NorteP Pesquisa · Sala de Situação, painel estratégico do candidato,
-- rede de lideranças e vídeo de agradecimento por pesquisa.

begin;

alter table public.profiles
  add column if not exists observer_mode text not null default 'geral';

alter table public.profiles
  drop constraint if exists profiles_observer_mode_check;
alter table public.profiles
  add constraint profiles_observer_mode_check
  check (observer_mode in ('geral', 'candidato'));

alter table public.access_invites
  add column if not exists observer_mode text not null default 'geral';

alter table public.access_invites
  drop constraint if exists access_invites_observer_mode_check;
alter table public.access_invites
  add constraint access_invites_observer_mode_check
  check (observer_mode in ('geral', 'candidato'));

alter table public.mobilization_partners
  add column if not exists parent_id uuid references public.mobilization_partners(id) on delete set null;

alter table public.mobilization_partners
  drop constraint if exists mobilization_partners_parent_not_self;
alter table public.mobilization_partners
  add constraint mobilization_partners_parent_not_self
  check (parent_id is null or parent_id <> id);

create index if not exists mobilization_partners_parent_idx
  on public.mobilization_partners(parent_id) where parent_id is not null;

create or replace function public.create_candidate_observer_invite(p_email text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_code text := encode(gen_random_bytes(20), 'hex');
  v_invite_id uuid;
begin
  if not public.is_primary_admin() then
    raise exception 'Somente a administradora fundadora pode criar o painel do candidato.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  update public.access_invites
  set revoked_at = now()
  where lower(email) = v_email
    and role = 'observador'
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (
    email, role, observer_mode, token_hash, created_by, expires_at
  ) values (
    v_email, 'observador', 'candidato',
    encode(digest(v_code, 'sha256'), 'hex'),
    auth.uid(), now() + interval '72 hours'
  ) returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'candidate_observer_invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'observer_mode', 'candidato', 'expires_in_hours', 72)
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
  set role = v_invite.role,
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

  update public.access_invites set used_at = now(), used_by = auth.uid() where id = v_invite.id;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'invite_redeemed', 'access_invite', v_invite.id::text,
    jsonb_build_object(
      'email', v_email, 'role', v_invite.role, 'manager_id', v_invite.manager_id,
      'observer_mode', v_invite.observer_mode
    )
  );
  return v_invite.role;
end;
$$;

create or replace function public.create_mobilization_partner(
  p_name text,
  p_kind text,
  p_city text default null,
  p_region text default null,
  p_neighborhood text default null,
  p_video_url text default null,
  p_parent_id uuid default null
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
  if p_parent_id is not null and not exists (
    select 1 from public.mobilization_partners where id = p_parent_id and active
  ) then
    raise exception 'A liderança que realizou a indicação não está ativa.';
  end if;

  insert into public.mobilization_partners (
    name, kind, city, region, neighborhood, thank_you_video_url, parent_id, created_by
  ) values (
    trim(p_name), p_kind, nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''), nullif(trim(coalesce(p_neighborhood, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''), p_parent_id, auth.uid()
  ) returning * into v_partner;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'mobilization_partner_created', 'mobilization_partner', v_partner.id::text,
    jsonb_build_object('name', v_partner.name, 'kind', v_partner.kind, 'parent_id', p_parent_id)
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
      jsonb_build_object('error', 'Acesso não autorizado.')
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
        'parent_id', p.parent_id,
        'parent_name', parent.name,
        'responses', (select count(*) from public.mobilization_responses r where r.partner_id = p.id),
        'content_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.content_opt_in),
        'meetings_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.meetings_opt_in),
        'volunteer_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.volunteer_opt_in),
        'referrals', (select count(*) from public.mobilization_partners child where child.parent_id = p.id and child.active),
        'last_response_at', (select max(r.created_at) from public.mobilization_responses r where r.partner_id = p.id)
      ) order by p.created_at asc)
      from public.mobilization_partners p
      left join public.mobilization_partners parent on parent.id = p.parent_id
    ), '[]'::jsonb)
  end;
$$;

create or replace function public.set_survey_thank_you_video_admin(
  p_survey_id uuid,
  p_video_url text default null
)
returns public.surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_result public.surveys;
  v_video text := nullif(trim(coalesce(p_video_url, '')), '');
begin
  select * into v_actor from public.profiles
  where id = auth.uid() and active and access_removed_at is null
    and role in ('admin', 'coordenador');
  if v_actor.id is null then
    raise exception 'Acesso de edição não autorizado.';
  end if;
  if v_actor.role = 'coordenador' and not public.manager_can_access_survey(p_survey_id) then
    raise exception 'Esta pesquisa não pertence à sua coordenação.';
  end if;
  if v_video is not null and v_video !~* '^https?://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/' then
    raise exception 'Use um link válido do YouTube.';
  end if;

  update public.surveys
  set thank_you_video_url = v_video, updated_at = now()
  where id = p_survey_id
  returning * into v_result;
  if v_result.id is null then raise exception 'Pesquisa não encontrada.'; end if;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'survey_thank_you_video_updated', 'survey', p_survey_id::text,
    jsonb_build_object('configured', v_video is not null)
  );
  return v_result;
end;
$$;

create or replace function public.observer_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_result jsonb;
  v_total integer;
  v_events integer;
begin
  select * into v_actor from public.profiles
  where id = auth.uid() and active and access_removed_at is null;
  if v_actor.id is null or v_actor.role not in ('observador', 'admin') then
    raise exception 'Acesso de observação não autorizado.';
  end if;

  select count(*) into v_total
  from public.interviews
  where status = 'completed' and not coalesce(is_test, false);

  select count(*) into v_events
  from public.field_events
  where not coalesce(is_test, false);

  with completed as (
    select *
    from public.interviews
    where status = 'completed' and not coalesce(is_test, false)
  ),
  coverage_rows as (
    select 'cidade'::text level,
      coalesce(
        nullif(responses ->> 'localEntrevistaCidade', ''),
        nullif(responses ->> 'localColetaCidade', ''),
        nullif(responses ->> 'cidade', ''),
        nullif(responses ->> 'cidadeMoradia', '')
      ) territory
    from completed
    union all
    select 'regiao',
      coalesce(
        nullif(responses ->> 'localEntrevistaRegiao', ''),
        nullif(responses ->> 'localColetaRegiao', ''),
        nullif(responses ->> 'regiao', '')
      )
    from completed
    union all
    select 'bairro',
      coalesce(
        nullif(responses ->> 'localEntrevistaBairro', ''),
        nullif(responses ->> 'localColetaBairro', ''),
        nullif(responses ->> 'bairro', ''),
        nullif(responses ->> 'bairroMoradia', '')
      )
    from completed
  ),
  coverage_grouped as (
    select level, territory, count(*)::integer interviews
    from coverage_rows
    where territory is not null
    group by level, territory
    order by count(*) desc, territory
    limit 18
  ),
  priority_rows as (
    select trim(value) label
    from completed i
    cross join lateral regexp_split_to_table(
      coalesce(
        nullif(i.responses ->> 'prioridadeCidade', ''),
        nullif(i.responses ->> 'prioridades', ''),
        nullif(i.responses ->> 'prioridadesBairro', ''),
        nullif(i.responses ->> 'prioridadesEstado', ''),
        nullif(i.responses ->> 'temaInteresse', '')
      ),
      '\|\|'
    ) value
  ),
  priorities_grouped as (
    select label, count(*)::integer responses,
      round(count(*) * 100.0 / greatest(v_total, 1))::integer percentage
    from priority_rows
    where label <> '' and label !~* 'prefere|não sabe'
    group by label
    order by count(*) desc, label
    limit 8
  ),
  mobilization_territories as (
    select coalesce(
        nullif(concat_ws(' · ', nullif(city, ''), nullif(region, ''), nullif(neighborhood, '')), ''),
        'Território não informado'
      ) territory,
      count(*)::integer responses,
      count(*) filter (where content_opt_in)::integer content_opt_ins,
      count(*) filter (where volunteer_opt_in)::integer volunteer_opt_ins
    from public.mobilization_responses
    group by 1
    order by count(*) desc, 1
    limit 12
  )
  select jsonb_build_object(
    'observer_mode', case when v_actor.role = 'observador' then v_actor.observer_mode else 'candidato' end,
    'total_interviews', v_total,
    'interviews_today', (
      select count(*) from completed where completed_at >= current_date
    ),
    'active_researchers', (
      select count(distinct researcher_id) from completed
    ),
    'active_surveys', (
      select count(*) from public.surveys
      where status in ('pilot', 'active') and archived_at is null
    ),
    'field_events', v_events,
    'completion_rate', round(v_total * 100.0 / greatest(v_total + v_events, 1))::integer,
    'mobilization_total', (select count(*) from public.mobilization_responses),
    'mobilization_content', (select count(*) from public.mobilization_responses where content_opt_in),
    'mobilization_meetings', (select count(*) from public.mobilization_responses where meetings_opt_in),
    'mobilization_volunteers', (select count(*) from public.mobilization_responses where volunteer_opt_in),
    'updated_at', coalesce(
      greatest(
        (select max(completed_at) from completed),
        (select max(created_at) from public.mobilization_responses)
      ),
      (select max(completed_at) from completed),
      (select max(created_at) from public.mobilization_responses)
    ),
    'surveys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'status', s.status,
        'interviews', (select count(*) from completed i where i.survey_id = s.id),
        'researchers', (select count(distinct i.researcher_id) from completed i where i.survey_id = s.id),
        'video_configured', s.thank_you_video_url is not null
      ) order by s.created_at desc)
      from public.surveys s
      where s.status in ('pilot', 'active') and s.archived_at is null
    ), '[]'::jsonb),
    'coverage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'level', level, 'territory', territory, 'interviews', interviews
      ) order by interviews desc, territory)
      from coverage_grouped
    ), '[]'::jsonb),
    'priorities', case when v_total >= 5 then coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', label, 'responses', responses, 'percentage', percentage
      ) order by responses desc, label)
      from priorities_grouped
    ), '[]'::jsonb) else '[]'::jsonb end,
    'mobilization_territories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'territory', territory, 'responses', responses,
        'content_opt_ins', content_opt_ins, 'volunteer_opt_ins', volunteer_opt_ins
      ) order by responses desc, territory)
      from mobilization_territories
    ), '[]'::jsonb),
    'network', case
      when v_actor.observer_mode = 'candidato' or v_actor.role = 'admin' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'parent_id', p.parent_id,
          'parent_name', parent.name,
          'name', p.name,
          'kind', p.kind,
          'city', p.city,
          'region', p.region,
          'neighborhood', p.neighborhood,
          'responses', (select count(*) from public.mobilization_responses r where r.partner_id = p.id),
          'content_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.content_opt_in),
          'meetings_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.meetings_opt_in),
          'volunteer_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.volunteer_opt_in),
          'referrals', (select count(*) from public.mobilization_partners child where child.parent_id = p.id and child.active),
          'last_response_at', (select max(r.created_at) from public.mobilization_responses r where r.partner_id = p.id)
        ) order by p.created_at asc)
        from public.mobilization_partners p
        left join public.mobilization_partners parent on parent.id = p.parent_id
        where p.active
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  ) into v_result;

  insert into public.audit_events (actor_id, action, entity, metadata)
  values (
    auth.uid(), 'observer_summary_viewed', 'dashboard',
    jsonb_build_object(
      'aggregated_only', true,
      'observer_mode', v_actor.observer_mode,
      'network_names_visible', v_actor.observer_mode = 'candidato' or v_actor.role = 'admin'
    )
  );
  return v_result;
end;
$$;

revoke all on function public.create_candidate_observer_invite(text) from public, anon, authenticated;
revoke all on function public.redeem_access_invite(text) from public, anon, authenticated;
revoke all on function public.create_mobilization_partner(text,text,text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.list_mobilization_partners() from public, anon, authenticated;
revoke all on function public.set_survey_thank_you_video_admin(uuid,text) from public, anon, authenticated;
revoke all on function public.observer_summary() from public, anon, authenticated;
revoke all on function public.store_interview_contact(uuid,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.grant_vault_access(uuid,boolean) from public, anon, authenticated;
revoke all on function public.setup_own_vault_key(text) from public, anon, authenticated;
revoke all on function public.unlock_contact_vault(text) from public, anon, authenticated;
revoke all on function public.list_vault_audit() from public, anon, authenticated;

grant execute on function public.create_candidate_observer_invite(text) to authenticated, service_role;
grant execute on function public.redeem_access_invite(text) to authenticated, service_role;
grant execute on function public.create_mobilization_partner(text,text,text,text,text,text,uuid) to authenticated, service_role;
grant execute on function public.list_mobilization_partners() to authenticated, service_role;
grant execute on function public.set_survey_thank_you_video_admin(uuid,text) to authenticated, service_role;
grant execute on function public.observer_summary() to authenticated, service_role;
grant execute on function public.store_interview_contact(uuid,text,text,text,text,boolean) to authenticated, service_role;
grant execute on function public.grant_vault_access(uuid,boolean) to authenticated, service_role;
grant execute on function public.setup_own_vault_key(text) to authenticated, service_role;
grant execute on function public.unlock_contact_vault(text) to authenticated, service_role;
grant execute on function public.list_vault_audit() to authenticated, service_role;

commit;
