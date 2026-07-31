-- NorteP Pesquisa · estrutura inicial segura para o piloto
-- Execute no SQL Editor do projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  role text not null default 'pesquisador' check (role in ('admin', 'coordenador', 'pesquisador')),
  active boolean not null default false,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'pilot', 'active', 'closed')),
  estimated_minutes integer not null default 10,
  consent_version text not null default '2026-07-22-v1',
  consent_text text not null,
  thank_you_video_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  code text not null,
  section text not null,
  sort_order integer not null,
  type text not null check (type in ('short_text', 'long_text', 'yes_no', 'single', 'multiple', 'scale', 'region', 'internal_note')),
  prompt text not null,
  help_text text,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  condition jsonb,
  created_at timestamptz not null default now(),
  unique (survey_id, code),
  unique (survey_id, sort_order)
);

create table if not exists public.survey_assignments (
  survey_id uuid not null references public.surveys(id) on delete cascade,
  researcher_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (survey_id, researcher_id)
);

create sequence if not exists public.interview_code_seq start 1;

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id),
  researcher_id uuid not null default auth.uid() references public.profiles(id),
  code text not null unique default (
    'ENT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.interview_code_seq')::text, 6, '0')
  ),
  status text not null default 'completed' check (status in ('draft', 'completed', 'cancelled')),
  responses jsonb not null default '{}'::jsonb,
  respondent_name text,
  contact_choice text,
  contact_whatsapp text,
  contact_email text,
  contact_consent boolean not null default false,
  geo_consent boolean not null default false,
  latitude numeric(8,3),
  longitude numeric(9,3),
  device_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  question_code text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  unique (interview_id, question_code)
);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  researcher_id uuid not null default auth.uid() references public.profiles(id),
  consent_version text not null,
  research_consent boolean not null,
  geo_consent boolean not null default false,
  contact_consent boolean not null default false,
  captured_at timestamptz not null default now(),
  unique (interview_id)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists surveys_status_idx on public.surveys (status);
create index if not exists interviews_survey_idx on public.interviews (survey_id);
create index if not exists interviews_researcher_idx on public.interviews (researcher_id);
create index if not exists interviews_completed_idx on public.interviews (completed_at desc);
create index if not exists audit_created_idx on public.audit_events (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists surveys_set_updated_at on public.surveys;
create trigger surveys_set_updated_at before update on public.surveys
for each row execute function public.set_updated_at();
drop trigger if exists interviews_set_updated_at on public.interviews;
create trigger interviews_set_updated_at before update on public.interviews
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_initial_admin boolean := lower(coalesce(new.email, '')) = 'bussolanortep@gmail.com';
begin
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    case when is_initial_admin then 'admin' else 'pesquisador' end,
    is_initial_admin
  )
  on conflict (id) do nothing;
  if is_initial_admin then
    insert into public.survey_assignments (survey_id, researcher_id)
    select id, new.id from public.surveys where status in ('pilot', 'active')
    on conflict (survey_id, researcher_id) do update set active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'coordenador') and active
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_active_user() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

