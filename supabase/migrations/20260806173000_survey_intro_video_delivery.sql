create or replace function public.get_survey_intro_video(p_survey_title text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_video text;
begin
  if auth.uid() is null then return null; end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active and access_removed_at is null;

  if v_profile.id is null then return null; end if;

  select s.intro_video_url into v_video
  from public.surveys s
  where s.title = trim(coalesce(p_survey_title, ''))
    and s.archived_at is null
    and (
      v_profile.role in ('admin','coordenador','supervisor')
      or (
        v_profile.role = 'pesquisador'
        and s.status in ('pilot','active')
        and exists (
          select 1 from public.survey_assignments a
          where a.survey_id = s.id
            and a.researcher_id = v_profile.id
            and a.active
        )
      )
    )
  order by s.updated_at desc
  limit 1;

  return v_video;
end;
$$;

revoke all on function public.get_survey_intro_video(text) from public, anon;
grant execute on function public.get_survey_intro_video(text) to authenticated;

create or replace function public.get_public_mobilization_form(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'partner', jsonb_build_object(
      'name', partner.name,
      'kind', partner.kind,
      'city', partner.city,
      'region', partner.region,
      'neighborhood', partner.neighborhood
    ),
    'survey', jsonb_build_object(
      'id', survey.id,
      'title', survey.title,
      'description', survey.description,
      'consent_text', survey.consent_text,
      'intro_video_url', survey.intro_video_url,
      'video_url', coalesce(partner.thank_you_video_url, survey.thank_you_video_url)
    ),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', q.code, 'section', q.section, 'type', q.type,
        'prompt', q.prompt, 'help_text', q.help_text, 'required', q.required,
        'options', q.options, 'condition', q.condition
      ) order by q.sort_order)
      from public.survey_questions q where q.survey_id = survey.id
    ), '[]'::jsonb)
  )
  from public.mobilization_partners partner
  cross join lateral (
    select s.* from public.surveys s
    where s.survey_type = 'relationship'
      and s.status in ('pilot', 'active')
      and s.archived_at is null
    order by s.updated_at desc limit 1
  ) survey
  where partner.public_code = trim(coalesce(p_code, '')) and partner.active;
$$;

revoke all on function public.get_public_mobilization_form(text) from public;
grant execute on function public.get_public_mobilization_form(text) to anon, authenticated;
