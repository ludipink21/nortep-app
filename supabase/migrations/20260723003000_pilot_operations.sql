-- NorteP Pesquisa · operação completa do piloto
-- Pesquisas editáveis, liberações territoriais, ocorrências de campo,
-- dados de teste, alertas de qualidade e exclusão segura.

create or replace function public.is_full_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and active
      and access_removed_at is null
  );
$$;

revoke all on function public.is_full_admin() from public;
grant execute on function public.is_full_admin() to authenticated;

alter table public.surveys
  add column if not exists survey_type text not null default 'quantitative',
  add column if not exists target_cities text[] not null default '{}'::text[],
  add column if not exists target_regions text[] not null default '{}'::text[],
  add column if not exists target_neighborhoods text[] not null default '{}'::text[],
  add column if not exists is_test boolean not null default false,
  add column if not exists archived_at timestamptz;

alter table public.surveys drop constraint if exists surveys_survey_type_check;
alter table public.surveys add constraint surveys_survey_type_check
check (survey_type in ('quantitative', 'qualitative', 'directional', 'electoral', 'data_collection'));

alter table public.survey_questions drop constraint if exists survey_questions_type_check;
alter table public.survey_questions add constraint survey_questions_type_check
check (type in ('short_text', 'long_text', 'yes_no', 'single', 'multiple', 'scale', 'rating', 'region', 'internal_note'));

alter table public.survey_assignments
  add column if not exists team_name text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists neighborhood text;

alter table public.interviews
  add column if not exists duration_seconds integer,
  add column if not exists quality_flags jsonb not null default '[]'::jsonb,
  add column if not exists is_test boolean not null default false;

create table if not exists public.field_events (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  researcher_id uuid not null default auth.uid() references public.profiles(id),
  outcome text not null check (outcome in ('refused', 'ineligible', 'interrupted', 'no_answer')),
  reason text,
  city text,
  region text,
  neighborhood text,
  geo_consent boolean not null default false,
  latitude numeric(8,3),
  longitude numeric(9,3),
  device_id text,
  is_test boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists field_events_survey_idx on public.field_events (survey_id, occurred_at desc);
create index if not exists field_events_researcher_idx on public.field_events (researcher_id, occurred_at desc);
create index if not exists interviews_quality_idx on public.interviews using gin (quality_flags);
create index if not exists interviews_test_idx on public.interviews (survey_id, is_test);

alter table public.field_events enable row level security;

drop policy if exists field_events_read_own_or_admin on public.field_events;
create policy field_events_read_own_or_admin on public.field_events for select to authenticated
using (researcher_id = auth.uid() or public.is_admin());

drop policy if exists field_events_insert_own on public.field_events;
create policy field_events_insert_own on public.field_events for insert to authenticated
with check (
  researcher_id = auth.uid()
  and public.is_active_user()
  and exists (
    select 1 from public.survey_assignments a
    where a.survey_id = survey_id and a.researcher_id = auth.uid() and a.active
  )
);

grant select, insert on public.field_events to authenticated;

-- Coordenadores podem visualizar e organizar a coleta, mas somente
-- administradores podem criar, alterar ou excluir uma pesquisa.
drop policy if exists surveys_admin_all on public.surveys;
drop policy if exists surveys_admin_mutate on public.surveys;
create policy surveys_admin_mutate on public.surveys for all to authenticated
using (public.is_full_admin()) with check (public.is_full_admin());

drop policy if exists questions_admin_all on public.survey_questions;
drop policy if exists questions_admin_mutate on public.survey_questions;
create policy questions_admin_mutate on public.survey_questions for all to authenticated
using (public.is_full_admin()) with check (public.is_full_admin());

create or replace function public.set_interview_quality()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_minutes integer := 10;
  v_test boolean := false;
  v_flags jsonb := '[]'::jsonb;
begin
  select estimated_minutes, is_test into v_minutes, v_test
  from public.surveys where id = new.survey_id;

  new.is_test := coalesce(v_test, false);
  if new.status = 'completed' then
    if new.duration_seconds is not null
       and new.duration_seconds < greatest(60, coalesce(v_minutes, 10) * 18) then
      v_flags := v_flags || jsonb_build_array('muito_rapida');
    end if;
    if exists (
      select 1 from public.interviews i
      where i.id is distinct from new.id
        and i.survey_id = new.survey_id
        and i.researcher_id = new.researcher_id
        and i.status = 'completed'
        and i.responses = new.responses
        and i.created_at > now() - interval '24 hours'
    ) then
      v_flags := v_flags || jsonb_build_array('possivel_repetida');
    end if;
  end if;
  new.quality_flags := v_flags;
  return new;
end;
$$;

drop trigger if exists interviews_set_quality on public.interviews;
create trigger interviews_set_quality
before insert or update of status, responses, duration_seconds on public.interviews
for each row execute function public.set_interview_quality();

create or replace function public.set_field_event_test_mode()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select is_test into new.is_test from public.surveys where id = new.survey_id;
  return new;
end;
$$;

drop trigger if exists field_events_set_test_mode on public.field_events;
create trigger field_events_set_test_mode before insert on public.field_events
for each row execute function public.set_field_event_test_mode();

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
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_slug text;
  v_question jsonb;
  v_order integer := 0;
begin
  if not public.is_full_admin() then
    raise exception 'Somente administradores podem editar pesquisas.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 4 then
    raise exception 'Informe um título para a pesquisa.';
  end if;
  if p_status not in ('draft', 'pilot', 'active', 'closed') then
    raise exception 'Situação da pesquisa inválida.';
  end if;
  if p_survey_type not in ('quantitative', 'qualitative', 'directional', 'electoral', 'data_collection') then
    raise exception 'Tipo de pesquisa inválido.';
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
      coalesce(p_target_regions, '{}'::text[]), coalesce(p_target_neighborhoods, '{}'::text[]), auth.uid()
    ) returning id into v_id;
  else
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
    where id = p_id
    returning id into v_id;
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
  values (auth.uid(), case when p_id is null then 'survey_created' else 'survey_updated' end,
          'survey', v_id::text, jsonb_build_object('title', trim(p_title), 'question_count', v_order, 'is_test', p_is_test));
  return v_id;
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
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  if not exists (select 1 from public.surveys where id = p_survey_id and archived_at is null) then
    raise exception 'Pesquisa não encontrada ou arquivada.';
  end if;

  update public.survey_assignments set active = false where survey_id = p_survey_id;
  insert into public.survey_assignments (
    survey_id, researcher_id, active, assigned_by, team_name, city, region, neighborhood
  )
  select p_survey_id, p.id, true, auth.uid(), nullif(trim(coalesce(p_team_name, '')), ''),
         nullif(trim(coalesce(p_city, '')), ''), nullif(trim(coalesce(p_region, '')), ''),
         nullif(trim(coalesce(p_neighborhood, '')), '')
  from public.profiles p
  where p.id = any(coalesce(p_researcher_ids, '{}'::uuid[]))
    and p.role = 'pesquisador' and p.active and p.access_removed_at is null
  on conflict (survey_id, researcher_id) do update set
    active = true, assigned_by = auth.uid(), team_name = excluded.team_name,
    city = excluded.city, region = excluded.region, neighborhood = excluded.neighborhood;

  get diagnostics v_count = row_count;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'survey_assignments_updated', 'survey', p_survey_id::text,
          jsonb_build_object('researcher_count', v_count, 'team', p_team_name, 'city', p_city, 'region', p_region, 'neighborhood', p_neighborhood));
  return v_count;
