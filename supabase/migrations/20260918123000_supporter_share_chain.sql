-- NorteP · cadeia automática de compartilhamento da rede de apoio.
-- Mantém somente links oficiais para apoiadores iniciais e cria identificadores automáticos
-- para os compartilhamentos feitos por participantes, sem exigir e-mail ou conta.

begin;

alter table public.mobilization_responses
  add column if not exists referrer_response_id uuid references public.mobilization_responses(id) on delete set null,
  add column if not exists share_code text,
  add column if not exists state text;

update public.mobilization_responses
set share_code = upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12))
where share_code is null;

alter table public.mobilization_responses
  alter column share_code set default upper(substr(encode(gen_random_bytes(9), 'hex'), 1, 12));

create unique index if not exists mobilization_responses_share_code_unique
  on public.mobilization_responses(share_code);

create index if not exists mobilization_responses_referrer_idx
  on public.mobilization_responses(referrer_response_id)
  where referrer_response_id is not null;

create index if not exists mobilization_responses_state_city_idx
  on public.mobilization_responses(state, city);

create or replace function public.submit_public_mobilization_response_v2(
  p_code text,
  p_answers jsonb,
  p_name text default null,
  p_whatsapp text default null,
  p_contact_consent boolean default false,
  p_content_opt_in boolean default false,
  p_meetings_opt_in boolean default false,
  p_volunteer_opt_in boolean default false,
  p_city text default null,
  p_state text default null,
  p_region text default null,
  p_neighborhood text default null,
  p_referrer_share_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.mobilization_partners;
  v_survey public.surveys;
  v_response public.mobilization_responses;
  v_parent_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_whatsapp text := nullif(trim(coalesce(p_whatsapp, '')), '');
begin
  select * into v_partner
  from public.mobilization_partners
  where public_code = trim(coalesce(p_code, ''))
    and active;

  if v_partner.id is null then
    raise exception 'Este link não está ativo.';
  end if;

  select * into v_survey
  from public.surveys
  where survey_type = 'relationship'
    and status in ('pilot', 'active')
    and archived_at is null
  order by updated_at desc
  limit 1;

  if v_survey.id is null then
    raise exception 'Formulário de relacionamento indisponível.';
  end if;

  if not coalesce(p_contact_consent, false) then
    raise exception 'É necessário aceitar o aviso de privacidade para enviar.';
  end if;

  if v_name is null then
    raise exception 'Informe seu nome.';
  end if;

  if v_whatsapp is null then
    raise exception 'Informe um WhatsApp para contato.';
  end if;

  if nullif(trim(coalesce(p_city, '')), '') is null then
    raise exception 'Informe sua cidade.';
  end if;

  if nullif(trim(coalesce(p_state, '')), '') is null then
    raise exception 'Informe seu estado (UF).';
  end if;

  if nullif(trim(coalesce(p_neighborhood, '')), '') is null then
    raise exception 'Informe seu bairro.';
  end if;

  if nullif(trim(coalesce(p_referrer_share_code, '')), '') is not null then
    select id into v_parent_id
    from public.mobilization_responses
    where share_code = upper(trim(p_referrer_share_code))
      and partner_id = v_partner.id
    limit 1;
  end if;

  insert into public.mobilization_responses (
    partner_id,
    survey_id,
    answers,
    city,
    state,
    region,
    neighborhood,
    privacy_consent,
    content_opt_in,
    meetings_opt_in,
    volunteer_opt_in,
    academic_consent,
    referrer_response_id
  ) values (
    v_partner.id,
    v_survey.id,
    coalesce(p_answers, '{}'::jsonb),
    nullif(trim(coalesce(p_city, '')), ''),
    upper(left(trim(coalesce(p_state, '')), 2)),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    true,
    coalesce(p_content_opt_in, false),
    coalesce(p_meetings_opt_in, false),
    coalesce(p_volunteer_opt_in, false),
    false,
    v_parent_id
  )
  returning * into v_response;

  insert into public.mobilization_contacts (
    response_id,
    respondent_name,
    whatsapp,
    email,
    contact_consent
  ) values (
    v_response.id,
    v_name,
    v_whatsapp,
    null,
    true
  );

  return jsonb_build_object(
    'code', v_response.code,
    'share_code', v_response.share_code,
    'video_url', coalesce(v_partner.thank_you_video_url, v_survey.thank_you_video_url),
    'linked_to_previous_share', v_parent_id is not null
  );
end;
$$;

create or replace function public.list_mobilization_share_network()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.can_manage_mobilization() then
    raise exception 'Acesso não autorizado.';
  end if;

  with recursive network as (
    select
      r.id,
      r.partner_id,
      r.referrer_response_id,
      r.share_code,
      r.city,
      r.state,
      r.region,
      r.neighborhood,
      r.content_opt_in,
      r.meetings_opt_in,
      r.volunteer_opt_in,
      r.created_at,
      0::integer as depth
    from public.mobilization_responses r
    where r.referrer_response_id is null

    union all

    select
      child.id,
      child.partner_id,
      child.referrer_response_id,
      child.share_code,
      child.city,
      child.state,
      child.region,
      child.neighborhood,
      child.content_opt_in,
      child.meetings_opt_in,
      child.volunteer_opt_in,
      child.created_at,
      parent.depth + 1
    from public.mobilization_responses child
    join network parent on parent.id = child.referrer_response_id
  )
  select jsonb_build_object(
    'supporters',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'kind', p.kind,
          'code', p.public_code,
          'active', p.active,
          'city', p.city,
          'region', p.region,
          'neighborhood', p.neighborhood,
          'responses', (select count(*) from public.mobilization_responses r where r.partner_id = p.id),
          'content_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.content_opt_in),
          'shares_tracked', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.referrer_response_id is not null),
          'cities', (select count(distinct concat_ws('|', coalesce(r.state,''), coalesce(r.city,''))) from public.mobilization_responses r where r.partner_id = p.id and nullif(r.city,'') is not null)
        )
        order by p.created_at asc
      )
      from public.mobilization_partners p
      where p.active
    ), '[]'::jsonb),

    'nodes',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'partner_id', n.partner_id,
          'parent_response_id', n.referrer_response_id,
          'name', coalesce(nullif(trim(mc.respondent_name), ''), 'Participante'),
          'city', n.city,
          'state', n.state,
          'region', n.region,
          'neighborhood', n.neighborhood,
          'content_opt_in', n.content_opt_in,
          'meetings_opt_in', n.meetings_opt_in,
          'volunteer_opt_in', n.volunteer_opt_in,
          'depth', n.depth,
          'children', (select count(*) from public.mobilization_responses c where c.referrer_response_id = n.id),
          'created_at', n.created_at
        )
        order by n.created_at asc
      )
      from network n
      left join public.mobilization_contacts mc on mc.response_id = n.id
    ), '[]'::jsonb),

    'territories',
    coalesce((
      select jsonb_agg(row_to_json(t) order by t.responses desc, t.state, t.city)
      from (
        select
          coalesce(nullif(state,''), '—') as state,
          coalesce(nullif(city,''), 'Cidade não informada') as city,
          count(*)::integer as responses
        from public.mobilization_responses
        group by 1,2
      ) t
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.submit_public_mobilization_response_v2(text,jsonb,text,text,boolean,boolean,boolean,boolean,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_public_mobilization_response_v2(text,jsonb,text,text,boolean,boolean,boolean,boolean,text,text,text,text,text)
  to anon, authenticated, service_role;

revoke all on function public.list_mobilization_share_network()
  from public, anon, authenticated;
grant execute on function public.list_mobilization_share_network()
  to authenticated, service_role;

-- Quatro apoiadoras oficiais iniciais informadas pela administradora.
-- O e-mail não é necessário para a criação desses links.
do $$
declare
  v_creator uuid;
begin
  select id into v_creator
  from public.profiles
  where role = 'admin'
    and active
    and access_removed_at is null
  order by coalesce(is_primary_admin, false) desc, created_at asc
  limit 1;

  if v_creator is not null then
    insert into public.mobilization_partners(name, kind, public_code, created_by)
    select seed.name, 'apoiador', seed.code, v_creator
    from (
      values
        ('Rafaela Silva', 'RAF26-4B9C2D'),
        ('Tatiane Campinhota', 'TAT26-7M4K8Q'),
        ('Vanderneide', 'VAN26-3P8R5S'),
        ('Jésica Campos', 'JES26-6T2H9L')
    ) as seed(name, code)
    where not exists (
      select 1
      from public.mobilization_partners existing
      where lower(trim(existing.name)) = lower(trim(seed.name))
    )
    on conflict (public_code) do nothing;
  end if;
end;
$$;

commit;
