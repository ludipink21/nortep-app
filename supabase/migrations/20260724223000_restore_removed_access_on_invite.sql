-- NorteP Pesquisa · reativação segura de uma conta removida por novo convite.
-- Preserva a conta, pesquisas, respostas e histórico de auditoria.

begin;

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
  set role = v_invite.role,
      active = true,
      access_removed_at = null,
      updated_at = now()
  where id = auth.uid() and lower(email) = v_email;

  if not found then
    raise exception 'Perfil não encontrado para este convite.';
  end if;

  update public.access_invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    'invite_redeemed',
    'access_invite',
    v_invite.id::text,
    jsonb_build_object('email', v_email, 'role', v_invite.role, 'reactivated', true)
  );

  return v_invite.role;
end;
$$;

revoke all on function public.redeem_access_invite(text) from public, anon;
grant execute on function public.redeem_access_invite(text) to authenticated, service_role;

commit;
