-- Academia NorteP 3.0.0
-- Progresso durável, avaliação validada no servidor e certificação por perfil.
-- Não altera nem apaga usuários, pesquisas, entrevistas ou respostas existentes.

begin;

create table if not exists public.academy_lessons (
  curriculum_version text not null,
  role_key text not null,
  lesson_id text not null,
  correct_answer smallint not null check (correct_answer between 0 and 9),
  created_at timestamptz not null default now(),
  primary key (curriculum_version, role_key, lesson_id),
  constraint academy_lessons_role_check check (role_key in ('comum','pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor'))
);

create table if not exists public.academy_lesson_progress (
  profile_id uuid not null references public.profiles(id) on delete restrict,
  curriculum_version text not null,
  role_key text not null,
  lesson_id text not null,
  answer_index smallint,
  answer_correct boolean not null default false,
  draft_text text not null default '',
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, curriculum_version, role_key, lesson_id),
  constraint academy_progress_role_check check (role_key in ('comum','pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor')),
  constraint academy_progress_draft_size check (char_length(draft_text) <= 12000)
);

create table if not exists public.academy_certificates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  curriculum_version text not null,
  role_key text not null,
  issued_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','revoked')),
  unique (profile_id, curriculum_version, role_key)
);

create index if not exists academy_progress_profile_updated_idx
  on public.academy_lesson_progress (profile_id, updated_at desc);
create index if not exists academy_certificates_profile_idx
  on public.academy_certificates (profile_id, issued_at desc);

insert into public.academy_lessons (curriculum_version, role_key, lesson_id, correct_answer)
values
('3.0.0','comum','comum-01',1),
('3.0.0','comum','comum-02',1),
('3.0.0','comum','comum-03',2),
('3.0.0','comum','comum-04',1),
('3.0.0','comum','comum-05',2),
('3.0.0','comum','comum-06',1),
('3.0.0','comum','estrat-01',1),
('3.0.0','comum','estrat-02',2),
('3.0.0','comum','estrat-03',1),
('3.0.0','comum','estrat-04',1),
('3.0.0','comum','estrat-05',1),
('3.0.0','comum','estrat-06',1),
('3.0.0','comum','escala-01',1),
('3.0.0','comum','escala-02',2),
('3.0.0','comum','escala-03',1),
('3.0.0','comum','escala-04',1),
('3.0.0','comum','escala-05',1),
('3.0.0','comum','escala-06',2),
('3.0.0','comum','escala-07',1),
('3.0.0','comum','escala-08',2),
('3.0.0','comum','escala-09',1),
('3.0.0','pesquisador','pesq-01',1),
('3.0.0','pesquisador','pesq-02',1),
('3.0.0','pesquisador','pesq-03',1),
('3.0.0','pesquisador','pesq-04',1),
('3.0.0','pesquisador','pesq-05',0),
('3.0.0','pesquisador','pesq-06',1),
('3.0.0','pesquisador','pesq-07',2),
('3.0.0','supervisor','sup-01',1),
('3.0.0','supervisor','sup-02',1),
('3.0.0','supervisor','sup-03',1),
('3.0.0','supervisor','sup-04',2),
('3.0.0','supervisor','sup-05',1),
('3.0.0','supervisor','sup-06',1),
('3.0.0','mobilizador','mob-01',1),
('3.0.0','mobilizador','mob-02',1),
('3.0.0','mobilizador','mob-03',1),
('3.0.0','mobilizador','mob-04',0),
('3.0.0','coordenador','coord-01',1),
('3.0.0','coordenador','coord-02',1),
('3.0.0','coordenador','coord-03',1),
('3.0.0','coordenador','coord-04',1),
('3.0.0','administrador','adm-01',1),
('3.0.0','administrador','adm-02',1),
('3.0.0','administrador','adm-03',1),
('3.0.0','administrador','adm-04',1),
('3.0.0','analista','ana-01',1),
('3.0.0','analista','ana-02',1),
('3.0.0','analista','ana-03',1),
('3.0.0','analista','ana-04',0),
('3.0.0','observador','obs-01',1),
('3.0.0','observador','obs-02',1),
('3.0.0','fundadora','fund-01',1),
('3.0.0','fundadora','fund-02',1),
('3.0.0','fundadora','fund-03',1),
('3.0.0','instrutor','inst-01',1),
('3.0.0','instrutor','inst-02',1)
on conflict (curriculum_version, role_key, lesson_id)
do update set correct_answer = excluded.correct_answer;

