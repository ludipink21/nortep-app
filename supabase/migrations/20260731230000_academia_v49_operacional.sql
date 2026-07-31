-- Academia NorteP V49 operacional
-- Conteúdo editorial versionado, prática supervisionada, certificação anual e recertificação.
-- Migração aditiva: preserva usuários, pesquisas, entrevistas, respostas e progresso existentes.

begin;

alter table public.academy_certificates
  add column if not exists expires_at timestamptz,
  add column if not exists renewal_requested_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.academy_certificates
set expires_at = issued_at + interval '1 year'
where expires_at is null;

alter table public.academy_certificates
  alter column expires_at set default (now() + interval '1 year'),
  alter column expires_at set not null;

create table if not exists public.academy_practice_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  curriculum_version text not null,
  role_key text not null,
  response_text text not null,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  reviewer_feedback text not null default '',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (profile_id, curriculum_version, role_key),
  constraint academy_practice_role_check check (role_key in ('pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor')),
  constraint academy_practice_response_size check (char_length(response_text) between 20 and 12000),
  constraint academy_practice_feedback_size check (char_length(reviewer_feedback) <= 4000)
);

create table if not exists public.academy_content_revisions (
  id uuid primary key default gen_random_uuid(),
  curriculum_version text not null,
  role_key text not null,
  module_id text not null,
  lesson_id text not null,
  revision integer not null,
  status text not null default 'draft' check (status in ('draft','review','approved','published','archived')),
  content jsonb not null,
  correct_answer smallint check (correct_answer between 0 and 9),
  created_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  published_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  unique (curriculum_version, lesson_id, revision),
  constraint academy_content_role_check check (role_key in ('comum','pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor')),
  constraint academy_content_shape_check check (jsonb_typeof(content) = 'object')
);

