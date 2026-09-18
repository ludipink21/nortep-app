-- Convites pré-autorizados de administrador e candidata podem confirmar a conta
-- sem exigir uma segunda validação por e-mail.
create or replace function public.confirm_invited_account(
  p_code text,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $function$
declare
  v_invite public.access_invites%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido.';
  end if;

  select * into v_invite
  from public.access_invites
  where token_hash = encode(digest(trim(coalesce(p_code, '')), 'sha256'), 'hex')
    and lower(email) = v_email
    and used_at is null
    and revoked_at is null
    and expires_at > now()
    and (
      role = 'admin'
      or (role = 'observador' and observer_mode = 'candidato')
    )
  limit 1;

  if v_invite.id is null then
    raise exception 'Convite não autoriza confirmação automática.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = v_email
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'Crie a conta com este e-mail antes de continuar.';
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      confirmed_at = coalesce(confirmed_at, now()),
      confirmation_token = '',
      updated_at = now()
  where id = v_user_id;

  update auth.identities
  set identity_data = jsonb_set(
        coalesce(identity_data, '{}'::jsonb),
        '{email_verified}',
        'true'::jsonb,
        true
      ),
      updated_at = now()
  where user_id = v_user_id
    and provider = 'email';

  return true;
end;
$function$;

revoke all on function public.confirm_invited_account(text,text) from public;
grant execute on function public.confirm_invited_account(text,text) to anon, authenticated, service_role;
