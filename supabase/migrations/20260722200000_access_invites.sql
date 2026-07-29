-- NorteP Pesquisa · convites administrativos seguros

create extension if not exists pgcrypto;

create table if not exists public.access_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin', 'coordenador')),
  token_hash text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists access_invites_email_idx on public.access_invites (lower(email));
create index if not exists access_invites_expires_idx on public.access_invites (expires_at);

alter table public.access_invites enable row level security;

drop policy if exists access_invites_admin_read on public.access_invites;
create policy access_invites_admin_read on public.access_invites
for select to authenticated using (public.is_admin());

revoke all on public.access_invites from anon, authenticated;
grant select on public.access_invites to authenticated;

create or replace function public.create_access_invite(p_email text, p_role text default 'coordenador')
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
  if p_role not in ('admin', 'coordenador') then
    raise exception 'Função de acesso inválida.';
  end if;
  if v_actor_role = 'coordenador' and p_role = 'admin' then
    raise exception 'Somente uma administradora pode convidar outra administradora.';
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

create or replace function public.redeem_access_invite(p_code text)
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_invite public.access_invites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Entre em sua conta para aceitar o convite.';
  end if;

  select * into v_invite
  from public.access_invites
  where token_hash = encode(digest(trim(coalesce(p_code, '')), 'sha256'), 'hex')
    and lower(email) = v_email
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_invite.id is null then
    raise exception 'Convite inválido, expirado ou destinado a outro e-mail.';
  end if;

  update public.profiles
  set role = v_invite.role, active = true, updated_at = now()
  where id = auth.uid() and lower(email) = v_email;

  if not found then
    raise exception 'Perfil não encontrado para este convite.';
  end if;

  update public.access_invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'invite_redeemed', 'access_invite', v_invite.id::text,
    jsonb_build_object('email', v_email, 'role', v_invite.role));

  return v_invite.role;
end;
$$;

revoke all on function public.create_access_invite(text, text) from public;
revoke all on function public.redeem_access_invite(text) from public;
grant execute on function public.create_access_invite(text, text) to authenticated;
grant execute on function public.redeem_access_invite(text) to authenticated;
