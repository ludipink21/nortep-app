-- Linguagem brasileira e direta nas perguntas exibidas ao público.
-- Evita construções com "mais" quando a intenção é pedir prioridade, escolha ou rotina.

alter table public.survey_questions disable trigger survey_questions_founder_guard;

update public.survey_questions q set prompt='Em qual bairro dessa regional você mora, trabalha, estuda ou costuma ficar?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='bairroMoradia';
update public.survey_questions q set prompt='Na sua opinião, qual problema deveria ser resolvido primeiro nesta regional?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='problemaPrincipal';
update public.survey_questions q set prompt='Quais características você considera importantes em uma liderança pública?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='qualidadeLideranca';

update public.survey_questions q set prompt='Quais três áreas deveriam receber atenção primeiro no seu bairro?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='prioridadesBairro';
update public.survey_questions q set prompt='Qual parte da saúde pública precisa melhorar primeiro?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='servicoSaude';
update public.survey_questions q set prompt='Qual mudança faria diferença para melhorar a saúde em Betim?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='melhoriaSaude';

update public.survey_questions q set prompt='O que você gosta no seu bairro?'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='pontoPositivo';
update public.survey_questions q set prompt='Qual problema precisa ser resolvido primeiro no seu bairro?'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='problemaPrincipal';

update public.survey_questions q set prompt='Qual mudança faria diferença na sua cidade hoje?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='prioridadeCidade';
update public.survey_questions q set prompt='Quando você costuma ter disponibilidade?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='disponibilidade';
update public.survey_questions q set prompt='Quer deixar alguma sugestão ou mensagem?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='comentarioFinal';

alter table public.survey_questions enable trigger survey_questions_founder_guard;

update public.social_quiz_questions set prompt='Qual regional de Betim faz parte da sua rotina?', help_text='Pode ser onde você mora, trabalha, estuda ou costuma ficar.' where code='regional';
update public.social_quiz_questions set help_text='Escolha apenas uma: a prioridade que você colocaria em primeiro lugar.' where code='prioridade';
update public.social_quiz_questions set prompt='Qual dessas mudanças você escolheria para melhorar seu dia a dia?', help_text='Escolha a opção que teria maior impacto na sua rotina.' where code='mudanca';
update public.social_quiz_questions set prompt='Que tipo de conteúdo você gosta de acompanhar nas redes?' where code='formato';
update public.social_quiz_questions set prompt='Você gostaria de receber os resultados deste quiz quando tivermos respostas suficientes para apresentar um resultado?' where code='resultado';
