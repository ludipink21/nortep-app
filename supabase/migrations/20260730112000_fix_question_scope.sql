-- Corrige o escopo das perguntas: o pesquisador vê somente perguntas
-- das pesquisas explicitamente liberadas para sua conta.

begin;

drop policy if exists questions_read_visible_survey on public.survey_questions;
create policy questions_read_visible_survey
on public.survey_questions for select to authenticated
using (
  public.is_full_admin()
  or public.manager_can_access_survey(survey_id)
  or exists (
    select 1
    from public.survey_assignments a
    where a.survey_id = survey_questions.survey_id
      and a.researcher_id = auth.uid()
      and a.active
  )
);

commit;
