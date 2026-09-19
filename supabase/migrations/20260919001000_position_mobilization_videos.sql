alter table public.mobilization_videos
  add column if not exists placement text not null default 'gallery';

update public.mobilization_videos
set placement = 'middle'
where survey_id='02f210cd-2cfa-443e-9116-d315a3e71060'::uuid
  and video_url='https://www.instagram.com/reel/C8706HHylm5/?stkn=MWkzY25tbGxyY3RvcA==';

update public.mobilization_videos
set placement = 'before_end'
where survey_id='02f210cd-2cfa-443e-9116-d315a3e71060'::uuid
  and video_url='https://www.instagram.com/reel/C82pIjXyWyn/?stkn=ZTB5ajczdXFoa253';

create or replace function public.get_public_mobilization_form(p_code text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
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
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'title', v.title,
        'description', v.description,
        'video_url', v.video_url,
        'placement', v.placement
      ) order by v.sort_order, v.created_at)
      from public.mobilization_videos v
      where v.survey_id = survey.id
        and v.active
    ), '[]'::jsonb),
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
  where partner.public_code = trim(coalesce(p_code, ''))
    and partner.active
    and partner.archived_at is null;
$function$;

grant execute on function public.get_public_mobilization_form(text) to anon, authenticated, service_role;
