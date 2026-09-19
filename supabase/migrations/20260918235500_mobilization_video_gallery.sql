create table if not exists public.mobilization_videos (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  title text not null,
  video_url text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mobilization_videos enable row level security;

create index if not exists mobilization_videos_survey_order_idx
  on public.mobilization_videos(survey_id, active, sort_order, created_at);

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
        'video_url', v.video_url
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

revoke all on table public.mobilization_videos from anon, authenticated;
grant execute on function public.get_public_mobilization_form(text) to anon, authenticated, service_role;