create or replace function public.academy_role_for_profile(p_profile public.profiles)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_profile.role = 'admin' and p_profile.is_primary_admin then 'fundadora'
    when p_profile.role = 'admin' then 'administrador'
    else p_profile.role
  end;
$$;

create or replace function public.save_academy_lesson_progress(
  p_curriculum_version text,
  p_lesson_id text,
  p_answer_index integer,
  p_draft_text text,
  p_completed boolean default false
)
returns table (
  lesson_id text,
  role_key text,
  answer_index integer,
  answer_correct boolean,
  draft_text text,
  completed_at timestamptz,
  updated_at timestamptz,
  certificate_issued boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_role text;
  v_lesson_role text;
  v_correct_answer integer;
  v_correct boolean;
  v_complete boolean;
  v_required integer;
  v_completed integer;
  v_certificate boolean := false;
  v_row public.academy_lesson_progress;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and active and access_removed_at is null;

  if v_profile.id is null then
    raise exception 'Perfil ativo não encontrado.';
  end if;

  v_role := public.academy_role_for_profile(v_profile);

  select l.role_key, l.correct_answer
  into v_lesson_role, v_correct_answer
  from public.academy_lessons l
  where l.curriculum_version = p_curriculum_version
    and l.lesson_id = p_lesson_id
    and l.role_key in ('comum', v_role)
  limit 1;

  if v_lesson_role is null then
    raise exception 'Aula não autorizada para este perfil.';
  end if;

  if p_answer_index is not null and (p_answer_index < 0 or p_answer_index > 9) then
    raise exception 'Resposta de avaliação inválida.';
  end if;

  if char_length(coalesce(p_draft_text, '')) > 12000 then
    raise exception 'O exercício ultrapassou o limite permitido.';
  end if;

  v_correct := p_answer_index is not null and p_answer_index = v_correct_answer;
  v_complete := coalesce(p_completed, false)
    and v_correct
    and char_length(trim(coalesce(p_draft_text, ''))) >= 3;

  insert into public.academy_lesson_progress (
    profile_id, curriculum_version, role_key, lesson_id,
    answer_index, answer_correct, draft_text, completed_at, updated_at
  ) values (
    v_profile.id, p_curriculum_version, v_lesson_role, p_lesson_id,
    p_answer_index, v_correct, coalesce(p_draft_text, ''),
    case when v_complete then now() else null end, now()
  )
  on conflict (profile_id, curriculum_version, role_key, lesson_id)
  do update set
    answer_index = excluded.answer_index,
    answer_correct = excluded.answer_correct,
    draft_text = excluded.draft_text,
    completed_at = case
      when public.academy_lesson_progress.completed_at is not null then public.academy_lesson_progress.completed_at
      when v_complete then now()
      else null
    end,
    updated_at = now()
  returning * into v_row;

  select count(*) into v_required
  from public.academy_lessons l
  where l.curriculum_version = p_curriculum_version
    and l.role_key in ('comum', v_role);

  select count(*) into v_completed
  from public.academy_lesson_progress p
  where p.profile_id = v_profile.id
    and p.curriculum_version = p_curriculum_version
    and p.completed_at is not null
    and p.answer_correct;

  if v_required > 0 and v_completed = v_required then
    insert into public.academy_certificates (profile_id, curriculum_version, role_key)
    values (v_profile.id, p_curriculum_version, v_role)
    on conflict (profile_id, curriculum_version, role_key) do nothing;
    v_certificate := true;
  end if;

  return query select
    v_row.lesson_id,
    v_row.role_key,
    v_row.answer_index::integer,
    v_row.answer_correct,
    v_row.draft_text,
    v_row.completed_at,
    v_row.updated_at,
    v_certificate;
end;
$$;

create or replace function public.get_own_academy_progress(p_curriculum_version text)
returns table (
  lesson_id text,
  role_key text,
  answer_index integer,
  answer_correct boolean,
  draft_text text,
  completed_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.lesson_id, p.role_key, p.answer_index::integer, p.answer_correct,
         p.draft_text, p.completed_at, p.updated_at
  from public.academy_lesson_progress p
  join public.profiles profile on profile.id = p.profile_id
  where p.profile_id = auth.uid()
    and p.curriculum_version = p_curriculum_version
    and profile.active
    and profile.access_removed_at is null
  order by p.updated_at;
$$;

create or replace function public.get_own_academy_certificate(p_curriculum_version text)
returns table (id uuid, role_key text, issued_at timestamptz, status text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.role_key, c.issued_at, c.status
  from public.academy_certificates c
  where c.profile_id = auth.uid()
    and c.curriculum_version = p_curriculum_version
  limit 1;
$$;

create or replace function public.get_academy_team_summary(p_curriculum_version text)
returns table (
  role_key text,
  people bigint,
  started bigint,
  completed bigint,
  average_progress integer
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select p.id, public.academy_role_for_profile(p) as role_key
    from public.profiles p
    where p.active
      and p.access_removed_at is null
      and public.manager_can_access_profile(p.id)
  ), stats as (
    select v.id, v.role_key,
      count(l.lesson_id)::integer as required_lessons,
      count(progress.lesson_id) filter (where progress.updated_at is not null)::integer as started_lessons,
      count(progress.lesson_id) filter (where progress.completed_at is not null and progress.answer_correct)::integer as completed_lessons
    from visible v
    join public.academy_lessons l
      on l.curriculum_version = p_curriculum_version
     and l.role_key in ('comum', v.role_key)
    left join public.academy_lesson_progress progress
      on progress.profile_id = v.id
     and progress.curriculum_version = p_curriculum_version
     and progress.lesson_id = l.lesson_id
     and progress.role_key = l.role_key
    group by v.id, v.role_key
  )
  select s.role_key,
    count(*)::bigint as people,
    count(*) filter (where s.started_lessons > 0)::bigint as started,
    count(*) filter (where s.required_lessons > 0 and s.completed_lessons = s.required_lessons)::bigint as completed,
    coalesce(round(avg(case when s.required_lessons > 0 then s.completed_lessons * 100.0 / s.required_lessons else 0 end)), 0)::integer as average_progress
  from stats s
  group by s.role_key
  order by s.role_key;
$$;

alter table public.academy_lessons enable row level security;
alter table public.academy_lesson_progress enable row level security;
alter table public.academy_certificates enable row level security;

drop policy if exists academy_progress_read_scoped on public.academy_lesson_progress;
create policy academy_progress_read_scoped
on public.academy_lesson_progress for select to authenticated
using (profile_id = auth.uid() or public.manager_can_access_profile(profile_id));

drop policy if exists academy_certificates_read_scoped on public.academy_certificates;
create policy academy_certificates_read_scoped
on public.academy_certificates for select to authenticated
using (profile_id = auth.uid() or public.manager_can_access_profile(profile_id));

revoke all on table public.academy_lessons from public, anon, authenticated;
revoke all on table public.academy_lesson_progress from public, anon;
revoke all on table public.academy_certificates from public, anon;
grant select on table public.academy_lesson_progress to authenticated, service_role;
grant select on table public.academy_certificates to authenticated, service_role;
grant all on table public.academy_lessons, public.academy_lesson_progress, public.academy_certificates to service_role;

revoke all on function public.academy_role_for_profile(public.profiles) from public, anon;
revoke all on function public.save_academy_lesson_progress(text,text,integer,text,boolean) from public, anon;
revoke all on function public.get_own_academy_progress(text) from public, anon;
revoke all on function public.get_own_academy_certificate(text) from public, anon;
revoke all on function public.get_academy_team_summary(text) from public, anon;
grant execute on function public.academy_role_for_profile(public.profiles) to authenticated, service_role;
grant execute on function public.save_academy_lesson_progress(text,text,integer,text,boolean) to authenticated, service_role;
grant execute on function public.get_own_academy_progress(text) to authenticated, service_role;
grant execute on function public.get_own_academy_certificate(text) to authenticated, service_role;
grant execute on function public.get_academy_team_summary(text) to authenticated, service_role;

commit;
