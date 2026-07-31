-- NorteP Pesquisa · recupera perfis de contas de login já existentes.
-- Contas recuperadas permanecem bloqueadas até aprovação da administração.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_initial_admin boolean := lower(coalesce(new.email, '')) = 'bussolanortep@gmail.com';
begin
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    lower(coalesce(new.email, '')),
    case when is_initial_admin then 'admin' else 'pesquisador' end,
    is_initial_admin
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Repara somente as contas que não ganharam perfil. Nenhuma é aprovada aqui.
insert into public.profiles (id, name, email, role, active)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(users.email, ''), '@', 1)
  ),
  lower(coalesce(users.email, '')),
  'pesquisador',
  false
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

-- Rede de proteção: uma conta autenticada pode recriar somente o próprio
-- perfil ausente, sempre como pesquisador bloqueado.
create or replace function public.ensure_own_profile()
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;

  insert into public.profiles (id, name, email, role, active)
  values (
    auth.uid(),
    coalesce(
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'name'), ''),
      nullif(trim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''),
      split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
    ),
    lower(coalesce(auth.jwt() ->> 'email', '')),
    'pesquisador',
    false
  )
  on conflict (id) do nothing;

  select * into result from public.profiles where id = auth.uid();
  return result;
end;
$$;

revoke all on function public.ensure_own_profile() from public;
grant execute on function public.ensure_own_profile() to authenticated;

select
  (select count(*) from auth.users) as contas_de_login,
  (select count(*) from public.profiles) as perfis_no_app,
  (select count(*) from public.profiles where role = 'pesquisador' and not active) as aguardando_aprovacao;