alter table public.profiles enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_assignments enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_answers enable row level security;
alter table public.consent_records enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists surveys_read_assigned on public.surveys;
create policy surveys_read_assigned on public.surveys for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.survey_assignments a
    where a.survey_id = id and a.researcher_id = auth.uid() and a.active
  )
);
drop policy if exists surveys_admin_all on public.surveys;
create policy surveys_admin_all on public.surveys for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists questions_read_visible_survey on public.survey_questions;
create policy questions_read_visible_survey on public.survey_questions for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.survey_assignments a
  where a.survey_id = survey_id and a.researcher_id = auth.uid() and a.active
));
drop policy if exists questions_admin_all on public.survey_questions;
create policy questions_admin_all on public.survey_questions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists assignments_read_own_or_admin on public.survey_assignments;
create policy assignments_read_own_or_admin on public.survey_assignments for select to authenticated
using (researcher_id = auth.uid() or public.is_admin());
drop policy if exists assignments_admin_all on public.survey_assignments;
create policy assignments_admin_all on public.survey_assignments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists interviews_read_own_or_admin on public.interviews;
create policy interviews_read_own_or_admin on public.interviews for select to authenticated
using (researcher_id = auth.uid() or public.is_admin());
drop policy if exists interviews_insert_own on public.interviews;
create policy interviews_insert_own on public.interviews for insert to authenticated
with check (
  researcher_id = auth.uid() and public.is_active_user() and (
    public.is_admin() or exists (
      select 1 from public.survey_assignments a
      where a.survey_id = survey_id and a.researcher_id = auth.uid() and a.active
    )
  )
);
drop policy if exists interviews_update_own_or_admin on public.interviews;
create policy interviews_update_own_or_admin on public.interviews for update to authenticated
using (researcher_id = auth.uid() or public.is_admin())
with check (researcher_id = auth.uid() or public.is_admin());

drop policy if exists answers_read_own_or_admin on public.interview_answers;
create policy answers_read_own_or_admin on public.interview_answers for select to authenticated
using (exists (select 1 from public.interviews i where i.id = interview_id and (i.researcher_id = auth.uid() or public.is_admin())));
drop policy if exists answers_write_own on public.interview_answers;
create policy answers_write_own on public.interview_answers for insert to authenticated
with check (exists (select 1 from public.interviews i where i.id = interview_id and i.researcher_id = auth.uid()));

drop policy if exists consents_read_own_or_admin on public.consent_records;
create policy consents_read_own_or_admin on public.consent_records for select to authenticated
using (researcher_id = auth.uid() or public.is_admin());
drop policy if exists consents_insert_own on public.consent_records;
create policy consents_insert_own on public.consent_records for insert to authenticated
with check (researcher_id = auth.uid() and exists (select 1 from public.interviews i where i.id = interview_id and i.researcher_id = auth.uid()));

drop policy if exists audit_admin_read on public.audit_events;
create policy audit_admin_read on public.audit_events for select to authenticated
using (public.is_admin());
drop policy if exists audit_insert_own on public.audit_events;
create policy audit_insert_own on public.audit_events for insert to authenticated
with check (actor_id = auth.uid());

grant usage on schema public to authenticated;
grant select on public.profiles, public.surveys, public.survey_questions, public.survey_assignments, public.interviews, public.interview_answers, public.consent_records, public.audit_events to authenticated;
grant insert, update on public.interviews to authenticated;
grant insert on public.interview_answers, public.consent_records, public.audit_events to authenticated;
grant update on public.profiles to authenticated;
grant all on public.surveys, public.survey_questions, public.survey_assignments to authenticated;
grant usage, select on sequence public.interview_code_seq to authenticated;

insert into public.surveys (slug, title, description, status, estimated_minutes, consent_version, consent_text)
values (
  'betim-territorio-escolhas-2026',
  'Betim: território e escolhas 2026',
  'Diagnóstico territorial, serviços públicos, lideranças e intenção de voto nas seis escolhas de 2026.',
  'pilot',
  12,
  '2026-07-22-v1',
  'A participação é voluntária. Opiniões políticas são dados sensíveis e serão analisadas de forma agrupada. Nome e contato não são necessários para responder.'
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  estimated_minutes = excluded.estimated_minutes,
  consent_version = excluded.consent_version,
  consent_text = excluded.consent_text;

create or replace function public.assign_pilot_surveys_on_activation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.active and (old.active is distinct from new.active) then
    insert into public.survey_assignments (survey_id, researcher_id, assigned_by)
    select id, new.id, auth.uid() from public.surveys where status in ('pilot', 'active')
    on conflict (survey_id, researcher_id) do update set active = true;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_on_activation on public.profiles;
create trigger profiles_assign_on_activation
after update of active on public.profiles
for each row execute function public.assign_pilot_surveys_on_activation();
