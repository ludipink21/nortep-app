-- NorteP Pesquisa · permite iniciar com segurança uma instalação vazia.
-- A conta institucional oficial recebe a função de administradora principal
-- somente quando o próprio usuário é criado pelo Supabase Auth.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_is_primary_admin boolean := v_email = 'bussolanortep@gmail.com';
begin
  insert into public.profiles (
    id,
    name,
    email,
    role,
    active,
    is_primary_admin,
    access_removed_at
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(v_email, '@', 1)
    ),
    v_email,
    case when v_is_primary_admin then 'admin' else 'pesquisador' end,
    v_is_primary_admin,
    v_is_primary_admin,
    null
  )
  on conflict (id) do update
  set
    name = case
      when trim(public.profiles.name) = '' then excluded.name
      else public.profiles.name
    end,
    email = excluded.email,
    role = case
      when v_is_primary_admin then 'admin'
      else public.profiles.role
    end,
    active = case
      when v_is_primary_admin then true
      else public.profiles.active
    end,
    is_primary_admin = case
      when v_is_primary_admin then true
      else public.profiles.is_primary_admin
    end,
    access_removed_at = case
      when v_is_primary_admin then null
      else public.profiles.access_removed_at
    end,
    updated_at = now();

  if v_is_primary_admin then
    insert into public.survey_assignments (survey_id, researcher_id, active)
    select id, new.id, true
    from public.surveys
    where status in ('pilot', 'active')
    on conflict (survey_id, researcher_id)
    do update set active = true;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Repara a mesma conta caso ela tenha sido criada durante uma publicação
-- anterior, sem alterar qualquer outro usuário.
update public.profiles
set
  role = 'admin',
  active = true,
  is_primary_admin = true,
  access_removed_at = null,
  updated_at = now()
where lower(email) = 'bussolanortep@gmail.com';

insert into public.survey_assignments (survey_id, researcher_id, active)
select surveys.id, profiles.id, true
from public.surveys as surveys
cross join public.profiles as profiles
where lower(profiles.email) = 'bussolanortep@gmail.com'
  and surveys.status in ('pilot', 'active')
on conflict (survey_id, researcher_id)
do update set active = true;

commit;
