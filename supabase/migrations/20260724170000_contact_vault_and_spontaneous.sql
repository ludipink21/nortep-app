-- NorteP Pesquisa: cofre separado para contatos autorizados.
-- Os dados de contato deixam de ficar na tabela de entrevistas acessível ao painel comum.
create extension if not exists pgcrypto;

create table if not exists public.contact_vault (
  interview_id uuid primary key references public.interviews(id) on delete cascade,
  respondent_name text,
  contact_choice text,
  contact_whatsapp text,
  contact_email text,
  contact_consent boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_access_grants (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default true,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.vault_keys (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  key_hash text not null,
  configured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.contact_vault enable row level security;
alter table public.vault_access_grants enable row level security;
alter table public.vault_keys enable row level security;
alter table public.vault_sessions enable row level security;

-- Move apenas os contatos que já possuíam consentimento e, em seguida, tira-os da entrevista comum.
insert into public.contact_vault (interview_id, respondent_name, contact_choice, contact_whatsapp, contact_email, contact_consent, created_by)
select i.id, i.respondent_name, i.contact_choice, i.contact_whatsapp, i.contact_email, true, i.researcher_id
from public.interviews i
where i.contact_consent is true
  and (nullif(trim(coalesce(i.respondent_name, '')), '') is not null
    or nullif(trim(coalesce(i.contact_whatsapp, '')), '') is not null
    or nullif(trim(coalesce(i.contact_email, '')), '') is not null)
on conflict (interview_id) do nothing;

update public.interviews
set respondent_name = null,
    contact_choice = null,
    contact_whatsapp = null,
    contact_email = null
where contact_consent is true
  and (respondent_name is not null or contact_choice is not null or contact_whatsapp is not null or contact_email is not null);

-- A administradora principal recebe somente a autorização inicial; a chave pessoal é criada por ela no app.
insert into public.vault_access_grants (profile_id, active, granted_by)
select p.id, true, p.id
from public.profiles p
where p.is_primary_admin is true and p.active is true and p.access_removed_at is null
on conflict (profile_id) do nothing;

create or replace function public.store_interview_contact(
  p_interview_id uuid,
  p_name text,
  p_choice text,
  p_whatsapp text,
  p_email text,
  p_consent boolean
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not p_consent then raise exception 'Contato sem consentimento não pode ser armazenado.'; end if;
  if not exists (select 1 from public.interviews where id = p_interview_id and researcher_id = auth.uid()) then
    raise exception 'Entrevista não pertence ao usuário atual.';
  end if;
  if nullif(trim(coalesce(p_name, '')), '') is null
     and nullif(trim(coalesce(p_whatsapp, '')), '') is null
     and nullif(trim(coalesce(p_email, '')), '') is null then return; end if;
  insert into public.contact_vault (interview_id, respondent_name, contact_choice, contact_whatsapp, contact_email, contact_consent, created_by, updated_at)
  values (p_interview_id, nullif(trim(p_name), ''), nullif(trim(p_choice), ''), nullif(trim(p_whatsapp), ''), nullif(trim(p_email), ''), true, auth.uid(), now())
  on conflict (interview_id) do update set respondent_name=excluded.respondent_name, contact_choice=excluded.contact_choice,
    contact_whatsapp=excluded.contact_whatsapp, contact_email=excluded.contact_email, contact_consent=true, updated_at=now();
end; $$;

create or replace function public.grant_vault_access(p_profile_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_full_admin() then raise exception 'Somente a administração pode gerir o Cofre de Contatos.'; end if;
  if not exists (select 1 from public.profiles where id=p_profile_id and active and access_removed_at is null) then raise exception 'Perfil ativo não encontrado.'; end if;
  insert into public.vault_access_grants(profile_id, active, granted_by, granted_at, revoked_at)
  values(p_profile_id, p_active, auth.uid(), now(), case when p_active then null else now() end)
  on conflict(profile_id) do update set active=excluded.active, granted_by=auth.uid(), granted_at=case when p_active then now() else vault_access_grants.granted_at end, revoked_at=case when p_active then null else now() end;
  delete from public.vault_sessions where profile_id=p_profile_id;
  insert into public.audit_events(actor_id, action, entity, entity_id, metadata)
  values(auth.uid(), case when p_active then 'vault_access_granted' else 'vault_access_revoked' end, 'contact_vault', p_profile_id::text, '{}'::jsonb);
end; $$;

create or replace function public.setup_own_vault_key(p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_key,'')) < 12 then raise exception 'Use uma chave com pelo menos 12 caracteres.'; end if;
  if not exists(select 1 from public.vault_access_grants where profile_id=auth.uid() and active) then raise exception 'Você não tem acesso ao Cofre de Contatos.'; end if;
  insert into public.vault_keys(profile_id,key_hash) values(auth.uid(), crypt(p_key, gen_salt('bf')))
  on conflict(profile_id) do update set key_hash=excluded.key_hash, updated_at=now();
  delete from public.vault_sessions where profile_id=auth.uid();
  insert into public.audit_events(actor_id, action, entity, entity_id, metadata) values(auth.uid(),'vault_key_configured','contact_vault',auth.uid()::text,'{}');
end; $$;

create or replace function public.unlock_contact_vault(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_hash text; v_token text := encode(gen_random_bytes(32), 'hex'); v_expiry timestamptz := now() + interval '20 minutes';
begin
  if not exists(select 1 from public.vault_access_grants where profile_id=auth.uid() and active) then raise exception 'Você não tem acesso ao Cofre de Contatos.'; end if;
  select key_hash into v_hash from public.vault_keys where profile_id=auth.uid();
  if v_hash is null then raise exception 'Crie primeiro sua chave individual do cofre.'; end if;
  if crypt(coalesce(p_key,''), v_hash) <> v_hash then raise exception 'Chave do cofre inválida.'; end if;
  delete from public.vault_sessions where profile_id=auth.uid() or expires_at < now();
  insert into public.vault_sessions(profile_id,token_hash,expires_at) values(auth.uid(), encode(digest(v_token,'sha256'),'hex'),v_expiry);
  insert into public.audit_events(actor_id, action, entity, entity_id, metadata) values(auth.uid(),'vault_opened','contact_vault',auth.uid()::text,jsonb_build_object('expires_at',v_expiry));
  return jsonb_build_object('token',v_token,'expires_at',v_expiry);
end; $$;

create or replace function public.list_vault_contacts(p_token text, p_limit integer default 100)
returns table(interview_id uuid, respondent_name text, contact_choice text, contact_whatsapp text, contact_email text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.vault_sessions where profile_id=auth.uid() and token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and expires_at > now()) then raise exception 'Cofre bloqueado ou sessão expirada.'; end if;
  insert into public.audit_events(actor_id,action,entity,entity_id,metadata) values(auth.uid(),'vault_contacts_viewed','contact_vault',auth.uid()::text,jsonb_build_object('limit',least(greatest(coalesce(p_limit,100),1),250)));
  return query select c.interview_id,c.respondent_name,c.contact_choice,c.contact_whatsapp,c.contact_email,c.created_at from public.contact_vault c order by c.created_at desc limit least(greatest(coalesce(p_limit,100),1),250);
end; $$;

create or replace function public.list_vault_audit()
returns table(actor_name text, actor_email text, action text, occurred_at timestamptz)
language sql security definer set search_path = public as $$
  select p.name,p.email,a.action,a.created_at from public.audit_events a join public.profiles p on p.id=a.actor_id
  where public.is_full_admin() and a.entity='contact_vault' order by a.created_at desc limit 100;
$$;

revoke all on table public.contact_vault, public.vault_access_grants, public.vault_keys, public.vault_sessions from anon, authenticated;
revoke all on function public.store_interview_contact(uuid,text,text,text,text,boolean) from public;
revoke all on function public.grant_vault_access(uuid,boolean) from public;
revoke all on function public.setup_own_vault_key(text) from public;
revoke all on function public.unlock_contact_vault(text) from public;
revoke all on function public.list_vault_contacts(text,integer) from public;
revoke all on function public.list_vault_audit() from public;
grant execute on function public.store_interview_contact(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.grant_vault_access(uuid,boolean) to authenticated;
grant execute on function public.setup_own_vault_key(text) to authenticated;
grant execute on function public.unlock_contact_vault(text) to authenticated;
grant execute on function public.list_vault_contacts(text,integer) to authenticated;
grant execute on function public.list_vault_audit() to authenticated;