create table if not exists public.academy_track_assignments (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  role_key text not null check (role_key in ('pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor')),
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create unique index if not exists academy_content_one_published_idx
  on public.academy_content_revisions (curriculum_version, lesson_id)
  where status = 'published';
create index if not exists academy_practice_queue_idx
  on public.academy_practice_submissions (status, submitted_at);
create index if not exists academy_content_workflow_idx
  on public.academy_content_revisions (curriculum_version, status, updated_at desc);

alter table public.academy_practice_submissions enable row level security;
alter table public.academy_content_revisions enable row level security;
alter table public.academy_track_assignments enable row level security;

revoke all on table public.academy_practice_submissions from public, anon, authenticated;
revoke all on table public.academy_content_revisions from public, anon, authenticated;
revoke all on table public.academy_track_assignments from public, anon, authenticated;
grant all on table public.academy_practice_submissions, public.academy_content_revisions, public.academy_track_assignments to service_role;

create or replace function public.academy_current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p from public.profiles p
  where p.id = auth.uid() and p.active and p.access_removed_at is null
  limit 1;
$$;

create or replace function public.academy_track_for_profile(p_profile_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(a.role_key, public.academy_role_for_profile(p))
  from public.profiles p
  left join public.academy_track_assignments a on a.profile_id = p.id
  where p.id = p_profile_id and p.active and p.access_removed_at is null;
$$;

create or replace function public.get_own_academy_track()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare v_profile public.profiles;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then raise exception 'Perfil ativo não encontrado.'; end if;
  return public.academy_track_for_profile(v_profile.id);
end;
$$;

create or replace function public.list_academy_track_assignments()
returns table (profile_id uuid, profile_name text, operational_role text, academy_role text)
language plpgsql stable security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_role_for_profile(v_profile);
  if v_profile.id is null or v_role not in ('coordenador','administrador','fundadora') then raise exception 'Perfil sem permissão para organizar trilhas.'; end if;
  return query select p.id, p.name, public.academy_role_for_profile(p), public.academy_track_for_profile(p.id)
  from public.profiles p where p.active and p.access_removed_at is null and public.manager_can_access_profile(p.id)
  order by p.name;
end;
$$;

create or replace function public.set_academy_track_assignment(p_profile_id uuid, p_role_key text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_role_for_profile(v_profile);
  if v_profile.id is null or v_role not in ('coordenador','administrador','fundadora') then raise exception 'Perfil sem permissão para organizar trilhas.'; end if;
  if not public.manager_can_access_profile(p_profile_id) then raise exception 'Perfil fora do seu escopo.'; end if;
  if p_role_key not in ('pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor') then raise exception 'Trilha inválida.'; end if;
  insert into public.academy_track_assignments(profile_id,role_key,assigned_by)
  values(p_profile_id,p_role_key,v_profile.id)
  on conflict(profile_id) do update set role_key=excluded.role_key, assigned_by=excluded.assigned_by, updated_at=now();
  return true;
end;
$$;

create or replace function public.maybe_issue_academy_certificate(
  p_profile_id uuid,
  p_curriculum_version text,
  p_role_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required integer;
  v_completed integer;
  v_practice public.academy_practice_submissions;
  v_certificate public.academy_certificates;
begin
  select count(*) into v_required
  from public.academy_lessons l
  where l.curriculum_version = p_curriculum_version
    and l.role_key in ('comum', p_role_key);

  select count(*) into v_completed
  from public.academy_lesson_progress p
  where p.profile_id = p_profile_id
    and p.curriculum_version = p_curriculum_version
    and p.completed_at is not null
    and p.answer_correct;

  select * into v_practice
  from public.academy_practice_submissions p
  where p.profile_id = p_profile_id
    and p.curriculum_version = p_curriculum_version
    and p.role_key = p_role_key
    and p.status = 'approved';

  if v_required = 0 or v_completed <> v_required or v_practice.id is null then
    return false;
  end if;

  select * into v_certificate
  from public.academy_certificates c
  where c.profile_id = p_profile_id
    and c.curriculum_version = p_curriculum_version
    and c.role_key = p_role_key;

  if v_certificate.id is null then
    insert into public.academy_certificates (profile_id, curriculum_version, role_key, issued_at, expires_at, status)
    values (p_profile_id, p_curriculum_version, p_role_key, now(), now() + interval '1 year', 'active');
    return true;
  end if;

  if v_certificate.renewal_requested_at is not null
     and v_practice.reviewed_at >= v_certificate.renewal_requested_at then
    update public.academy_certificates
    set issued_at = now(), expires_at = now() + interval '1 year', status = 'active',
        renewal_requested_at = null, updated_at = now()
    where id = v_certificate.id;
    return true;
  end if;

  return false;
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
  v_certificate boolean := false;
  v_row public.academy_lesson_progress;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then raise exception 'Perfil ativo não encontrado.'; end if;
  v_role := public.academy_track_for_profile(v_profile.id);

  select l.role_key, l.correct_answer into v_lesson_role, v_correct_answer
  from public.academy_lessons l
  where l.curriculum_version = p_curriculum_version
    and l.lesson_id = p_lesson_id
    and l.role_key in ('comum', v_role)
  limit 1;

  if v_lesson_role is null then raise exception 'Aula não autorizada para este perfil.'; end if;
  if p_answer_index is not null and (p_answer_index < 0 or p_answer_index > 9) then raise exception 'Resposta de avaliação inválida.'; end if;
  if char_length(coalesce(p_draft_text, '')) > 12000 then raise exception 'O exercício ultrapassou o limite permitido.'; end if;

  v_correct := p_answer_index is not null and p_answer_index = v_correct_answer;
  v_complete := coalesce(p_completed, false) and v_correct and char_length(trim(coalesce(p_draft_text, ''))) >= 3;

  insert into public.academy_lesson_progress (
    profile_id, curriculum_version, role_key, lesson_id, answer_index, answer_correct, draft_text, completed_at, updated_at
  ) values (
    v_profile.id, p_curriculum_version, v_lesson_role, p_lesson_id, p_answer_index, v_correct,
    coalesce(p_draft_text, ''), case when v_complete then now() else null end, now()
  )
  on conflict (profile_id, curriculum_version, role_key, lesson_id)
  do update set answer_index = excluded.answer_index, answer_correct = excluded.answer_correct,
    draft_text = excluded.draft_text,
    completed_at = case when public.academy_lesson_progress.completed_at is not null then public.academy_lesson_progress.completed_at when v_complete then now() else null end,
    updated_at = now()
  returning * into v_row;

  v_certificate := public.maybe_issue_academy_certificate(v_profile.id, p_curriculum_version, v_role);

  return query select v_row.lesson_id, v_row.role_key, v_row.answer_index::integer,
    v_row.answer_correct, v_row.draft_text, v_row.completed_at, v_row.updated_at, v_certificate;
end;
$$;

create or replace function public.get_own_academy_practice(p_curriculum_version text)
returns table (id uuid, role_key text, response_text text, status text, reviewer_feedback text, submitted_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select p.id, p.role_key, p.response_text, p.status, p.reviewer_feedback, p.submitted_at, p.reviewed_at
  from public.academy_practice_submissions p
  where p.profile_id = auth.uid() and p.curriculum_version = p_curriculum_version
  limit 1;
$$;

create or replace function public.submit_academy_practice(p_curriculum_version text, p_response_text text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text; v_id uuid;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then raise exception 'Perfil ativo não encontrado.'; end if;
  if char_length(trim(coalesce(p_response_text, ''))) < 20 then raise exception 'Descreva a prática com pelo menos 20 caracteres.'; end if;
  if char_length(p_response_text) > 12000 then raise exception 'Relato de prática muito longo.'; end if;
  v_role := public.academy_track_for_profile(v_profile.id);
  insert into public.academy_practice_submissions (profile_id, curriculum_version, role_key, response_text)
  values (v_profile.id, p_curriculum_version, v_role, trim(p_response_text))
  on conflict (profile_id, curriculum_version, role_key)
  do update set response_text = excluded.response_text, status = 'pending', reviewer_feedback = '',
    submitted_at = now(), reviewed_at = null, reviewed_by = null, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_academy_practice_queue(p_curriculum_version text)
returns table (id uuid, profile_name text, role_key text, response_text text, status text, reviewer_feedback text, submitted_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_track_for_profile(v_profile.id);
  if v_profile.id is null or (v_role not in ('instrutor','supervisor','coordenador','administrador','fundadora')) then
    raise exception 'Perfil sem permissão para revisar práticas.';
  end if;
  return query
  select p.id, learner.name, p.role_key, p.response_text, p.status, p.reviewer_feedback, p.submitted_at, p.reviewed_at
  from public.academy_practice_submissions p
  join public.profiles learner on learner.id = p.profile_id
  where p.curriculum_version = p_curriculum_version
    and public.manager_can_access_profile(p.profile_id)
  order by case p.status when 'pending' then 0 when 'changes_requested' then 1 else 2 end, p.submitted_at;
end;
$$;

create or replace function public.review_academy_practice(p_submission_id uuid, p_decision text, p_feedback text default '')
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text; v_submission public.academy_practice_submissions; v_issued boolean;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_track_for_profile(v_profile.id);
  if v_profile.id is null or v_role not in ('instrutor','supervisor','coordenador','administrador','fundadora') then raise exception 'Perfil sem permissão para revisar práticas.'; end if;
  if p_decision not in ('approved','changes_requested') then raise exception 'Decisão inválida.'; end if;
  select * into v_submission from public.academy_practice_submissions where id = p_submission_id;
  if v_submission.id is null or not public.manager_can_access_profile(v_submission.profile_id) then raise exception 'Prática fora do seu escopo.'; end if;
  update public.academy_practice_submissions set status = p_decision, reviewer_feedback = left(coalesce(p_feedback,''), 4000),
    reviewed_at = now(), reviewed_by = v_profile.id, updated_at = now() where id = p_submission_id;
  v_issued := false;
  if p_decision = 'approved' then
    v_issued := public.maybe_issue_academy_certificate(v_submission.profile_id, v_submission.curriculum_version, v_submission.role_key);
  end if;
  return v_issued;
end;
$$;

create or replace function public.request_academy_recertification(p_curriculum_version text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_certificate public.academy_certificates;
begin
  select * into v_certificate from public.academy_certificates c
  where c.profile_id = auth.uid() and c.curriculum_version = p_curriculum_version and c.status = 'active';
  if v_certificate.id is null then raise exception 'Certificado ativo não encontrado.'; end if;
  if v_certificate.expires_at > now() + interval '60 days' then raise exception 'A recertificação abre 60 dias antes do vencimento.'; end if;
  update public.academy_certificates set renewal_requested_at = now(), updated_at = now() where id = v_certificate.id;
  update public.academy_practice_submissions set status = 'changes_requested', reviewer_feedback = 'Envie uma prática atualizada para a recertificação.', updated_at = now()
  where profile_id = auth.uid() and curriculum_version = p_curriculum_version and role_key = v_certificate.role_key;
  return true;
end;
$$;

drop function if exists public.get_own_academy_certificate(text);
create function public.get_own_academy_certificate(p_curriculum_version text)
returns table (id uuid, role_key text, issued_at timestamptz, expires_at timestamptz, status text, renewal_requested_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select c.id, c.role_key, c.issued_at, c.expires_at,
    case when c.status = 'active' and c.expires_at < now() then 'expired' else c.status end,
    c.renewal_requested_at
  from public.academy_certificates c
  where c.profile_id = auth.uid() and c.curriculum_version = p_curriculum_version
  limit 1;
$$;

create or replace function public.get_published_academy_content(p_curriculum_version text)
returns table (lesson_id text, role_key text, module_id text, content jsonb, published_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare v_profile public.profiles;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then raise exception 'Perfil ativo não encontrado.'; end if;
  return query select r.lesson_id, r.role_key, r.module_id, r.content, r.published_at
  from public.academy_content_revisions r
  where r.curriculum_version = p_curriculum_version and r.status = 'published';
end;
$$;

create or replace function public.list_academy_content_workflow(p_curriculum_version text)
returns table (id uuid, lesson_id text, role_key text, module_id text, revision integer, status text, content jsonb, author_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_track_for_profile(v_profile.id);
  if v_profile.id is null or v_role not in ('instrutor','coordenador','administrador','fundadora') then raise exception 'Perfil sem acesso ao editor.'; end if;
  return query select r.id, r.lesson_id, r.role_key, r.module_id, r.revision, r.status, r.content, author.name, r.updated_at
  from public.academy_content_revisions r join public.profiles author on author.id = r.created_by
  where r.curriculum_version = p_curriculum_version and r.status <> 'archived'
  order by r.updated_at desc;
end;
$$;

create or replace function public.save_academy_content_draft(
  p_curriculum_version text, p_role_key text, p_module_id text, p_lesson_id text,
  p_content jsonb, p_correct_answer integer default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text; v_revision integer; v_id uuid;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_track_for_profile(v_profile.id);
  if v_profile.id is null or v_role not in ('instrutor','coordenador','administrador','fundadora') then raise exception 'Perfil sem acesso ao editor.'; end if;
  if p_role_key not in ('comum','pesquisador','mobilizador','supervisor','coordenador','administrador','analista','observador','fundadora','instrutor') then raise exception 'Trilha inválida.'; end if;
  if jsonb_typeof(p_content) <> 'object' or length(coalesce(p_content->>'title','')) < 3 then raise exception 'Conteúdo da aula inválido.'; end if;
  if p_correct_answer is not null and (p_correct_answer < 0 or p_correct_answer > 9) then raise exception 'Gabarito inválido.'; end if;
  select coalesce(max(r.revision), 0) + 1 into v_revision from public.academy_content_revisions r
  where r.curriculum_version = p_curriculum_version and r.lesson_id = p_lesson_id;
  insert into public.academy_content_revisions (curriculum_version, role_key, module_id, lesson_id, revision, content, correct_answer, created_by)
  values (p_curriculum_version, p_role_key, p_module_id, p_lesson_id, v_revision, (p_content - 'answer') #- '{quiz,answer}', p_correct_answer, v_profile.id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.transition_academy_content(p_revision_id uuid, p_target_status text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text; v_item public.academy_content_revisions;
begin
  v_profile := public.academy_current_profile(); v_role := public.academy_track_for_profile(v_profile.id);
  select * into v_item from public.academy_content_revisions where id = p_revision_id;
  if v_profile.id is null or v_item.id is null then raise exception 'Revisão não encontrada.'; end if;

  if p_target_status = 'review' and v_item.status = 'draft' and v_role in ('instrutor','coordenador','administrador','fundadora') then
    update public.academy_content_revisions set status='review', reviewed_by=v_profile.id, reviewed_at=now(), updated_at=now() where id=p_revision_id;
  elsif p_target_status = 'approved' and v_item.status = 'review' and v_role in ('coordenador','administrador','fundadora') then
    update public.academy_content_revisions set status='approved', approved_by=v_profile.id, approved_at=now(), updated_at=now() where id=p_revision_id;
  elsif p_target_status = 'published' and v_item.status = 'approved' and v_role in ('administrador','fundadora') then
    update public.academy_content_revisions set status='archived', updated_at=now()
    where curriculum_version=v_item.curriculum_version and lesson_id=v_item.lesson_id and status='published';
    update public.academy_content_revisions set status='published', published_by=v_profile.id, published_at=now(), updated_at=now() where id=p_revision_id;
    if v_item.correct_answer is not null then
      insert into public.academy_lessons (curriculum_version, role_key, lesson_id, correct_answer)
      values (v_item.curriculum_version, v_item.role_key, v_item.lesson_id, v_item.correct_answer)
      on conflict (curriculum_version, role_key, lesson_id) do update set correct_answer=excluded.correct_answer;
    end if;
  else
    raise exception 'Transição não permitida para este perfil ou estado.';
  end if;
  return true;
end;
$$;

drop function if exists public.get_academy_team_summary(text);
create function public.get_academy_team_summary(p_curriculum_version text)
returns table (role_key text, people bigint, started bigint, completed bigint, average_progress integer, awaiting_practice bigint, certified bigint, recertification_due bigint)
language sql stable security definer set search_path = public
as $$
  with visible as (
    select p.id, public.academy_track_for_profile(p.id) as role_key
    from public.profiles p where p.active and p.access_removed_at is null and public.manager_can_access_profile(p.id)
  ), stats as (
    select v.id, v.role_key, count(l.lesson_id)::integer required_lessons,
      count(progress.lesson_id) filter (where progress.updated_at is not null)::integer started_lessons,
      count(progress.lesson_id) filter (where progress.completed_at is not null and progress.answer_correct)::integer completed_lessons
    from visible v join public.academy_lessons l on l.curriculum_version=p_curriculum_version and l.role_key in ('comum',v.role_key)
    left join public.academy_lesson_progress progress on progress.profile_id=v.id and progress.curriculum_version=p_curriculum_version and progress.lesson_id=l.lesson_id and progress.role_key=l.role_key
    group by v.id,v.role_key
  )
  select s.role_key, count(*)::bigint, count(*) filter(where s.started_lessons>0)::bigint,
    count(*) filter(where s.required_lessons>0 and s.completed_lessons=s.required_lessons)::bigint,
    coalesce(round(avg(case when s.required_lessons>0 then s.completed_lessons*100.0/s.required_lessons else 0 end)),0)::integer,
    count(*) filter(where practice.status='pending')::bigint,
    count(*) filter(where cert.status='active' and cert.expires_at>=now())::bigint,
    count(*) filter(where cert.status='active' and cert.expires_at<now()+interval '60 days')::bigint
  from stats s
  left join public.academy_practice_submissions practice on practice.profile_id=s.id and practice.curriculum_version=p_curriculum_version and practice.role_key=s.role_key
  left join public.academy_certificates cert on cert.profile_id=s.id and cert.curriculum_version=p_curriculum_version and cert.role_key=s.role_key
  group by s.role_key order by s.role_key;
$$;

revoke all on function public.academy_current_profile() from public, anon;
revoke all on function public.academy_track_for_profile(uuid) from public, anon, authenticated;
revoke all on function public.get_own_academy_track() from public, anon;
revoke all on function public.list_academy_track_assignments() from public, anon;
revoke all on function public.set_academy_track_assignment(uuid,text) from public, anon;
revoke all on function public.maybe_issue_academy_certificate(uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_own_academy_practice(text) from public, anon;
revoke all on function public.submit_academy_practice(text,text) from public, anon;
revoke all on function public.list_academy_practice_queue(text) from public, anon;
revoke all on function public.review_academy_practice(uuid,text,text) from public, anon;
revoke all on function public.request_academy_recertification(text) from public, anon;
revoke all on function public.get_published_academy_content(text) from public, anon;
revoke all on function public.list_academy_content_workflow(text) from public, anon;
revoke all on function public.save_academy_content_draft(text,text,text,text,jsonb,integer) from public, anon;
revoke all on function public.transition_academy_content(uuid,text) from public, anon;
revoke all on function public.get_own_academy_certificate(text) from public, anon;
revoke all on function public.get_academy_team_summary(text) from public, anon;

grant execute on function public.academy_current_profile() to authenticated, service_role;
grant execute on function public.get_own_academy_track() to authenticated, service_role;
grant execute on function public.list_academy_track_assignments() to authenticated, service_role;
grant execute on function public.set_academy_track_assignment(uuid,text) to authenticated, service_role;
grant execute on function public.get_own_academy_practice(text) to authenticated, service_role;
grant execute on function public.submit_academy_practice(text,text) to authenticated, service_role;
grant execute on function public.list_academy_practice_queue(text) to authenticated, service_role;
grant execute on function public.review_academy_practice(uuid,text,text) to authenticated, service_role;
grant execute on function public.request_academy_recertification(text) to authenticated, service_role;
grant execute on function public.get_published_academy_content(text) to authenticated, service_role;
grant execute on function public.list_academy_content_workflow(text) to authenticated, service_role;
grant execute on function public.save_academy_content_draft(text,text,text,text,jsonb,integer) to authenticated, service_role;
grant execute on function public.transition_academy_content(uuid,text) to authenticated, service_role;
grant execute on function public.get_own_academy_certificate(text) to authenticated, service_role;
grant execute on function public.get_academy_team_summary(text) to authenticated, service_role;

commit;
