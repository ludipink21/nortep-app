-- Revisão editorial das pesquisas NorteP.
-- Mantém a proteção estrutural ativa fora desta migração controlada.

alter table public.survey_questions disable trigger survey_questions_founder_guard;

update public.survey_questions set prompt = 'Por qual canal você prefere receber?'
where code='C03' and prompt='Por qual canal prefere receber?';

update public.survey_questions set prompt = 'Como você prefere ser chamado(a)?'
where code='C04' and prompt='Qual nome você deseja informar?';

update public.survey_questions set prompt = 'Digite seu WhatsApp ou e-mail, conforme o canal escolhido.', help_text='Preencha apenas o contato correspondente ao canal escolhido.'
where code='C05';

update public.survey_questions set prompt='Você autoriza a NorteP a guardar esse contato somente para a finalidade escolhida?'
where code='C06';

update public.survey_questions set help_text = 'Seu contato só será solicitado se você responder sim.'
where code='C01' and help_text='Responder não encerra sem pedir identificação.';

update public.survey_questions
set options = replace(options::text, '"Prefere não responder"', '"Prefiro não responder"')::jsonb
where options::text like '%"Prefere não responder"%';

update public.survey_questions
set options = replace(options::text, '"Não sabe avaliar"', '"Não sei avaliar"')::jsonb
where options::text like '%"Não sabe avaliar"%';

update public.survey_questions
set options = replace(options::text, '"Não sabe"', '"Não sei"')::jsonb
where options::text like '%"Não sabe"%';

-- Betim: saúde, cuidado e futuro
update public.survey_questions q set prompt='Registre a cidade em que esta entrevista está sendo realizada.', help_text='Campo preenchido pela pessoa pesquisadora; não é a cidade de residência.'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='localColetaCidade';
update public.survey_questions q set prompt='Registre o bairro em que esta entrevista está sendo realizada.', help_text='Campo preenchido pela pessoa pesquisadora; não é o bairro de residência.'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='localColetaBairro';
update public.survey_questions q set prompt='Pensando nos serviços de saúde que você utiliza ou conhece, como você os avalia?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='experienciaSaude';
update public.survey_questions q set prompt='E o que você pensa sobre essa liderança que acabou de citar?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='opiniaoLideranca';
update public.survey_questions q set prompt='Antes desta entrevista, você já conhecia ou tinha ouvido falar do Dr. Vinícius Rezende?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='conheceVinicius';
update public.survey_questions q set prompt='Antes desta entrevista, você já conhecia ou tinha ouvido falar de Olavo Keesen?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='conheceOlavo';
update public.survey_questions q set prompt='De modo geral, qual é a sua opinião sobre Olavo Keesen?'
from public.surveys s where q.survey_id=s.id and s.slug='betim-saude-cuidado-futuro-2026' and q.code='opiniaoOlavo';
update public.survey_questions q set options='["Já decidi e não pretendo mudar","Ainda posso mudar","Ainda não decidi","Prefiro não responder"]'::jsonb
from public.surveys s where q.survey_id=s.id and s.slug in ('betim-saude-cuidado-futuro-2026','minas-prioridades-escolhas-2026') and q.code='certezaVoto';

-- Escuta territorial piloto
update public.survey_questions q set prompt='Registre a cidade em que esta entrevista está sendo realizada.', help_text='Campo preenchido pela pessoa pesquisadora; não é a cidade de residência.'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='localColetaCidade';
update public.survey_questions q set prompt='Registre o bairro em que esta entrevista está sendo realizada.', help_text='Campo preenchido pela pessoa pesquisadora; não é o bairro de residência.'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='localColetaBairro';
update public.survey_questions q set prompt='Quais três melhorias deveriam vir primeiro no seu bairro?'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='prioridades';
update public.survey_questions q set prompt='Se você pudesse sugerir uma melhoria para a prefeitura, qual seria?'
from public.surveys s where q.survey_id=s.id and s.slug='escuta-territorial-bairro-cidade' and q.code='proposta';

-- Minas Gerais
update public.survey_questions q set prompt='Em qual região de Minas Gerais sua cidade fica?'
from public.surveys s where q.survey_id=s.id and s.slug='minas-prioridades-escolhas-2026' and q.code='regiaoMinas';
update public.survey_questions q set prompt='Na sua opinião, Minas Gerais está seguindo na direção certa ou errada?'
from public.surveys s where q.survey_id=s.id and s.slug='minas-prioridades-escolhas-2026' and q.code='direcaoEstado';
update public.survey_questions q set prompt='Hoje, qual é o principal problema de Minas Gerais, na sua opinião?'
from public.surveys s where q.survey_id=s.id and s.slug='minas-prioridades-escolhas-2026' and q.code='problemaEstado';
update public.survey_questions q set prompt='Por onde você costuma se informar?'
from public.surveys s where q.survey_id=s.id and s.slug='minas-prioridades-escolhas-2026' and q.code='fonteInformacao';

