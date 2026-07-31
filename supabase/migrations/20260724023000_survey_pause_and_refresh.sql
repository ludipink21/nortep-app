-- NorteP Pesquisa · pausa segura de pesquisas
-- Pausar preserva perguntas, liberações, entrevistas e ocorrências.

begin;

create or replace function public.update_survey_status_admin(
  p_survey_id uuid,
  p_status text
)
returns public.surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey public.surveys;
begin
  if not public.is_full_admin() then
    raise exception 'Somente administradores podem alterar a situação da pesquisa.';
  end if;
  if p_status not in ('draft', 'pilot', 'active', 'closed') then
    raise exception 'Situação da pesquisa inválida.';
  end if;

  update public.surveys
  set status = p_status,
      archived_at = case when p_status = 'closed' then coalesce(archived_at, now()) else null end,
      updated_at = now()
  where id = p_survey_id
  returning * into v_survey;

  if v_survey.id is null then
    raise exception 'Pesquisa não encontrada.';
  end if;

  insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    case when p_status = 'draft' then 'survey_paused' else 'survey_status_updated' end,
    'survey',
    p_survey_id::text,
    jsonb_build_object('status', p_status, 'title', v_survey.title)
  );

  return v_survey;
end;
$$;

revoke all on function public.update_survey_status_admin(uuid, text) from public, anon;
grant execute on function public.update_survey_status_admin(uuid, text) to authenticated, service_role;

commit;
