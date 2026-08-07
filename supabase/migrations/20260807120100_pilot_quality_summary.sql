create or replace function public.pilot_quality_summary(p_days integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  if v_me is null then raise exception 'Não autenticado'; end if;
  select role into v_role from public.profiles where id=v_me and active=true;
  if v_role not in ('admin','coordenador') then raise exception 'Acesso não autorizado'; end if;

  with base as (
    select i.id, i.code, i.survey_id, i.researcher_id, i.duration_seconds, i.quality_flags,
           i.completed_at, i.created_at, p.name as researcher_name, s.title as survey_title
    from public.interviews i
    join public.profiles p on p.id=i.researcher_id
    join public.surveys s on s.id=i.survey_id
    where i.status='completed'
      and i.is_test=false
      and coalesce(i.completed_at,i.created_at) >= now() - make_interval(days => greatest(1,least(coalesce(p_days,14),90)))
      and (v_role='admin' or exists (
        select 1 from public.coordinator_memberships cm
        where cm.coordinator_id=v_me and cm.researcher_id=i.researcher_id and cm.active=true
      ))
  ), per_researcher as (
    select researcher_id, researcher_name,
           count(*)::int as interviews,
           round(avg(duration_seconds)::numeric,0)::int as avg_duration_seconds,
           count(*) filter (where quality_flags ? 'muito_rapida')::int as very_fast,
           count(*) filter (where quality_flags ? 'possivel_repetida')::int as possible_duplicates,
           count(*) filter (where quality_flags ? 'resposta_muito_curta')::int as very_short_answers,
           count(*) filter (where jsonb_array_length(coalesce(quality_flags,'[]'::jsonb))>0)::int as flagged
    from base group by researcher_id,researcher_name
  ), flagged_rows as (
    select id, code, researcher_id, researcher_name, survey_id, survey_title, duration_seconds,
           quality_flags, coalesce(completed_at,created_at) as completed_at
    from base
    where jsonb_array_length(coalesce(quality_flags,'[]'::jsonb))>0
    order by coalesce(completed_at,created_at) desc
    limit 50
  )
  select jsonb_build_object(
    'window_days', greatest(1,least(coalesce(p_days,14),90)),
    'total_interviews', (select count(*) from base),
    'flagged_interviews', (select count(*) from base where jsonb_array_length(coalesce(quality_flags,'[]'::jsonb))>0),
    'researchers', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.researcher_name) from per_researcher pr),'[]'::jsonb),
    'flagged_rows', coalesce((select jsonb_agg(to_jsonb(fr)) from flagged_rows fr),'[]'::jsonb),
    'guidance', jsonb_build_array(
      'Alerta de qualidade não é acusação: revisar contexto antes de qualquer decisão.',
      'Com amostra pequena, observar padrões repetidos; não concluir por um único caso.',
      'Entrevistas muito rápidas podem ocorrer por questionário curto, recusa parcial ou erro de cronômetro.',
      'Possível repetição compara respostas idênticas da mesma pesquisadora em 24 horas.'
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.pilot_quality_summary(integer) from public, anon;
grant execute on function public.pilot_quality_summary(integer) to authenticated, service_role;
