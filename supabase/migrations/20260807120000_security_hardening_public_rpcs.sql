-- Reduz a superficie de execucao publica sem quebrar formularios sem login.
revoke execute on function public.create_social_quiz_link(text,text,text,text) from anon;
revoke execute on function public.list_social_quiz_links() from anon;
revoke execute on function public.set_social_quiz_link_active(uuid,boolean) from anon;
revoke execute on function public.social_quiz_summary() from anon;

-- Funcoes internas de trigger/event trigger nao devem ser chamadas pelo cliente autenticado.
revoke execute on function public.assign_pilot_surveys_on_activation() from authenticated;
revoke execute on function public.set_field_event_test_mode() from authenticated;
revoke execute on function public.set_interview_quality() from authenticated;
revoke execute on function public.rls_auto_enable() from authenticated;

-- RPCs publicos necessarios para abrir/enviar formularios sem login.
grant execute on function public.get_social_quiz_form(text) to anon, authenticated;
grant execute on function public.record_social_quiz_event(text,text,text) to anon, authenticated;
grant execute on function public.submit_social_quiz_response(text,text,jsonb) to anon, authenticated;
grant execute on function public.submit_social_quiz_contact(text,text,text,text,text) to anon, authenticated;
grant execute on function public.get_public_mobilization_form(text) to anon, authenticated;
grant execute on function public.submit_public_mobilization_response(text,jsonb,text,text,text,boolean,boolean,boolean,boolean,boolean,text,text,text) to anon, authenticated;
