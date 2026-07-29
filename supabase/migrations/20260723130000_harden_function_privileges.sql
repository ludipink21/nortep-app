-- NorteP Pesquisa · endurecimento de permissões de funções.
-- Remove a execução anônima herdada de PUBLIC e devolve somente o mínimo
-- necessário aos usuários autenticados e ao service_role.

begin;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

grant usage on schema public to authenticated, service_role;
grant execute on all functions in schema public to service_role;

-- Funções usadas diretamente pelo aplicativo ou pelas políticas RLS.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_full_admin() to authenticated;
grant execute on function public.is_observer() to authenticated;
grant execute on function public.ensure_own_profile() to authenticated;
grant execute on function public.redeem_access_invite(text) to authenticated;
grant execute on function public.create_access_invite(text, text) to authenticated;
grant execute on function public.observer_summary() to authenticated;
grant execute on function public.manage_profile_access(uuid, boolean) to authenticated;
grant execute on function public.remove_profile_access(uuid) to authenticated;
grant execute on function public.upsert_survey_admin(uuid, text, text, text, text, integer, text, boolean, text[], text[], text[], jsonb) to authenticated;
grant execute on function public.set_survey_assignments_admin(uuid, uuid[], text, text, text, text) to authenticated;
grant execute on function public.delete_or_archive_survey_admin(uuid) to authenticated;
grant execute on function public.clear_test_data_admin(uuid) to authenticated;

-- Funções de gatilho executadas durante a coleta autenticada.
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.set_interview_quality() to authenticated;
grant execute on function public.set_field_event_test_mode() to authenticated;

-- Elimina o aviso de search_path mutável sem alterar a lógica do gatilho.
alter function public.set_updated_at() set search_path = pg_catalog;

commit;
