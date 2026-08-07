-- Administrador Primário: mesma visão e poderes operacionais da Fundadora.
-- Exceção permanente: a conta Fundadora continua protegida de remoção/rebaixamento.

create or replace function public.has_principal_admin_access()
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
      and admin_level in ('founder','primary')
      and active
      and access_removed_at is null
  );
$$;
revoke all on function public.has_principal_admin_access() from public, anon;
grant execute on function public.has_principal_admin_access() to authenticated;

-- Compatibilidade com chamadas legadas: o nome antigo passa a significar
-- administração principal (Fundadora + Primário), sem alterar a flag da Fundadora.
create or replace function public.is_primary_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.has_principal_admin_access(); $$;

create or replace function public.founder_profile_service_check(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not public.has_principal_admin_access() then raise exception 'Acesso exclusivo da Fundadora e do Administrador Primário'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_id and access_removed_at is null) then raise exception 'Perfil não encontrado'; end if;
  select jsonb_build_object(
    'profile', (select to_jsonb(x) from (select p.id,p.name,p.email,p.role,p.active,p.observer_mode,p.admin_level,p.is_primary_admin,p.region,pp.last_seen_at,pp.current_path,pp.device_label from public.profiles p left join public.profile_presence pp on pp.profile_id=p.id where p.id=p_profile_id) x),
    'manager', (select to_jsonb(x) from (select m.id,m.name,m.role from public.team_links tl join public.profiles m on m.id=tl.manager_id where tl.member_id=p_profile_id and tl.active=true limit 1) x),
    'coordinator', (select to_jsonb(x) from (select c.id,c.name from public.coordinator_memberships cm join public.profiles c on c.id=cm.coordinator_id where cm.researcher_id=p_profile_id and cm.active=true limit 1) x),
    'territories', coalesce((select jsonb_agg(jsonb_build_object('type',pt.scope_type,'value',pt.scope_value) order by pt.scope_type,pt.scope_value) from public.profile_territories pt where pt.profile_id=p_profile_id and pt.active=true),'[]'::jsonb),
    'survey_assignments', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'status',s.status,'is_test',s.is_test,'team',sa.team_name,'city',sa.city,'region',sa.region,'neighborhood',sa.neighborhood,'intro_video',coalesce(s.intro_video_url,'')<>'','thank_you_video',coalesce(s.thank_you_video_url,'')<>'') order by s.title) from public.survey_assignments sa join public.surveys s on s.id=sa.survey_id where sa.researcher_id=p_profile_id and sa.active=true and s.archived_at is null),'[]'::jsonb),
    'academy_track', coalesce((select ata.role_key from public.academy_track_assignments ata where ata.profile_id=p_profile_id),(select case p.role when 'pesquisador' then 'pesquisador' when 'supervisor' then 'supervisor' when 'coordenador' then 'coordenador' when 'admin' then 'administrador' else 'observador' end from public.profiles p where p.id=p_profile_id)),
    'academy_progress', jsonb_build_object('started_lessons',(select count(*) from public.academy_lesson_progress alp where alp.profile_id=p_profile_id),'completed_lessons',(select count(*) from public.academy_lesson_progress alp where alp.profile_id=p_profile_id and alp.completed_at is not null),'practice_status',coalesce((select aps.status from public.academy_practice_submissions aps where aps.profile_id=p_profile_id order by aps.submitted_at desc limit 1),'not_started')),
    'collection', jsonb_build_object('interviews',(select count(*) from public.interviews i where i.researcher_id=p_profile_id and i.status='completed' and i.is_test=false),'flagged',(select count(*) from public.interviews i where i.researcher_id=p_profile_id and i.status='completed' and i.is_test=false and jsonb_array_length(coalesce(i.quality_flags,'[]'::jsonb))>0),'last_interview',(select max(coalesce(i.completed_at,i.created_at)) from public.interviews i where i.researcher_id=p_profile_id and i.status='completed'))
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_published_academy_content(p_curriculum_version text)
returns table(lesson_id text, role_key text, module_id text, content jsonb, published_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_role text; v_principal boolean;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null then raise exception 'Perfil ativo nao encontrado.'; end if;
  v_principal := v_profile.role='admin' and v_profile.admin_level in ('founder','primary');
  v_role := public.academy_track_for_profile(v_profile.id);
  if not v_principal and v_role not in ('pesquisador','supervisor') then raise exception 'Perfil sem acesso ao conteudo da Academia.'; end if;
  return query select r.lesson_id,r.role_key,r.module_id,case when v_principal then r.content else (r.content - 'instructor' - 'speak') end,r.published_at from public.academy_content_revisions r where r.curriculum_version=p_curriculum_version and r.status='published' and (v_principal or r.role_key in ('comum',v_role));
end;
$$;

create or replace function public.list_academy_content_workflow(p_curriculum_version text)
returns table(id uuid, lesson_id text, role_key text, module_id text, revision integer, status text, content jsonb, author_name text, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not (v_profile.role='admin' and v_profile.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário tem acesso ao editor.'; end if;
  return query select r.id,r.lesson_id,r.role_key,r.module_id,r.revision,r.status,r.content,author.name,r.updated_at from public.academy_content_revisions r join public.profiles author on author.id=r.created_by where r.curriculum_version=p_curriculum_version and r.role_key in ('comum','pesquisador','supervisor') and r.status<>'archived' order by r.updated_at desc;
end;
$$;

create or replace function public.list_academy_practice_queue(p_curriculum_version text)
returns table(id uuid, profile_name text, role_key text, response_text text, status text, reviewer_feedback text, submitted_at timestamptz, reviewed_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not (v_profile.role='admin' and v_profile.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário pode revisar práticas.'; end if;
  return query select p.id,learner.name,p.role_key,p.response_text,p.status,p.reviewer_feedback,p.submitted_at,p.reviewed_at from public.academy_practice_submissions p join public.profiles learner on learner.id=p.profile_id where p.curriculum_version=p_curriculum_version and p.role_key in ('pesquisador','supervisor') and public.manager_can_access_profile(p.profile_id) order by case p.status when 'pending' then 0 when 'changes_requested' then 1 else 2 end,p.submitted_at;
end;
$$;

create or replace function public.review_academy_practice(p_submission_id uuid, p_decision text, p_feedback text default ''::text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_submission public.academy_practice_submissions; v_issued boolean;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not (v_profile.role='admin' and v_profile.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário pode revisar práticas.'; end if;
  if p_decision not in ('approved','changes_requested') then raise exception 'Decisao invalida.'; end if;
  select * into v_submission from public.academy_practice_submissions where id=p_submission_id and role_key in ('pesquisador','supervisor');
  if v_submission.id is null or not public.manager_can_access_profile(v_submission.profile_id) then raise exception 'Pratica fora do seu escopo.'; end if;
  update public.academy_practice_submissions set status=p_decision,reviewer_feedback=left(coalesce(p_feedback,''),4000),reviewed_at=now(),reviewed_by=v_profile.id,updated_at=now() where id=p_submission_id;
  v_issued := false;
  if p_decision='approved' then v_issued := public.maybe_issue_academy_certificate(v_submission.profile_id,v_submission.curriculum_version,v_submission.role_key); end if;
  return v_issued;
end;
$$;

create or replace function public.save_academy_content_draft(p_curriculum_version text, p_role_key text, p_module_id text, p_lesson_id text, p_content jsonb, p_correct_answer integer default null::integer)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_revision integer; v_id uuid;
begin
  v_profile := public.academy_current_profile();
  if v_profile.id is null or not (v_profile.role='admin' and v_profile.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário tem acesso ao editor.'; end if;
  if p_role_key not in ('comum','pesquisador','supervisor') then raise exception 'Aulas permitidas somente para Pesquisa e Supervisao.'; end if;
  if jsonb_typeof(p_content)<>'object' or length(coalesce(p_content->>'title',''))<3 then raise exception 'Conteudo da aula invalido.'; end if;
  if p_correct_answer is not null and (p_correct_answer<0 or p_correct_answer>9) then raise exception 'Gabarito invalido.'; end if;
  select coalesce(max(r.revision),0)+1 into v_revision from public.academy_content_revisions r where r.curriculum_version=p_curriculum_version and r.lesson_id=p_lesson_id;
  insert into public.academy_content_revisions(curriculum_version,role_key,module_id,lesson_id,revision,content,correct_answer,created_by) values(p_curriculum_version,p_role_key,p_module_id,p_lesson_id,v_revision,(p_content-'answer') #- '{quiz,answer}',p_correct_answer,v_profile.id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.transition_academy_content(p_revision_id uuid, p_target_status text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_profile public.profiles; v_item public.academy_content_revisions;
begin
  v_profile := public.academy_current_profile();
  select * into v_item from public.academy_content_revisions where id=p_revision_id;
  if v_profile.id is null or not (v_profile.role='admin' and v_profile.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário pode publicar materiais.'; end if;
  if v_item.id is null or v_item.role_key not in ('comum','pesquisador','supervisor') then raise exception 'Revisao nao encontrada.'; end if;
  if p_target_status='review' and v_item.status='draft' then update public.academy_content_revisions set status='review',reviewed_by=v_profile.id,reviewed_at=now(),updated_at=now() where id=p_revision_id;
  elsif p_target_status='approved' and v_item.status='review' then update public.academy_content_revisions set status='approved',approved_by=v_profile.id,approved_at=now(),updated_at=now() where id=p_revision_id;
  elsif p_target_status='published' and v_item.status='approved' then
    update public.academy_content_revisions set status='archived',updated_at=now() where curriculum_version=v_item.curriculum_version and lesson_id=v_item.lesson_id and status='published';
    update public.academy_content_revisions set status='published',published_by=v_profile.id,published_at=now(),updated_at=now() where id=p_revision_id;
    if v_item.correct_answer is not null then insert into public.academy_lessons(curriculum_version,role_key,lesson_id,correct_answer) values(v_item.curriculum_version,v_item.role_key,v_item.lesson_id,v_item.correct_answer) on conflict(curriculum_version,role_key,lesson_id) do update set correct_answer=excluded.correct_answer; end if;
  else raise exception 'Transicao editorial invalida.'; end if;
  return true;
end;
$$;

create or replace function public.create_access_invite(p_email text, p_role text default 'pesquisador'::text)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_actor public.profiles; v_code text:=encode(gen_random_bytes(18),'hex'); v_email text:=lower(trim(coalesce(p_email,''))); v_invite_id uuid;
begin
  select * into v_actor from public.profiles where id=auth.uid() and active and access_removed_at is null and role in ('admin','coordenador');
  if v_actor.id is null then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_role not in ('admin','coordenador','pesquisador','observador') then raise exception 'Função de acesso inválida.'; end if;
  if p_role='admin' and not (v_actor.role='admin' and v_actor.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário pode criar outro administrador.'; end if;
  if v_actor.role='coordenador' and p_role not in ('pesquisador','observador') then raise exception 'Coordenadores podem convidar somente pesquisadores ou observadores.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Informe um e-mail válido.'; end if;
  update public.access_invites set revoked_at=now() where lower(email)=v_email and role=p_role and used_at is null and revoked_at is null and expires_at>now();
  insert into public.access_invites(email,role,token_hash,created_by,expires_at) values(v_email,p_role,encode(digest(v_code,'sha256'),'hex'),auth.uid(),now()+interval '72 hours') returning id into v_invite_id;
  insert into public.audit_events(actor_id,action,entity,entity_id,metadata) values(auth.uid(),'invite_created','access_invite',v_invite_id::text,jsonb_build_object('email',v_email,'role',p_role,'expires_in_hours',72));
  return v_code;
end;
$$;

create or replace function public.create_scoped_access_invite(p_email text, p_role text, p_cities text[] default '{}'::text[], p_regions text[] default '{}'::text[], p_neighborhoods text[] default '{}'::text[])
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_actor public.profiles; v_code text:=encode(gen_random_bytes(18),'hex'); v_email text:=lower(trim(coalesce(p_email,''))); v_invite_id uuid; v_coordinator_id uuid;
begin
  select * into v_actor from public.profiles where id=auth.uid() and active and access_removed_at is null and role in ('admin','coordenador');
  if v_actor.id is null then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_role not in ('admin','coordenador','pesquisador','observador') then raise exception 'Função de acesso inválida.'; end if;
  if p_role='admin' and not (v_actor.role='admin' and v_actor.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário pode criar outro administrador.'; end if;
  if v_actor.role='coordenador' and p_role<>'pesquisador' then raise exception 'Coordenadores podem convidar somente pesquisadores da própria equipe.'; end if;
  if v_actor.role='admin' and p_role='pesquisador' then raise exception 'Pesquisadores devem ser convidados pelo coordenador responsável.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Informe um e-mail válido.'; end if;
  v_coordinator_id:=case when v_actor.role='coordenador' and p_role='pesquisador' then v_actor.id else null end;
  update public.access_invites set revoked_at=now() where lower(email)=v_email and role=p_role and used_at is null and revoked_at is null and expires_at>now();
  insert into public.access_invites(email,role,token_hash,created_by,expires_at,coordinator_id,territory_cities,territory_regions,territory_neighborhoods) values(v_email,p_role,encode(digest(v_code,'sha256'),'hex'),auth.uid(),now()+interval '72 hours',v_coordinator_id,coalesce(p_cities,'{}'::text[]),coalesce(p_regions,'{}'::text[]),coalesce(p_neighborhoods,'{}'::text[])) returning id into v_invite_id;
  insert into public.audit_events(actor_id,action,entity,entity_id,metadata) values(auth.uid(),'invite_created','access_invite',v_invite_id::text,jsonb_build_object('email',v_email,'role',p_role,'coordinator_id',v_coordinator_id,'territory_cities',coalesce(p_cities,'{}'::text[]),'territory_regions',coalesce(p_regions,'{}'::text[]),'territory_neighborhoods',coalesce(p_neighborhoods,'{}'::text[]),'expires_in_hours',72));
  return v_code;
end;
$$;

create or replace function public.create_team_access_invite(p_email text, p_role text default 'pesquisador'::text, p_coordinator_id uuid default null::uuid)
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare v_actor public.profiles; v_code text:=encode(gen_random_bytes(18),'hex'); v_email text:=lower(trim(coalesce(p_email,''))); v_invite_id uuid; v_coordinator_id uuid;
begin
  select * into v_actor from public.profiles where id=auth.uid() and active and access_removed_at is null and role in ('admin','coordenador');
  if v_actor.id is null then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_role not in ('admin','coordenador','pesquisador','observador') then raise exception 'Função de acesso inválida.'; end if;
  if p_role='admin' and not (v_actor.role='admin' and v_actor.admin_level in ('founder','primary')) then raise exception 'Somente a Fundadora ou o Administrador Primário pode criar outro administrador.'; end if;
  if v_actor.role='coordenador' and p_role<>'pesquisador' then raise exception 'Coordenadores podem convidar somente pesquisadores da própria equipe.'; end if;
  if v_actor.role='admin' and p_role='pesquisador' then raise exception 'Pesquisadores devem ser convidados pelo coordenador responsável.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Informe um e-mail válido.'; end if;
  v_coordinator_id:=case when v_actor.role='coordenador' and p_role='pesquisador' then v_actor.id else p_coordinator_id end;
  update public.access_invites set revoked_at=now() where lower(email)=v_email and role=p_role and used_at is null and revoked_at is null and expires_at>now();
  insert into public.access_invites(email,role,token_hash,created_by,expires_at,coordinator_id) values(v_email,p_role,encode(digest(v_code,'sha256'),'hex'),auth.uid(),now()+interval '72 hours',v_coordinator_id) returning id into v_invite_id;
  insert into public.audit_events(actor_id,action,entity,entity_id,metadata) values(auth.uid(),'invite_created','access_invite',v_invite_id::text,jsonb_build_object('email',v_email,'role',p_role,'coordinator_id',v_coordinator_id,'expires_in_hours',72));
  return v_code;
end;
$$;

create or replace function public.remove_own_profile_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id=auth.uid() for update;
  if v_profile.id is null then raise exception 'Perfil não encontrado.'; end if;
  if v_profile.access_removed_at is not null then raise exception 'Este acesso já foi descadastrado.'; end if;
  if v_profile.role='admin' and v_profile.admin_level in ('founder','primary') then raise exception 'A conta da administração principal é protegida contra autodescadastramento.'; end if;
  update public.survey_assignments set active=false where researcher_id=v_profile.id;
  update public.vault_access_grants set active=false,revoked_at=now() where profile_id=v_profile.id;
  delete from public.vault_sessions where profile_id=v_profile.id;
  delete from public.vault_keys where profile_id=v_profile.id;
  insert into public.audit_events(actor_id,action,entity,entity_id,metadata) values(v_profile.id,'self_access_removed','profile',v_profile.id::text,jsonb_build_object('former_role',v_profile.role));
  update public.profiles set name='Usuário descadastrado',email='removido-'||replace(v_profile.id::text,'-','')||'@nortep.invalid',active=false,access_removed_at=now(),updated_at=now() where id=v_profile.id;
  return jsonb_build_object('removed',true);
end;
$$;
