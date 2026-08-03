-- Academia NorteP 4.0.0: jornada inicial de Pesquisa e Supervisão.
-- Migração aditiva: não remove usuários, entrevistas, pesquisas, respostas ou histórico V3.
-- Os índices de resposta permanecem exclusivamente em academy_lessons, sem leitura pelo navegador.

begin;

insert into public.academy_lessons (curriculum_version, role_key, lesson_id, correct_answer)
values
  ('4.0.0','comum','inicio-01',1),
  ('4.0.0','comum','inicio-02',1),
  ('4.0.0','comum','inicio-03',1),
  ('4.0.0','comum','inicio-04',0),
  ('4.0.0','pesquisador','pesq-v4-01',0),
  ('4.0.0','pesquisador','pesq-v4-02',1),
  ('4.0.0','pesquisador','pesq-v4-03',1),
  ('4.0.0','supervisor','sup-v4-01',0),
  ('4.0.0','supervisor','sup-v4-02',1)
on conflict (curriculum_version, role_key, lesson_id)
do update set correct_answer = excluded.correct_answer;

commit;