end;
$$;

create or replace function public.delete_or_archive_survey_admin(p_survey_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_title text;
  v_interviews integer;
  v_events integer;
begin
  if not public.is_full_admin() then
    raise exception 'Somente administradores podem apagar pesquisas.';
  end if;
  select title into v_title from public.surveys where id = p_survey_id for update;
  if v_title is null then raise exception 'Pesquisa não encontrada.'; end if;
  select count(*) into v_interviews from public.interviews where survey_id = p_survey_id;
  select count(*) into v_events from public.field_events where survey_id = p_survey_id;

  if v_interviews = 0 and v_events = 0 then
    insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
    values (auth.uid(), 'survey_deleted', 'survey', p_survey_id::text, jsonb_build_object('title', v_title));
    delete from public.surveys where id = p_survey_id;
    return jsonb_build_object('action', 'deleted', 'title', v_title);
  end if;

  update public.surveys set status = 'closed', archived_at = now(), updated_at = now()
  where id = p_survey_id;
  update public.survey_assignments set active = false where survey_id = p_survey_id;
  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'survey_archived', 'survey', p_survey_id::text,
          jsonb_build_object('title', v_title, 'interviews', v_interviews, 'field_events', v_events));
  return jsonb_build_object('action', 'archived', 'title', v_title, 'interviews', v_interviews, 'field_events', v_events);
end;
$$;

create or replace function public.clear_test_data_admin(p_survey_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_interviews integer;
  v_events integer;
begin
  if not public.is_full_admin() then
    raise exception 'Somente administradores podem limpar dados de teste.';
  end if;
  if not exists (select 1 from public.surveys where id = p_survey_id and is_test) then
    raise exception 'Esta pesquisa não está identificada como teste.';
  end if;

  select count(*) into v_interviews from public.interviews where survey_id = p_survey_id and is_test;
  select count(*) into v_events from public.field_events where survey_id = p_survey_id and is_test;
  delete from public.interviews where survey_id = p_survey_id and is_test;
  delete from public.field_events where survey_id = p_survey_id and is_test;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'test_data_cleared', 'survey', p_survey_id::text,
          jsonb_build_object('interviews_removed', v_interviews, 'field_events_removed', v_events));
  return jsonb_build_object('interviews_removed', v_interviews, 'field_events_removed', v_events);
end;
$$;

revoke all on function public.upsert_survey_admin(uuid, text, text, text, text, integer, text, boolean, text[], text[], text[], jsonb) from public;
revoke all on function public.set_survey_assignments_admin(uuid, uuid[], text, text, text, text) from public;
revoke all on function public.delete_or_archive_survey_admin(uuid) from public;
revoke all on function public.clear_test_data_admin(uuid) from public;
grant execute on function public.upsert_survey_admin(uuid, text, text, text, text, integer, text, boolean, text[], text[], text[], jsonb) to authenticated;
grant execute on function public.set_survey_assignments_admin(uuid, uuid[], text, text, text, text) to authenticated;
grant execute on function public.delete_or_archive_survey_admin(uuid) to authenticated;
grant execute on function public.clear_test_data_admin(uuid) to authenticated;

-- A pesquisa atual entra em modo de teste. Apenas novas respostas recebem
-- essa marca; o histórico anterior permanece protegido.
update public.surveys
set survey_type = 'electoral', is_test = true,
    target_cities = array['Betim'], updated_at = now()
where slug = 'betim-territorio-escolhas-2026';
