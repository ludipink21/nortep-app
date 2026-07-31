-- NorteP Pesquisa · a estrutura dos questionários pertence à conta fundadora.
-- Administradores e coordenadores continuam acompanhando e liberando a coleta.

begin;

create or replace function public.protect_survey_structure_for_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_primary_admin() then
    raise exception 'Somente a administradora fundadora pode alterar a estrutura das perguntas.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists survey_questions_founder_guard on public.survey_questions;
create trigger survey_questions_founder_guard
before insert or update or delete on public.survey_questions
for each row execute function public.protect_survey_structure_for_founder();

revoke all on function public.protect_survey_structure_for_founder() from public, anon, authenticated;
grant execute on function public.protect_survey_structure_for_founder() to service_role;

commit;
