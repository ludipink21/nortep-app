-- NorteP Pesquisa · controle seguro da mobilização pelo candidato.
-- Preserva usuários, pesquisas, entrevistas e respostas.

begin;

create or replace function public.can_manage_mobilization()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active
      and access_removed_at is null
      and (
        role = 'admin'
        or (role = 'observador' and observer_mode = 'candidato')
      )
  );
$$;

create or replace function public.create_mobilization_partner(
  p_name text,
  p_kind text,
  p_city text default null,
  p_region text default null,
  p_neighborhood text default null,
  p_video_url text default null,
  p_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.mobilization_partners;
begin
  if not public.can_manage_mobilization() then
    raise exception 'Acesso de gestão da mobilização não autorizado.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Informe o nome do apoiador ou liderança.';
  end if;
  if p_kind not in ('apoiador', 'lideranca') then
    raise exception 'Tipo de parceiro inválido.';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.mobilization_partners where id = p_parent_id and active
  ) then
    raise exception 'A liderança que realizou a indicação não está ativa.';
  end if;

  insert into public.mobilization_partners (
    name, kind, city, region, neighborhood, thank_you_video_url, parent_id, created_by
  ) values (
    trim(p_name), p_kind, nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''), nullif(trim(coalesce(p_neighborhood, '')), ''),
    nullif(trim(coalesce(p_video_url, '')), ''), p_parent_id, auth.uid()
  ) returning * into v_partner;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), 'mobilization_partner_created', 'mobilization_partner', v_partner.id::text,
    jsonb_build_object('name', v_partner.name, 'kind', v_partner.kind, 'parent_id', p_parent_id)
  );

  return jsonb_build_object('id', v_partner.id, 'code', v_partner.public_code);
end;
$$;

create or replace function public.list_mobilization_partners()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when not public.can_manage_mobilization() then
      jsonb_build_object('error', 'Acesso não autorizado.')
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'kind', p.kind,
        'city', p.city,
        'region', p.region,
        'neighborhood', p.neighborhood,
        'code', p.public_code,
        'active', p.active,
        'video_url', p.thank_you_video_url,
        'parent_id', p.parent_id,
        'parent_name', parent.name,
        'responses', (select count(*) from public.mobilization_responses r where r.partner_id = p.id),
        'content_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.content_opt_in),
        'meetings_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.meetings_opt_in),
        'volunteer_opt_ins', (select count(*) from public.mobilization_responses r where r.partner_id = p.id and r.volunteer_opt_in),
        'referrals', (select count(*) from public.mobilization_partners child where child.parent_id = p.id and child.active),
        'last_response_at', (select max(r.created_at) from public.mobilization_responses r where r.partner_id = p.id)
      ) order by p.created_at asc)
      from public.mobilization_partners p
      left join public.mobilization_partners parent on parent.id = p.parent_id
    ), '[]'::jsonb)
  end;
$$;

create or replace function public.set_mobilization_partner_active(
  p_partner_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.mobilization_partners;
begin
  if not public.can_manage_mobilization() then
    raise exception 'Acesso de gestão da mobilização não autorizado.';
  end if;

  update public.mobilization_partners
  set active = p_active, updated_at = now()
  where id = p_partner_id
  returning * into v_partner;

  if v_partner.id is null then
    raise exception 'Apoiador ou liderança não encontrado.';
  end if;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(), case when p_active then 'mobilization_partner_reactivated' else 'mobilization_partner_paused' end,
    'mobilization_partner', v_partner.id::text, jsonb_build_object('active', p_active)
  );

  return jsonb_build_object('id', v_partner.id, 'active', v_partner.active);
end;
$$;

create or replace function public.candidate_operations_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_result jsonb;
begin
  select * into v_actor
  from public.profiles
  where id = auth.uid() and active and access_removed_at is null;

  if v_actor.id is null
     or not (
       v_actor.role = 'admin'
       or (v_actor.role = 'observador' and v_actor.observer_mode = 'candidato')
     ) then
    raise exception 'Acesso ao acompanhamento operacional não autorizado.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'role', p.role,
    'active', p.active,
    'territories', coalesce((
      select jsonb_agg(jsonb_build_object('type', pt.scope_type, 'value', pt.scope_value)
        order by pt.scope_type, pt.scope_value)
      from public.profile_territories pt
      where pt.profile_id = p.id and pt.active
    ), '[]'::jsonb),
    'team_members', (
      select count(*) from public.team_links tl
      where tl.manager_id = p.id and tl.active
    ),
    'interviews', (
      select count(*) from public.interviews i
      where i.researcher_id = p.id
    )
  ) order by
    case p.role when 'admin' then 1 when 'coordenador' then 2 else 3 end,
    p.name), '[]'::jsonb)
  into v_result
  from public.profiles p
  where p.role in ('admin', 'coordenador', 'supervisor')
    and p.access_removed_at is null
    and not coalesce(p.is_primary_admin, false);

  return v_result;
end;
$$;

revoke all on function public.can_manage_mobilization() from public, anon, authenticated;
revoke all on function public.create_mobilization_partner(text,text,text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.list_mobilization_partners() from public, anon, authenticated;
revoke all on function public.set_mobilization_partner_active(uuid,boolean) from public, anon, authenticated;
revoke all on function public.candidate_operations_summary() from public, anon, authenticated;

grant execute on function public.can_manage_mobilization() to authenticated, service_role;
grant execute on function public.create_mobilization_partner(text,text,text,text,text,text,uuid) to authenticated, service_role;
grant execute on function public.list_mobilization_partners() to authenticated, service_role;
grant execute on function public.set_mobilization_partner_active(uuid,boolean) to authenticated, service_role;
grant execute on function public.candidate_operations_summary() to authenticated, service_role;

commit;
