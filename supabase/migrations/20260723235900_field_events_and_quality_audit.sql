-- NorteP Pesquisa · registra ocorrências em testes administrativos e amplia auditoria.
-- Não remove nem altera entrevistas existentes.

begin;

drop policy if exists field_events_insert_own on public.field_events;
create policy field_events_insert_own on public.field_events for insert to authenticated
with check (
  researcher_id = auth.uid()
  and public.is_active_user()
  and (
    public.is_admin()
    or exists (
      select 1 from public.survey_assignments a
      where a.survey_id = survey_id and a.researcher_id = auth.uid() and a.active
    )
  )
);

create or replace function public.set_interview_quality()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_minutes integer := 10;
  v_test boolean := false;
  v_flags jsonb := '[]'::jsonb;
  v_vote_key text;
begin
  select estimated_minutes, is_test into v_minutes, v_test
  from public.surveys where id = new.survey_id;

  new.is_test := coalesce(v_test, false);
  if new.status = 'completed' then
    if new.duration_seconds is not null
       and new.duration_seconds < greatest(60, coalesce(v_minutes, 10) * 18) then
      v_flags := v_flags || jsonb_build_array('muito_rapida');
    end if;

    foreach v_vote_key in array array['votoFederal','votoEstadual','votoSenador1','votoSenador2','votoGovernador','votoPresidente']
    loop
      if new.responses ? v_vote_key
         and length(trim(coalesce(new.responses ->> v_vote_key, ''))) = 1 then
        v_flags := v_flags || jsonb_build_array('resposta_muito_curta');
        exit;
      end if;
    end loop;

    if exists (
      select 1 from public.interviews i
      where i.id is distinct from new.id
        and i.survey_id = new.survey_id
        and i.researcher_id = new.researcher_id
        and i.status = 'completed'
        and i.responses = new.responses
        and i.created_at > now() - interval '24 hours'
    ) then
      v_flags := v_flags || jsonb_build_array('possivel_repetida');
    end if;
  end if;
  new.quality_flags := (select coalesce(jsonb_agg(distinct value), '[]'::jsonb) from jsonb_array_elements(v_flags));
  return new;
end;
$$;

revoke all on function public.set_interview_quality() from public, anon;
grant execute on function public.set_interview_quality() to authenticated, service_role;

commit;
