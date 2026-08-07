-- Ajuste fino para português brasileiro falado nas perguntas públicas.

alter table public.survey_questions disable trigger survey_questions_founder_guard;

update public.survey_questions q set prompt='Você mora, trabalha, estuda ou costuma frequentar a Regional ' || s.target_regions[1] || '?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='regionalConfirmacao';
update public.survey_questions q set prompt='Na sua opinião, qual problema precisa ser resolvido primeiro nesta regional?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='problemaPrincipal';
update public.survey_questions q set prompt='Como você avalia os serviços públicos que usa nesta regional?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='avaliacaoServicos';
update public.survey_questions q set prompt='Quais características são importantes para você em uma liderança pública?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='qualidadeLideranca';

update public.survey_questions q set prompt='Qual é a sua opinião sobre o Dr. Vinícius Rezende?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='opiniaoVinicius';
update public.survey_questions q set prompt='Qual é a sua opinião sobre Olavo Keesen?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='opiniaoOlavo';
update public.survey_questions q set prompt='Como você avalia os serviços públicos da sua cidade?'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='avaliacaoServicos';

alter table public.survey_questions enable trigger survey_questions_founder_guard;
