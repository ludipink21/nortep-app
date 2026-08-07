create or replace function public.founder_profile_service_check(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_me uuid := auth.uid();
  v_founder boolean := false;
  v_result jsonb;
begin
  if v_me is null then raise exception 'Não autenticado'; end if;
  select coalesce(is_primary_admin,false) and role='admin' and active=true
    into v_founder from public.profiles where id=v_me;
  if not coalesce(v_founder,false) then raise exception 'Acesso exclusivo da administradora fundadora'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_id and access_removed_at is null) then raise exception 'Perfil não encontrado'; end if;

  select jsonb_build_object(
    'profile', (select to_jsonb(x) from (
      select p.id,p.name,p.email,p.role,p.active,p.observer_mode,p.admin_level,p.is_primary_admin,p.region,
             pp.last_seen_at,pp.current_path,pp.device_label
      from public.profiles p left join public.profile_presence pp on pp.profile_id=p.id
      where p.id=p_profile_id
    ) x),
    'manager', (select to_jsonb(x) from (
      select m.id,m.name,m.role from public.team_links tl join public.profiles m on m.id=tl.manager_id
      where tl.member_id=p_profile_id and tl.active=true limit 1
    ) x),
    'coordinator', (select to_jsonb(x) from (
      select c.id,c.name from public.coordinator_memberships cm join public.profiles c on c.id=cm.coordinator_id
      where cm.researcher_id=p_profile_id and cm.active=true limit 1
    ) x),
    'territories', coalesce((select jsonb_agg(jsonb_build_object('type',pt.scope_type,'value',pt.scope_value) order by pt.scope_type,pt.scope_value)
      from public.profile_territories pt where pt.profile_id=p_profile_id and pt.active=true),'[]'::jsonb),
    'survey_assignments', coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'title',s.title,'status',s.status,'is_test',s.is_test,'team',sa.team_name,'city',sa.city,'region',sa.region,'neighborhood',sa.neighborhood,
      'intro_video',coalesce(s.intro_video_url,'')<>'','thank_you_video',coalesce(s.thank_you_video_url,'')<>''
      ) order by s.title)
      from public.survey_assignments sa join public.surveys s on s.id=sa.survey_id
      where sa.researcher_id=p_profile_id and sa.active=true and s.archived_at is null),'[]'::jsonb),
    'academy_track', coalesce((select ata.role_key from public.academy_track_assignments ata where ata.profile_id=p_profile_id),
      (select case p.role when 'pesquisador' then 'pesquisador' when 'supervisor' then 'supervisor' when 'coordenador' then 'coordenador' when 'admin' then 'administrador' else 'observador' end from public.profiles p where p.id=p_profile_id)),
    'academy_progress', jsonb_build_object(
      'started_lessons',(select count(*) from public.academy_lesson_progress alp where alp.profile_id=p_profile_id),
      'completed_lessons',(select count(*) from public.academy_lesson_progress alp where alp.profile_id=p_profile_id and alp.completed_at is not null),
      'practice_status',coalesce((select aps.status from public.academy_practice_submissions aps where aps.profile_id=p_profile_id order by aps.submitted_at desc limit 1),'not_started')
    ),
    'collection', jsonb_build_object(
      'interviews',(select count(*) from public.interviews i where i.researcher_id=p_profile_id and i.status='completed' and i.is_test=false),
      'flagged',(select count(*) from public.interviews i where i.researcher_id=p_profile_id and i.status='completed' and i.is_test=false and jsonb_array_length(coalesce(i.quality_flags,'[]'::jsonb))>0),
      'last_interview',(select max(coalesce(i.completed_at,i.created_at)) from public.interviews i where i.researcher_id=p_profile_id and i.status='completed')
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.founder_profile_service_check(uuid) from public, anon;
grant execute on function public.founder_profile_service_check(uuid) to authenticated, service_role;
