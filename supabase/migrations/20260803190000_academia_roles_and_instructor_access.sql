-- Academia NorteP: aulas somente para Pesquisa e Supervisao.
-- Instrutoria e editor somente para a administradora fundadora.
-- Migracao aditiva: nao remove perfis, pesquisas, entrevistas, respostas ou progresso.

begin;

create or replace function public.academy_track_for_profile(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p.role
    when 'pesquisador' then 'pesquisador'
    when 'supervisor' then 'supervisor'
    else null
  end
  from public.profiles p
  where p.id = p_profile_id
    and p.active
    and p.access_removed_at is null;
$$;

create or replace function public.get_own_academy_track()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_role text;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then
    raise exception 'Perfil ativo nao encontrado.';
  end if;
  v_role := public.academy_track_for_profile(v_profile.id);
  if v_role not in ('pesquisador', 'supervisor') then
    raise exception 'As aulas sao exclusivas para Pesquisa e Supervisao.';
  end if;
  return v_role;
end;
$$;

create or replace function public.set_academy_track_assignment(p_profile_id uuid, p_role_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'A trilha da Academia segue a funcao operacional: Pesquisa ou Supervisao.';
end;
$$;

create or replace function public.list_academy_track_assignments()
returns table (profile_id uuid, profile_name text, operational_role text, academy_role text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select p.id, p.name, p.role::text, public.academy_track_for_profile(p.id)
  from public.profiles p
  where p.active
    and p.access_removed_at is null
    and p.role in ('pesquisador', 'supervisor')
    and public.manager_can_access_profile(p.id)
  order by p.name;
end;
$$;

create or replace function public.get_published_academy_content(p_curriculum_version text)
returns table (lesson_id text, role_key text, module_id text, content jsonb, published_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_role text;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then
    raise exception 'Perfil ativo nao encontrado.';
  end if;
  v_role := public.academy_track_for_profile(v_profile.id);
  if not v_profile.is_primary_admin and v_role not in ('pesquisador', 'supervisor') then
    raise exception 'Perfil sem acesso ao conteudo da Academia.';
  end if;
  return query
  select r.lesson_id, r.role_key, r.module_id,
    case when v_profile.is_primary_admin then r.content else (r.content - 'instructor' - 'speak') end,
    r.published_at
  from public.academy_content_revisions r
  where r.curriculum_version = p_curriculum_version
    and r.status = 'published'
    and (v_profile.is_primary_admin or r.role_key in ('comum', v_role));
end;
$$;

create or replace function public.list_academy_practice_queue(p_curriculum_version text)
returns table (id uuid, profile_name text, role_key text, response_text text, status text, reviewer_feedback text, submitted_at timestamptz, reviewed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not v_profile.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode revisar praticas.';
  end if;
  return query
  select p.id, learner.name, p.role_key, p.response_text, p.status, p.reviewer_feedback, p.submitted_at, p.reviewed_at
  from public.academy_practice_submissions p
  join public.profiles learner on learner.id = p.profile_id
  where p.curriculum_version = p_curriculum_version
    and p.role_key in ('pesquisador', 'supervisor')
    and public.manager_can_access_profile(p.profile_id)
  order by case p.status when 'pending' then 0 when 'changes_requested' then 1 else 2 end, p.submitted_at;
end;
$$;

create or replace function public.review_academy_practice(p_submission_id uuid, p_decision text, p_feedback text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_submission public.academy_practice_submissions;
  v_issued boolean;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not v_profile.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode revisar praticas.';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'Decisao invalida.';
  end if;
  select * into v_submission
  from public.academy_practice_submissions
  where id = p_submission_id and role_key in ('pesquisador', 'supervisor');
  if v_submission.id is null or not public.manager_can_access_profile(v_submission.profile_id) then
    raise exception 'Pratica fora do seu escopo.';
  end if;
  update public.academy_practice_submissions
  set status = p_decision,
      reviewer_feedback = left(coalesce(p_feedback, ''), 4000),
      reviewed_at = now(),
      reviewed_by = v_profile.id,
      updated_at = now()
  where id = p_submission_id;
  v_issued := false;
  if p_decision = 'approved' then
    v_issued := public.maybe_issue_academy_certificate(v_submission.profile_id, v_submission.curriculum_version, v_submission.role_key);
  end if;
  return v_issued;
end;
$$;

create or replace function public.list_academy_content_workflow(p_curriculum_version text)
returns table (id uuid, lesson_id text, role_key text, module_id text, revision integer, status text, content jsonb, author_name text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not v_profile.is_primary_admin then
    raise exception 'Somente a administradora fundadora tem acesso ao editor.';
  end if;
  return query
  select r.id, r.lesson_id, r.role_key, r.module_id, r.revision, r.status, r.content, author.name, r.updated_at
  from public.academy_content_revisions r
  join public.profiles author on author.id = r.created_by
  where r.curriculum_version = p_curriculum_version
    and r.role_key in ('comum', 'pesquisador', 'supervisor')
    and r.status <> 'archived'
  order by r.updated_at desc;
end;
$$;

create or replace function public.save_academy_content_draft(
  p_curriculum_version text,
  p_role_key text,
  p_module_id text,
  p_lesson_id text,
  p_content jsonb,
  p_correct_answer integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_revision integer;
  v_id uuid;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not v_profile.is_primary_admin then
    raise exception 'Somente a administradora fundadora tem acesso ao editor.';
  end if;
  if p_role_key not in ('comum', 'pesquisador', 'supervisor') then
    raise exception 'Aulas permitidas somente para Pesquisa e Supervisao.';
  end if;
  if jsonb_typeof(p_content) <> 'object' or length(coalesce(p_content->>'title', '')) < 3 then
    raise exception 'Conteudo da aula invalido.';
  end if;
  if p_correct_answer is not null and (p_correct_answer < 0 or p_correct_answer > 9) then
    raise exception 'Gabarito invalido.';
  end if;
  select coalesce(max(r.revision), 0) + 1 into v_revision
  from public.academy_content_revisions r
  where r.curriculum_version = p_curriculum_version and r.lesson_id = p_lesson_id;
  insert into public.academy_content_revisions (curriculum_version, role_key, module_id, lesson_id, revision, content, correct_answer, created_by)
  values (p_curriculum_version, p_role_key, p_module_id, p_lesson_id, v_revision, (p_content - 'answer') #- '{quiz,answer}', p_correct_answer, v_profile.id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.transition_academy_content(p_revision_id uuid, p_target_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_item public.academy_content_revisions;
begin
  v_profile := public.academy_current_profile();
  select * into v_item from public.academy_content_revisions where id = p_revision_id;
  if v_profile.id is null or not v_profile.is_primary_admin then
    raise exception 'Somente a administradora fundadora pode publicar materiais.';
  end if;
  if v_item.id is null or v_item.role_key not in ('comum', 'pesquisador', 'supervisor') then
    raise exception 'Revisao nao encontrada.';
  end if;
  if p_target_status = 'review' and v_item.status = 'draft' then
    update public.academy_content_revisions set status = 'review', reviewed_by = v_profile.id, reviewed_at = now(), updated_at = now() where id = p_revision_id;
  elsif p_target_status = 'approved' and v_item.status = 'review' then
    update public.academy_content_revisions set status = 'approved', approved_by = v_profile.id, approved_at = now(), updated_at = now() where id = p_revision_id;
  elsif p_target_status = 'published' and v_item.status = 'approved' then
    update public.academy_content_revisions set status = 'archived', updated_at = now()
    where curriculum_version = v_item.curriculum_version and lesson_id = v_item.lesson_id and status = 'published';
    update public.academy_content_revisions set status = 'published', published_by = v_profile.id, published_at = now(), updated_at = now() where id = p_revision_id;
    if v_item.correct_answer is not null then
      insert into public.academy_lessons (curriculum_version, role_key, lesson_id, correct_answer)
      values (v_item.curriculum_version, v_item.role_key, v_item.lesson_id, v_item.correct_answer)
      on conflict (curriculum_version, role_key, lesson_id)
      do update set correct_answer = excluded.correct_answer;
    end if;
  else
    raise exception 'Transicao editorial invalida.';
  end if;
  return true;
end;
$$;

revoke all on function public.academy_track_for_profile(uuid) from public, anon;
revoke all on function public.get_own_academy_track() from public, anon;
revoke all on function public.list_academy_track_assignments() from public, anon;
revoke all on function public.set_academy_track_assignment(uuid, text) from public, anon;
revoke all on function public.get_published_academy_content(text) from public, anon;
revoke all on function public.list_academy_practice_queue(text) from public, anon;
revoke all on function public.review_academy_practice(uuid, text, text) from public, anon;
revoke all on function public.list_academy_content_workflow(text) from public, anon;
revoke all on function public.save_academy_content_draft(text, text, text, text, jsonb, integer) from public, anon;
revoke all on function public.transition_academy_content(uuid, text) from public, anon;

grant execute on function public.academy_track_for_profile(uuid) to authenticated, service_role;
grant execute on function public.get_own_academy_track() to authenticated, service_role;
grant execute on function public.list_academy_track_assignments() to authenticated, service_role;
grant execute on function public.set_academy_track_assignment(uuid, text) to authenticated, service_role;
grant execute on function public.get_published_academy_content(text) to authenticated, service_role;
grant execute on function public.list_academy_practice_queue(text) to authenticated, service_role;
grant execute on function public.review_academy_practice(uuid, text, text) to authenticated, service_role;
grant execute on function public.list_academy_content_workflow(text) to authenticated, service_role;
grant execute on function public.save_academy_content_draft(text, text, text, text, jsonb, integer) to authenticated, service_role;
grant execute on function public.transition_academy_content(uuid, text) to authenticated, service_role;

commit;
