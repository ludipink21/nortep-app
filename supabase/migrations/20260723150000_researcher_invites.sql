-- NorteP Pesquisa · convite individual também para pesquisador.
-- Não altera usuários nem pesquisas existentes.

begin;

alter table public.access_invites drop constraint if exists access_invites_role_check;
alter table public.access_invites add constraint access_invites_role_check
check (role in ('admin', 'coordenador', 'pesquisador', 'observador'));

create or replace function public.create_access_invite(p_email text, p_role text default 'pesquisador')
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

  if v_actor_role is null then raise exception 'Acesso administrativo não autorizado.'; end if;
  if p_role not in ('admin', 'coordenador', 'pesquisador', 'observador') then raise exception 'Função de acesso inválida.'; end if;
  if v_actor_role = 'coordenador' and p_role in ('admin', 'coordenador') then raise exception 'Coordenadores podem convidar somente pesquisadores ou observadores.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Informe um e-mail válido.'; end if;

  update public.access_invites set revoked_at = now()
  where lower(email) = v_email and role = p_role and used_at is null and revoked_at is null and expires_at > now();

  insert into public.access_invites (email, role, token_hash, created_by, expires_at)
  values (v_email, p_role, encode(digest(v_code, 'sha256'), 'hex'), auth.uid(), now() + interval '72 hours')
  returning id into v_invite_id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_created', 'access_invite', v_invite_id::text,
    jsonb_build_object('email', v_email, 'role', p_role, 'expires_in_hours', 72));
  return v_code;
end;
$$;

revoke all on function public.create_access_invite(text, text) from public, anon;
grant execute on function public.create_access_invite(text, text) to authenticated, service_role;

commit;
