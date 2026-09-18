-- Preview pública mínima para links compartilhados.
-- Retorna somente o nome de exibição necessário para a prévia do link.
create or replace function public.get_public_mobilization_share_preview(
  p_code text,
  p_share_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_partner public.mobilization_partners;
  v_name text;
  v_share text := nullif(upper(trim(coalesce(p_share_code, ''))), '');
begin
  select * into v_partner
  from public.mobilization_partners
  where public_code = trim(coalesce(p_code, ''))
    and active
    and archived_at is null;

  if v_partner.id is null then
    return null;
  end if;

  v_name := v_partner.name;

  if v_share is not null then
    select split_part(trim(c.respondent_name), ' ', 1)
    into v_name
    from public.mobilization_responses r
    join public.mobilization_contacts c on c.response_id = r.id
    where r.partner_id = v_partner.id
      and r.share_code = v_share
      and nullif(trim(c.respondent_name), '') is not null
    limit 1;

    v_name := coalesce(nullif(trim(v_name), ''), v_partner.name);
  end if;

  return jsonb_build_object(
    'display_name', v_name,
    'partner_name', v_partner.name
  );
end;
$function$;

revoke all on function public.get_public_mobilization_share_preview(text,text)
  from public, anon, authenticated;
grant execute on function public.get_public_mobilization_share_preview(text,text)
  to anon, authenticated, service_role;
