-- NorteP Pesquisa · perfil observador somente leitura

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check (role in ('admin', 'coordenador', 'pesquisador', 'observador'));

alter table public.access_invites drop constraint if exists access_invites_role_check;
alter table public.access_invites add constraint access_invites_role_check
check (role in ('admin', 'coordenador', 'observador'));

create or replace function public.is_observer()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'observador' and active
  );
$$;

revoke all on function public.is_observer() from public;
grant execute on function public.is_observer() to authenticated;

create or replace function public.create_access_invite(p_email text, p_role text default 'observador')
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_actor_role text;
  v_code text := encode(gen_random_bytes(18), 'hex');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_invite_id uuid;
begin
  select role into v_actor_role
  from public.profiles
  where id = auth.uid() and active and role in ('admin', 'coordenador');

  if v_actor_role is null then
    raise exception 'Acesso administrativo não autorizado.';
  end if;
  if p_role not in ('admin', 'coordenador', 'observador') then
    raise exception 'Função de acesso inválida.';
  end if;
  if v_actor_role = 'coordenador' and p_role in ('admin', 'coordenador') then
    raise exception 'Coordenadores podem convidar somente observadores.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  update public.access_invites
  set revoked_at = now()
  where lower(email) = v_email and role = p_role
    and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (email, role, token_hash, created_by, expires_at)
  values (v_email, p_role, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(), now() + interval '72 hours')
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'role', p_role, 'expires_in_hours', 72));

  return v_code;
end;
$$;

create or replace function public.observer_summary()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (public.is_observer() or public.is_admin()) then
    raise exception 'Acesso de observação não autorizado.';
  end if;

  select jsonb_build_object(
    'total_interviews', (select count(*) from public.interviews where status = 'completed'),
    'interviews_today', (select count(*) from public.interviews where status = 'completed' and completed_at >= current_date),
    'active_researchers', (select count(distinct researcher_id) from public.interviews where status = 'completed'),
    'active_surveys', (select count(*) from public.surveys where status in ('pilot', 'active')),
    'updated_at', (select max(completed_at) from public.interviews where status = 'completed'),
    'surveys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'status', s.status,
        'interviews', (select count(*) from public.interviews i where i.survey_id = s.id and i.status = 'completed'),
        'researchers', (select count(distinct i.researcher_id) from public.interviews i where i.survey_id = s.id and i.status = 'completed')
      ) order by s.created_at desc)
      from public.surveys s
      where s.status in ('pilot', 'active')
    ), '[]'::jsonb)
  ) into v_result;

  insert into public.audit_events (actor_id, action, entity, metadata)
  values (auth.uid(), 'observer_summary_viewed', 'dashboard', jsonb_build_object('aggregated_only', true));

  return v_result;
end;
$$;

revoke all on function public.observer_summary() from public;
grant execute on function public.observer_summary() to authenticated;
