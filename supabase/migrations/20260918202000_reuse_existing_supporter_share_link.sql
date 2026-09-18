-- NorteP · impede novo cadastro da mesma pessoa no mesmo formulário e reaproveita o link existente.
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
set search_path = ''
as $function$
declare
  v_partner public.mobilization_partners;
  v_survey public.surveys;
  v_response public.mobilization_responses;
  v_parent_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_whatsapp text := nullif(trim(coalesce(p_whatsapp, '')), '');
  v_fingerprint text;
  v_existing_origin_code text;
  v_existing_video_url text;
begin
  select * into v_partner
  from public.mobilization_partners
  where public_code = trim(coalesce(p_code, ''))
    and active
    and archived_at is null;

  if v_partner.id is null then raise exception 'Este link não está ativo.'; end if;

  select * into v_survey
  from public.surveys
  where survey_type = 'relationship'
    and status in ('pilot', 'active')
    and archived_at is null
  order by updated_at desc
  limit 1;

  if v_survey.id is null then raise exception 'Formulário de relacionamento indisponível.'; end if;
  if not coalesce(p_contact_consent, false) then raise exception 'É necessário aceitar o aviso de privacidade para enviar.'; end if;
  if v_name is null then raise exception 'Informe seu nome.'; end if;
  if v_whatsapp is null then raise exception 'Informe um WhatsApp para contato.'; end if;
  if nullif(trim(coalesce(p_city, '')), '') is null then raise exception 'Informe sua cidade.'; end if;
  if nullif(trim(coalesce(p_state, '')), '') is null then raise exception 'Informe seu estado (UF).'; end if;
  if nullif(trim(coalesce(p_neighborhood, '')), '') is null then raise exception 'Informe seu bairro.'; end if;

  v_fingerprint := private.mobilization_contact_fingerprint(v_whatsapp, null);

  if v_fingerprint is not null then
    select r.* into v_response
    from public.mobilization_responses r
    join public.mobilization_contacts c on c.response_id = r.id
    join public.mobilization_partners p on p.id = r.partner_id
    where c.contact_fingerprint = v_fingerprint
      and r.survey_id = v_survey.id
      and p.archived_at is null
    order by r.created_at asc
    limit 1;

    if v_response.id is not null then
      select p.public_code, p.thank_you_video_url
      into v_existing_origin_code, v_existing_video_url
      from public.mobilization_partners p
      where p.id = v_response.partner_id;

      return jsonb_build_object(
        'code', v_response.code,
        'share_code', v_response.share_code,
        'origin_code', v_existing_origin_code,
        'video_url', coalesce(v_existing_video_url, v_survey.thank_you_video_url),
        'linked_to_previous_share', v_response.referrer_response_id is not null,
        'already_registered', true
      );
    end if;
  end if;

  if nullif(trim(coalesce(p_referrer_share_code, '')), '') is not null then
    select id into v_parent_id
    from public.mobilization_responses
    where share_code = upper(trim(p_referrer_share_code))
      and partner_id = v_partner.id
    limit 1;
  end if;

  insert into public.mobilization_responses (
    partner_id, survey_id, answers, city, state, region, neighborhood,
    privacy_consent, content_opt_in, meetings_opt_in, volunteer_opt_in,
    academic_consent, referrer_response_id
  ) values (
    v_partner.id, v_survey.id, coalesce(p_answers, '{}'::jsonb),
    nullif(trim(coalesce(p_city, '')), ''),
    upper(left(trim(coalesce(p_state, '')), 2)),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_neighborhood, '')), ''),
    true, coalesce(p_content_opt_in, false), coalesce(p_meetings_opt_in, false),
    coalesce(p_volunteer_opt_in, false), false, v_parent_id
  ) returning * into v_response;

  insert into public.mobilization_contacts (
    response_id, respondent_name, whatsapp, email, contact_consent, contact_fingerprint
  ) values (
    v_response.id, v_name, v_whatsapp, null, true, v_fingerprint
  );

  return jsonb_build_object(
    'code', v_response.code,
    'share_code', v_response.share_code,
    'origin_code', v_partner.public_code,
    'video_url', coalesce(v_partner.thank_you_video_url, v_survey.thank_you_video_url),
    'linked_to_previous_share', v_parent_id is not null,
    'already_registered', false
  );
end;
$function$;

revoke all on function public.submit_public_mobilization_response_v2(text,jsonb,text,text,boolean,boolean,boolean,boolean,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_public_mobilization_response_v2(text,jsonb,text,text,boolean,boolean,boolean,boolean,text,text,text,text,text)
  to anon, authenticated, service_role;