-- Mobilização
update public.survey_questions q set prompt='Qual mudança faria mais diferença na sua cidade hoje?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='prioridadeCidade';
update public.survey_questions q set prompt='Pensando em Minas Gerais, qual prioridade deveria vir primeiro?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='prioridadeEstado';
update public.survey_questions q set prompt='Em quais temas você teria interesse em contribuir?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='temaInteresse';
update public.survey_questions q set prompt='Como você gostaria de participar?', help_text='A participação é voluntária; não há contratação nem promessa de pagamento.'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='formaContribuir';
update public.survey_questions q set prompt='Quando você costuma ter mais disponibilidade?', help_text='Marque as opções que combinam com a sua rotina.', type='multiple', options='["Durante a semana","Fins de semana","De manhã","À tarde","À noite","Minha disponibilidade varia","Ainda não sei"]'::jsonb
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='disponibilidade';
update public.survey_questions q set prompt='Como você recebeu este formulário?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='comoSoube';
update public.survey_questions q set prompt='Quer deixar mais alguma sugestão ou mensagem?'
from public.surveys s where q.survey_id=s.id and s.slug='mobilizacao-participacao-voluntariado' and q.code='comentarioFinal';

-- Pesquisas regionais de Betim
update public.survey_questions q set prompt='Em qual bairro dessa regional você mora, trabalha, estuda ou passa mais tempo?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='bairroMoradia';
update public.survey_questions q set prompt='Há quanto tempo essa regional faz parte da sua rotina?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='tempoMoradia';
update public.survey_questions q set prompt='Quais situações descrevem sua atividade atual?', help_text='Marque todas as opções que combinam com sua situação.'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='situacaoTrabalho';
update public.survey_questions q set prompt='Na sua opinião, qual é o problema mais urgente desta regional?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='problemaPrincipal';
update public.survey_questions q set prompt='Quais três áreas deveriam ser prioridade nesta regional?', help_text='Escolha até três temas.'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='prioridades';
update public.survey_questions q set prompt='De modo geral, como você avalia os serviços públicos que utiliza nesta regional?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='avaliacaoServicos';
update public.survey_questions q set prompt='Pensando na Regional ' || s.target_regions[1] || ', quais dois temas deveriam ser investigados primeiro?', help_text='Escolha até dois temas. Se sentir falta de algum assunto, use a opção “Outro”.'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='temasRegionais';
update public.survey_questions q set prompt='Se você pudesse sugerir uma melhoria concreta para a Regional ' || s.target_regions[1] || ', qual seria?', help_text='Escreva com suas próprias palavras.'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='propostaRegional';
update public.survey_questions q set prompt='Quais características são mais importantes para você em uma liderança pública?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='qualidadeLideranca';
update public.survey_questions q set prompt='Você já conhecia o trabalho do Dr. Vinícius Rezende?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='conheceVinicius';
update public.survey_questions q set prompt='Você teria interesse em participar de uma conversa comunitária sobre essas prioridades?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='interesseReuniao';
update public.survey_questions q set prompt='Você autoriza o uso das suas respostas, sem identificação pessoal, também em estudos acadêmicos e na elaboração de pré-projetos?', help_text='Essa autorização é opcional e não interfere na sua participação.'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='autorizacaoAcademica';
update public.survey_questions q set prompt='Você gostaria de receber os resultados desta pesquisa ou informações sobre os temas apresentados?'
from public.surveys s where q.survey_id=s.id and s.slug like 'betim-regional-%' and q.code='C01';

alter table public.survey_questions enable trigger survey_questions_founder_guard;

update public.surveys s set description = 'A NorteP quer ouvir quem mora, trabalha, estuda ou participa do dia a dia da Regional ' || s.target_regions[1] || '. Queremos entender o que funciona, o que precisa melhorar e quais propostas merecem atenção. As respostas serão analisadas em conjunto e poderão contribuir para estudos, propostas públicas e pré-projetos. Também poderão aparecer perguntas opcionais, apresentadas de forma equivalente, sobre Dr. Vinícius Rezende e Olavo Keesen. Participar é voluntário: você pode pular perguntas opcionais ou encerrar quando quiser.',
consent_text = 'Antes de começar: sua participação é voluntária. Suas respostas serão analisadas em conjunto para compreender prioridades da Regional ' || s.target_regions[1] || ' e poderão contribuir para estudos, propostas públicas e pré-projetos. Seu contato só será guardado se você autorizar. Você pode deixar perguntas opcionais sem resposta ou encerrar a participação quando quiser.'
where s.slug like 'betim-regional-%';
