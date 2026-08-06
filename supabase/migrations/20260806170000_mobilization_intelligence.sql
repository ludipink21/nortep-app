create extension if not exists unaccent with schema extensions;

alter table public.surveys
  add column if not exists intro_video_url text;

create table if not exists public.mobilization_theme_catalog (
  theme text primary key,
  keywords text[] not null default '{}',
  proposal_template text not null,
  display_order integer not null default 100,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.mobilization_theme_catalog enable row level security;
revoke all on table public.mobilization_theme_catalog from anon, authenticated;

insert into public.mobilization_theme_catalog(theme, keywords, proposal_template, display_order)
values
  ('Saúde', array['saude','posto','ubs','consulta','medico','hospital','remedio','exame','fila'], 'Avaliar um plano territorial para ampliar o acesso à atenção básica, consultas, exames e medicamentos, priorizando os locais mais citados.', 10),
  ('Educação', array['educacao','escola','creche','professor','ensino','curso','faculdade'], 'Avaliar melhorias na rede educacional, vagas, estrutura, permanência escolar e formação profissional conforme as necessidades territoriais.', 20),
  ('Segurança', array['seguranca','violencia','roubo','assalto','policia','trafico','criminalidade'], 'Avaliar ações integradas de prevenção, iluminação, ocupação de espaços públicos e articulação com os órgãos de segurança.', 30),
  ('Emprego e renda', array['emprego','renda','trabalho','oportunidade','curso profissional','qualificacao','desemprego'], 'Avaliar programas de qualificação, intermediação de mão de obra, apoio ao comércio local e atração de oportunidades.', 40),
  ('Transporte e mobilidade', array['transporte','onibus','mobilidade','transito','linha','passagem','ponto de onibus','rodovia'], 'Avaliar revisão de linhas, horários, integração, condições de pontos, circulação e acessibilidade nos trajetos mais citados.', 50),
  ('Saneamento e drenagem', array['saneamento','esgoto','agua','drenagem','enchente','alagamento','bueiro'], 'Avaliar intervenções de saneamento, drenagem e prevenção de alagamentos, com priorização territorial baseada nas respostas.', 60),
  ('Asfalto, vias e estradas', array['asfalto','pavimentacao','buraco','rua','via','estrada','calcada'], 'Avaliar um plano de manutenção e qualificação de vias, estradas e calçadas, com critérios públicos de prioridade.', 70),
  ('Iluminação e espaços públicos', array['iluminacao','luz','praca','parque','espaco publico','lazer'], 'Avaliar melhorias de iluminação, conservação e uso comunitário dos espaços públicos mais citados.', 80),
  ('Habitação e urbanização', array['moradia','habitacao','casa','regularizacao','urbanizacao','ocupacao'], 'Avaliar ações de urbanização, regularização e acesso à moradia digna, respeitando as competências e a viabilidade jurídica.', 90),
  ('Assistência social', array['assistencia','cras','beneficio','vulnerabilidade','fome','familia'], 'Avaliar fortalecimento da proteção social e do acesso a serviços para famílias e grupos em situação de vulnerabilidade.', 100),
  ('Meio ambiente', array['meio ambiente','poluicao','lixo','rio','ar','industria','ambiental','arvore'], 'Avaliar medidas de proteção ambiental, fiscalização, recuperação de áreas e redução dos impactos mais citados.', 110),
  ('Cultura, esporte e juventude', array['cultura','esporte','juventude','jovem','quadra','futebol','atividade cultural'], 'Avaliar programas e espaços de cultura, esporte e oportunidades para juventudes, com foco nos territórios mais demandados.', 120)
on conflict (theme) do update
set keywords = excluded.keywords,
    proposal_template = excluded.proposal_template,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

create table if not exists public.mobilization_proposal_items (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  theme_key text generated always as (lower(theme)) stored,
  scope_type text not null default 'geral' check (scope_type in ('geral','cidade','regional','bairro')),
  scope_value text,
  scope_key text generated always as (lower(coalesce(scope_value, ''))) stored,
  recommendation text not null,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  status text not null default 'analysis' check (status in ('analysis','included','study','not_feasible','responded')),
  notes text not null default '',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mobilization_proposal_items_scope_unique
on public.mobilization_proposal_items (theme_key, scope_type, scope_key);

alter table public.mobilization_proposal_items enable row level security;
revoke all on table public.mobilization_proposal_items from anon, authenticated;

create or replace function public.normalize_nortep_text(p_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(regexp_replace(lower(extensions.unaccent(coalesce(p_value, ''))), '[^a-z0-9]+', ' ', 'g'));
$$;

revoke all on function public.normalize_nortep_text(text) from public, anon, authenticated;

create or replace function public.can_view_mobilization_intelligence()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and access_removed_at is null
      and (role = 'admin' or (role = 'observador' and observer_mode = 'candidato'))
  );
$$;

revoke all on function public.can_view_mobilization_intelligence() from public, anon, authenticated;

create or replace function public.regional_surveys_admin()
returns table (
  id uuid,
  slug text,
  title text,
  status text,
  regional text,
  intro_video_url text,
  thank_you_video_url text,
  question_count bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active and access_removed_at is null
  ) then
    raise exception 'Acesso administrativo necessário.';
  end if;

  return query
  select s.id, s.slug, s.title, s.status,
         coalesce(s.target_regions[1], '') as regional,
         s.intro_video_url, s.thank_you_video_url,
         count(q.id), s.updated_at
  from public.surveys s
  left join public.survey_questions q on q.survey_id = s.id
  where s.slug like 'betim-regional-%' and s.archived_at is null
  group by s.id
  order by s.title;
end;
$$;

revoke all on function public.regional_surveys_admin() from public, anon;
grant execute on function public.regional_surveys_admin() to authenticated;

create or replace function public.set_survey_videos_admin(
  p_survey_id uuid,
  p_intro_video_url text default null,
  p_thank_you_video_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intro text := nullif(trim(coalesce(p_intro_video_url, '')), '');
  v_final text := nullif(trim(coalesce(p_thank_you_video_url, '')), '');
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active and access_removed_at is null
  ) then
    raise exception 'Acesso administrativo necessário.';
  end if;

  if v_intro is not null and v_intro !~* '^https://(www\.)?(youtube\.com|youtu\.be)/' then
    raise exception 'Use um link válido do YouTube para o vídeo de abertura.';
  end if;
  if v_final is not null and v_final !~* '^https://(www\.)?(youtube\.com|youtu\.be)/' then
    raise exception 'Use um link válido do YouTube para o vídeo de encerramento.';
  end if;

  update public.surveys
  set intro_video_url = v_intro,
      thank_you_video_url = v_final,
      updated_at = now()
  where id = p_survey_id and archived_at is null;

  if not found then raise exception 'Pesquisa não encontrada.'; end if;

  insert into public.audit_events(actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'survey_videos_updated', 'survey', p_survey_id::text,
          jsonb_build_object('intro_configured', v_intro is not null, 'final_configured', v_final is not null));
end;
$$;

revoke all on function public.set_survey_videos_admin(uuid, text, text) from public, anon;
grant execute on function public.set_survey_videos_admin(uuid, text, text) to authenticated;

create or replace function public.save_mobilization_proposal_item(
  p_theme text,
  p_scope_type text,
  p_scope_value text,
  p_recommendation text,
  p_evidence_count integer default 0,
  p_status text default 'analysis',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.mobilization_proposal_items;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active and access_removed_at is null
  ) then
    raise exception 'Acesso administrativo necessário.';
  end if;

  if p_scope_type not in ('geral','cidade','regional','bairro') then raise exception 'Escopo inválido.'; end if;
  if p_status not in ('analysis','included','study','not_feasible','responded') then raise exception 'Situação inválida.'; end if;

  insert into public.mobilization_proposal_items(
    theme, scope_type, scope_value, recommendation, evidence_count, status, notes, created_by, updated_by
  ) values (
    trim(p_theme), p_scope_type, nullif(trim(coalesce(p_scope_value,'')), ''), trim(p_recommendation),
    greatest(coalesce(p_evidence_count,0),0), p_status, trim(coalesce(p_notes,'')), auth.uid(), auth.uid()
  )
  on conflict (theme_key, scope_type, scope_key) do update set
    recommendation = excluded.recommendation,
    evidence_count = excluded.evidence_count,
    status = excluded.status,
    notes = excluded.notes,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_item;

  insert into public.audit_events(actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'mobilization_proposal_saved', 'mobilization_proposal_item', v_item.id::text,
          jsonb_build_object('theme', v_item.theme, 'scope_type', v_item.scope_type, 'scope_value', v_item.scope_value, 'status', v_item.status));

  return to_jsonb(v_item);
end;
$$;

revoke all on function public.save_mobilization_proposal_item(text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.save_mobilization_proposal_item(text, text, text, text, integer, text, text) to authenticated;

create or replace function public.mobilization_intelligence_summary(
  p_city text default null,
  p_region text default null,
  p_neighborhood text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  if not public.can_view_mobilization_intelligence() then
    raise exception 'Acesso não autorizado à inteligência de mobilização.';
  end if;

  with filtered_responses as (
    select mr.id, mr.partner_id, mr.answers, mr.city, mr.region, mr.neighborhood, mr.created_at
    from public.mobilization_responses mr
    where (nullif(trim(coalesce(p_city,'')), '') is null or lower(coalesce(mr.city,'')) = lower(trim(p_city)))
      and (nullif(trim(coalesce(p_region,'')), '') is null or lower(coalesce(mr.region,'')) = lower(trim(p_region)))
      and (nullif(trim(coalesce(p_neighborhood,'')), '') is null or lower(coalesce(mr.neighborhood,'')) = lower(trim(p_neighborhood)))
  ),
  source_answers as (
    select fr.id as response_id, fr.partner_id, fr.city, fr.region, fr.neighborhood, fr.created_at,
           e.key as code, e.value as answer, public.normalize_nortep_text(e.value) as normalized_answer
    from filtered_responses fr
    cross join lateral jsonb_each_text(fr.answers) e
    where e.key in ('prioridadeCidade','prioridadeEstado','temaInteresse','expectativa','sugestaoEncontro','comentarioFinal','problemaPrincipal','prioridades','proposta','propostaRegional','temasRegionais')
      and length(trim(e.value)) > 1
  ),
  text_by_response as (
    select response_id, min(city) city, min(region) region, min(neighborhood) neighborhood,
           min(created_at) created_at, public.normalize_nortep_text(string_agg(answer, ' ')) as all_text
    from source_answers group by response_id
  ),
  theme_mentions as (
    select t.theme, t.proposal_template, t.display_order, r.response_id, r.city, r.region, r.neighborhood, r.created_at
    from public.mobilization_theme_catalog t
    join text_by_response r on exists (
      select 1 from unnest(t.keywords) keyword
      where r.all_text like '%' || public.normalize_nortep_text(keyword) || '%'
    )
    where t.active
  ),
  theme_stats as (
    select tm.theme, min(tm.proposal_template) proposal_template, min(tm.display_order) display_order,
           count(distinct tm.response_id)::int mentions,
           count(distinct tm.city) filter (where nullif(tm.city,'') is not null)::int cities,
           count(distinct tm.region) filter (where nullif(tm.region,'') is not null)::int regions,
           count(distinct tm.neighborhood) filter (where nullif(tm.neighborhood,'') is not null)::int neighborhoods,
           count(distinct tm.response_id) filter (where tm.created_at >= now() - interval '30 days')::int recent_mentions,
           count(distinct tm.response_id) filter (where tm.created_at >= now() - interval '60 days' and tm.created_at < now() - interval '30 days')::int previous_mentions
    from theme_mentions tm group by tm.theme
  ),
  suggestion_groups as (
    select min(answer) as suggestion, count(distinct response_id)::int mentions,
           min(city) as city, min(region) as region, min(neighborhood) as neighborhood, normalized_answer
    from source_answers
    where code in ('prioridadeCidade','prioridadeEstado','expectativa','sugestaoEncontro','comentarioFinal','problemaPrincipal','proposta','propostaRegional')
      and length(normalized_answer) >= 5
    group by normalized_answer
  ),
  territory_stats as (
    select coalesce(nullif(neighborhood,''), nullif(region,''), nullif(city,''), 'Não informado') territory,
           case when nullif(neighborhood,'') is not null then 'bairro' when nullif(region,'') is not null then 'regional' when nullif(city,'') is not null then 'cidade' else 'não informado' end scope_type,
           count(*)::int responses
    from filtered_responses group by 1,2
  ),
  partner_stats as (
    select mp.id, mp.name, mp.kind, mp.city, mp.region, mp.neighborhood, count(fr.id)::int responses, max(fr.created_at) last_response_at
    from public.mobilization_partners mp
    left join filtered_responses fr on fr.partner_id = mp.id
    where mp.active group by mp.id
  ),
  totals as (
    select count(*)::int total, count(*) filter (where created_at >= now() - interval '30 days')::int last_30_days
    from filtered_responses
  )
  select jsonb_build_object(
    'generated_at', now(),
    'filters', jsonb_build_object('city', p_city, 'region', p_region, 'neighborhood', p_neighborhood),
    'summary', jsonb_build_object('total_responses', totals.total, 'last_30_days', totals.last_30_days,
      'sample_warning', case when totals.total < 10 then 'Amostra inicial: não trate percentuais como conclusão.' when totals.total < 30 then 'Amostra em formação: compare tendências com cautela.' else null end),
    'themes', coalesce((select jsonb_agg(jsonb_build_object(
      'theme', ts.theme, 'mentions', ts.mentions,
      'percentage', case when totals.total = 0 then 0 else round((ts.mentions::numeric * 100) / totals.total, 1) end,
      'cities', ts.cities, 'regions', ts.regions, 'neighborhoods', ts.neighborhoods, 'recent_mentions', ts.recent_mentions,
      'classification', case when totals.total < 10 then 'sinal_inicial' when totals.total >= 20 and ts.mentions >= 5 and (ts.mentions::numeric / totals.total) >= 0.25 then 'alta_prioridade' when totals.total >= 10 and ts.mentions >= 3 and ts.neighborhoods between 1 and 2 then 'prioridade_local' when ts.recent_mentions >= 3 and ts.recent_mentions > greatest(ts.previous_mentions * 1.3, ts.previous_mentions + 1) then 'tema_emergente' else 'acompanhar' end,
      'suggested_action', ts.proposal_template) order by ts.mentions desc, ts.display_order) from theme_stats ts), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('text', sg.suggestion, 'mentions', sg.mentions, 'city', sg.city, 'region', sg.region, 'neighborhood', sg.neighborhood) order by sg.mentions desc, sg.suggestion) from (select * from suggestion_groups order by mentions desc, suggestion limit 30) sg), '[]'::jsonb),
    'territories', coalesce((select jsonb_agg(jsonb_build_object('territory', territory, 'scope_type', scope_type, 'responses', responses) order by responses desc, territory) from territory_stats), '[]'::jsonb),
    'mobilizers', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'city', city, 'region', region, 'neighborhood', neighborhood, 'responses', responses, 'last_response_at', last_response_at) order by responses desc, name) from partner_stats), '[]'::jsonb),
    'tracked_proposals', coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc) from public.mobilization_proposal_items p), '[]'::jsonb),
    'regional_surveys', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'title', s.title, 'status', s.status, 'regional', coalesce(s.target_regions[1], ''), 'intro_video_url', s.intro_video_url, 'thank_you_video_url', s.thank_you_video_url) order by s.title) from public.surveys s where s.slug like 'betim-regional-%' and s.archived_at is null), '[]'::jsonb)
  ) into v_result from totals;

  return v_result;
end;
$$;

revoke all on function public.mobilization_intelligence_summary(text, text, text) from public, anon;
grant execute on function public.mobilization_intelligence_summary(text, text, text) to authenticated;
