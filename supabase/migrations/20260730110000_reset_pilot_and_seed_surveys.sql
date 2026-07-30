-- NorteP Pesquisa · encerramento do teste interno e início do piloto oficial.
-- AUTORIZAÇÃO EXPRESSA: remover dados e acessos de teste, preservando somente
-- a administradora fundadora e Taniara Cristine Rodrigues dos Santos.

begin;

alter table public.survey_questions disable trigger survey_questions_founder_guard;

-- Remove somente o conteúdo do piloto interno.
delete from public.mobilization_contacts;
delete from public.mobilization_responses;
delete from public.mobilization_partners;
delete from public.contact_vault;
delete from public.consent_records;
delete from public.interview_answers;
delete from public.interviews;
delete from public.field_events;
delete from public.survey_assignments;
delete from public.survey_questions;
delete from public.surveys;
delete from public.audit_events;
delete from public.access_invites;
delete from public.team_links;
delete from public.coordinator_memberships;
delete from public.profile_territories;
delete from public.coordinator_territories;
delete from public.vault_sessions;
delete from public.vault_access_grants
where profile_id not in (
  select id from public.profiles
  where lower(email) in ('bussolanortep@gmail.com', 'taniaracristine49@gmail.com')
);
delete from public.vault_keys
where profile_id not in (
  select id from public.profiles
  where lower(email) in ('bussolanortep@gmail.com', 'taniaracristine49@gmail.com')
);

-- Exclui autenticações de teste. As duas contas abaixo são protegidas.
delete from auth.users
where lower(coalesce(email, '')) not in (
  'bussolanortep@gmail.com',
  'taniaracristine49@gmail.com'
);

delete from public.profiles
where lower(email) not in (
  'bussolanortep@gmail.com',
  'taniaracristine49@gmail.com'
);

update public.profiles
set role = 'admin', active = true, is_primary_admin = true,
    access_removed_at = null, updated_at = now()
where lower(email) = 'bussolanortep@gmail.com';

update public.profiles
set role = 'pesquisador', active = true, is_primary_admin = false,
    access_removed_at = null, updated_at = now()
where lower(email) = 'taniaracristine49@gmail.com';

insert into public.vault_access_grants (profile_id, active, granted_by, granted_at, revoked_at)
select id, true, id, now(), null
from public.profiles
where lower(email) = 'bussolanortep@gmail.com'
on conflict (profile_id) do update set
  active = true, granted_by = excluded.granted_by,
  granted_at = now(), revoked_at = null;

alter sequence public.interview_code_seq restart with 1;
alter sequence public.mobilization_response_seq restart with 1;

do $seed$
declare
  v_founder uuid;
  v_taniara uuid;
  v_betim uuid;
  v_minas uuid;
  v_territorial uuid;
  v_mobilizacao uuid;
begin
  select id into v_founder from public.profiles
  where lower(email) = 'bussolanortep@gmail.com';
  select id into v_taniara from public.profiles
  where lower(email) = 'taniaracristine49@gmail.com';

  insert into public.surveys (
    slug, title, description, status, survey_type, estimated_minutes,
    consent_version, consent_text, target_cities, target_regions,
    target_neighborhoods, is_test, created_by
  ) values (
    'betim-saude-cuidado-futuro-2026',
    'Betim: Saúde, Cuidado e Futuro',
    'Escuta territorial sobre saúde, serviços públicos, lideranças e escolhas de 2026.',
    'draft', 'electoral', 15, '2026-07-30-v1',
    'Olá. Eu faço parte da NorteP Pesquisa. Estamos ouvindo pessoas sobre o bairro, os serviços públicos e as escolhas de 2026. Participar é voluntário. Você pode não responder ou encerrar quando quiser. Opiniões políticas são dados sensíveis e serão analisadas de forma agrupada. Nome e contato não são necessários para participar.',
    array['Betim'], '{}'::text[], '{}'::text[], false, v_founder
  ) returning id into v_betim;

  insert into public.survey_questions
    (survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
  values
    (v_betim,'idadeMinima','Consentimento',1,'yes_no','Você tem 16 anos ou mais?',null,true,'[]',null),
    (v_betim,'consentirPesquisa','Consentimento',2,'single','Você aceita participar desta pesquisa?',null,true,'["Sim, aceito participar","Não aceito participar"]',null),
    (v_betim,'cidadeMoradia','Território',3,'short_text','Em qual cidade você mora?',null,true,'[]',null),
    (v_betim,'bairroMoradia','Território',4,'short_text','Em qual bairro você mora?',null,true,'[]',null),
    (v_betim,'localColetaCidade','Território',5,'short_text','Em qual cidade esta entrevista está acontecendo?','Registro da coleta, não da residência.',true,'[]',null),
    (v_betim,'localColetaBairro','Território',6,'short_text','Em qual bairro esta entrevista está acontecendo?','Registro da coleta, não da residência.',true,'[]',null),
    (v_betim,'tempoMoradia','Território',7,'single','Há quanto tempo você mora nessa cidade?',null,true,'["Menos de 1 ano","1 a 5 anos","6 a 10 anos","11 a 20 anos","Mais de 20 anos","Desde que nasceu","Prefere não responder"]',null),
    (v_betim,'problemaBairro','Território',8,'long_text','Na sua opinião, qual é hoje o principal problema do seu bairro?','Registre com as palavras da pessoa.',false,'[]',null),
    (v_betim,'prioridadesBairro','Território',9,'multiple','Quais três áreas deveriam receber mais atenção no seu bairro?','Selecione até 3.',true,'["Saúde","Educação","Segurança","Transporte","Limpeza urbana","Iluminação","Asfalto e vias","Moradia","Emprego e renda","Lazer e cultura","Assistência social","Outra","Prefere não responder"]',null),
    (v_betim,'avaliacaoPrefeitura','Cidade e serviços',10,'rating','Como você avalia o trabalho da Prefeitura de Betim?',null,true,'["Péssimo","Ruim","Regular","Bom","Ótimo","Não sabe avaliar"]',null),
    (v_betim,'prioridadeCidade','Cidade e serviços',11,'single','Se a prefeitura pudesse priorizar apenas uma área agora, qual deveria vir primeiro?',null,true,'["Saúde","Educação","Segurança","Emprego e renda","Transporte","Obras e infraestrutura","Habitação","Assistência social","Meio ambiente","Outra"]',null),
    (v_betim,'motivoPrioridade','Cidade e serviços',12,'long_text','Por que essa área deveria vir primeiro?','Registre sem resumir ou interpretar.',false,'[]',null),
    (v_betim,'servicoSaude','Saúde',13,'single','Qual parte da saúde pública mais precisa melhorar?',null,true,'["Atenção básica e postos","Consultas especializadas","Exames","Medicamentos","Urgência e emergência","Saúde mental","Saúde da mulher","Saúde infantil","Saúde do idoso","Outra","Não sabe"]',null),
    (v_betim,'experienciaSaude','Saúde',14,'rating','Pensando no atendimento de saúde que você conhece, como você o avalia?',null,true,'["Péssimo","Ruim","Regular","Bom","Ótimo","Não sabe avaliar"]',null),
    (v_betim,'melhoriaSaude','Saúde',15,'long_text','O que faria mais diferença para melhorar a saúde em Betim?',null,false,'[]',null),
    (v_betim,'liderancaEspontanea','Lideranças',16,'short_text','Quando você pensa em uma liderança pública ligada a Betim, qual nome vem primeiro à sua cabeça?','Não leia nomes nesta pergunta.',false,'[]',null),
    (v_betim,'opiniaoLideranca','Lideranças',17,'long_text','O que você pensa sobre essa pessoa?',null,false,'[]',null),
    (v_betim,'conheceVinicius','Lideranças',18,'single','Antes desta entrevista, você já tinha ouvido falar no Dr. Vinícius?',null,true,'["Sim, conheço bem","Já ouvi falar","Não conheço","Prefere não responder"]',null),
    (v_betim,'opiniaoVinicius','Lideranças',19,'rating','De modo geral, qual é a sua opinião sobre o Dr. Vinícius?',null,false,'["Muito negativa","Negativa","Nem positiva nem negativa","Positiva","Muito positiva","Não sabe avaliar"]','{"field":"conheceVinicius","equals":"Sim, conheço bem"}'),
    (v_betim,'conheceOlavo','Lideranças',20,'single','Antes desta entrevista, você já tinha ouvido falar em Olavo Keeser?',null,true,'["Sim, conheço bem","Já ouvi falar","Não conheço","Prefere não responder"]',null),
    (v_betim,'opiniaoOlavo','Lideranças',21,'rating','De modo geral, qual é a sua opinião sobre Olavo Keeser?',null,false,'["Muito negativa","Negativa","Nem positiva nem negativa","Positiva","Muito positiva","Não sabe avaliar"]','{"field":"conheceOlavo","equals":"Sim, conheço bem"}'),
    (v_betim,'votoFederal','Escolhas de 2026',22,'short_text','Se a eleição para deputado federal fosse hoje, em quem você votaria?','Resposta espontânea. Não leia nomes.',true,'[]',null),
    (v_betim,'votoEstadual','Escolhas de 2026',23,'short_text','E para deputado estadual, em quem você votaria?','Resposta espontânea. Não leia nomes.',true,'[]',null),
    (v_betim,'certezaVoto','Escolhas de 2026',24,'single','Hoje, como está a sua decisão de voto?',null,true,'["Totalmente decidida","Pode mudar","Ainda não decidiu","Prefere não responder"]',null),
    (v_betim,'manifestacaoEspontanea','Registro interno',25,'internal_note','Manifestação espontânea do entrevistado','Registre somente algo dito por iniciativa própria.',false,'[]',null),
    (v_betim,'C01','Contato opcional',26,'yes_no','Você deseja receber conteúdos ou os resultados desta pesquisa?','Responder não encerra sem pedir identificação.',true,'[]',null),
    (v_betim,'C02','Contato opcional',27,'single','O que você deseja receber?',null,false,'["Resultados da pesquisa","Conteúdos da organização","Resultados e conteúdos"]','{"field":"C01","equals":"Sim"}'),
    (v_betim,'C03','Contato opcional',28,'single','Por qual canal prefere receber?',null,false,'["WhatsApp","E-mail","WhatsApp e e-mail"]','{"field":"C01","equals":"Sim"}'),
    (v_betim,'C04','Contato opcional',29,'short_text','Qual nome você deseja informar?',null,false,'[]','{"field":"C01","equals":"Sim"}'),
    (v_betim,'C05','Contato opcional',30,'short_text','Informe seu WhatsApp ou e-mail.','Use somente o canal autorizado pela pessoa.',false,'[]','{"field":"C01","equals":"Sim"}'),
    (v_betim,'C06','Contato opcional',31,'yes_no','Você autoriza a NorteP a guardar esse contato para a finalidade escolhida?','A participação na pesquisa não depende desta autorização.',true,'[]','{"field":"C01","equals":"Sim"}');

  insert into public.surveys (
    slug, title, description, status, survey_type, estimated_minutes,
    consent_version, consent_text, target_cities, target_regions,
    target_neighborhoods, is_test, created_by
  ) values (
    'minas-prioridades-escolhas-2026',
    'Minas Gerais: Prioridades e Escolhas 2026',
    'Diagnóstico estadual sobre serviços, prioridades e escolhas eleitorais.',
    'draft', 'electoral', 14, '2026-07-30-v1',
    'Olá. A NorteP Pesquisa está ouvindo moradores de Minas Gerais sobre prioridades do estado e escolhas de 2026. Participar é voluntário. Você pode deixar de responder ou encerrar quando quiser. Opiniões políticas são dados sensíveis e serão analisadas de forma agrupada.',
    '{}'::text[], array['Minas Gerais'], '{}'::text[], false, v_founder
  ) returning id into v_minas;

  insert into public.survey_questions
    (survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
  values
    (v_minas,'idadeMinima','Consentimento',1,'yes_no','Você tem 16 anos ou mais?',null,true,'[]',null),
    (v_minas,'moraMinas','Consentimento',2,'yes_no','Você mora em Minas Gerais?',null,true,'[]',null),
    (v_minas,'consentirPesquisa','Consentimento',3,'single','Você aceita participar desta pesquisa?',null,true,'["Sim, aceito participar","Não aceito participar"]',null),
    (v_minas,'cidadeMoradia','Território',4,'short_text','Em qual cidade você mora?',null,true,'[]',null),
    (v_minas,'bairroMoradia','Território',5,'short_text','Em qual bairro ou comunidade você mora?',null,false,'[]',null),
    (v_minas,'regiaoMinas','Território',6,'single','Em qual região de Minas Gerais fica sua cidade?',null,true,'["Central","Metropolitana","Norte","Noroeste","Triângulo/Alto Paranaíba","Vale do Rio Doce","Vale do Mucuri","Jequitinhonha","Zona da Mata","Sul/Sudoeste","Oeste","Campo das Vertentes","Não sabe"]',null),
    (v_minas,'direcaoEstado','Avaliação do estado',7,'single','Na sua opinião, Minas Gerais está indo na direção certa ou na direção errada?',null,true,'["Direção certa","Direção errada","Nem certa nem errada","Não sabe"]',null),
    (v_minas,'prioridadesEstado','Avaliação do estado',8,'multiple','Quais três áreas deveriam ser prioridade para o Governo de Minas?','Selecione até 3.',true,'["Saúde","Educação","Segurança","Emprego e renda","Estradas e transporte","Saneamento","Habitação","Meio ambiente","Assistência social","Desenvolvimento regional","Outra"]',null),
    (v_minas,'problemaEstado','Avaliação do estado',9,'long_text','Qual é hoje o principal problema de Minas Gerais?',null,false,'[]',null),
    (v_minas,'votoGovernador','Escolhas de 2026',10,'short_text','Se a eleição para governador fosse hoje, em quem você votaria?','Resposta espontânea. Não leia nomes.',true,'[]',null),
    (v_minas,'votoSenador1','Escolhas de 2026',11,'short_text','Para senador, qual seria sua primeira escolha?','Resposta espontânea.',true,'[]',null),
    (v_minas,'votoSenador2','Escolhas de 2026',12,'short_text','E qual seria sua segunda escolha para senador?','Resposta espontânea.',true,'[]',null),
    (v_minas,'votoFederal','Escolhas de 2026',13,'short_text','Para deputado federal, em quem você votaria?','Resposta espontânea.',true,'[]',null),
    (v_minas,'votoEstadual','Escolhas de 2026',14,'short_text','Para deputado estadual, em quem você votaria?','Resposta espontânea.',true,'[]',null),
    (v_minas,'votoPresidente','Escolhas de 2026',15,'short_text','Para presidente da República, em quem você votaria?','Resposta espontânea.',true,'[]',null),
    (v_minas,'certezaVoto','Escolhas de 2026',16,'single','Hoje, como está a sua decisão de voto?',null,true,'["Totalmente decidida","Pode mudar","Ainda não decidiu","Prefere não responder"]',null),
    (v_minas,'fonteInformacao','Comunicação',17,'multiple','Por quais meios você mais se informa?',null,false,'["WhatsApp","Instagram","Facebook","TikTok","YouTube","TV","Rádio","Jornais e sites","Conversas com conhecidos","Outro"]',null),
    (v_minas,'manifestacaoEspontanea','Registro interno',18,'internal_note','Manifestação espontânea do entrevistado','Registre somente algo dito por iniciativa própria.',false,'[]',null),
    (v_minas,'C01','Contato opcional',19,'yes_no','Você deseja receber conteúdos ou os resultados desta pesquisa?','Responder não encerra sem pedir identificação.',true,'[]',null),
    (v_minas,'C02','Contato opcional',20,'single','O que você deseja receber?',null,false,'["Resultados da pesquisa","Conteúdos da organização","Resultados e conteúdos"]','{"field":"C01","equals":"Sim"}'),
    (v_minas,'C03','Contato opcional',21,'single','Por qual canal prefere receber?',null,false,'["WhatsApp","E-mail","WhatsApp e e-mail"]','{"field":"C01","equals":"Sim"}'),
    (v_minas,'C04','Contato opcional',22,'short_text','Qual nome você deseja informar?',null,false,'[]','{"field":"C01","equals":"Sim"}'),
    (v_minas,'C05','Contato opcional',23,'short_text','Informe seu WhatsApp ou e-mail.','Use somente o canal autorizado pela pessoa.',false,'[]','{"field":"C01","equals":"Sim"}'),
    (v_minas,'C06','Contato opcional',24,'yes_no','Você autoriza a NorteP a guardar esse contato para a finalidade escolhida?','A participação na pesquisa não depende desta autorização.',true,'[]','{"field":"C01","equals":"Sim"}');

  insert into public.surveys (
    slug, title, description, status, survey_type, estimated_minutes,
    consent_version, consent_text, target_cities, target_regions,
    target_neighborhoods, is_test, created_by
  ) values (
    'escuta-territorial-bairro-cidade',
    'Escuta Territorial: Bairro e Cidade',
    'Pesquisa não eleitoral para mapear demandas, prioridades e qualidade dos serviços locais.',
    'pilot', 'qualitative', 10, '2026-07-30-v1',
    'Olá. A NorteP Pesquisa está ouvindo moradores sobre o bairro, a cidade e os serviços públicos. Participar é voluntário e você pode encerrar quando quiser. Nome e contato não são necessários. As respostas serão analisadas de forma agrupada.',
    array['Betim','Contagem','Belo Horizonte'], '{}'::text[], '{}'::text[], false, v_founder
  ) returning id into v_territorial;

  insert into public.survey_questions
    (survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
  values
    (v_territorial,'idadeMinima','Consentimento',1,'yes_no','Você tem 16 anos ou mais?',null,true,'[]',null),
    (v_territorial,'consentirPesquisa','Consentimento',2,'single','Você aceita participar desta pesquisa?',null,true,'["Sim, aceito participar","Não aceito participar"]',null),
    (v_territorial,'cidadeMoradia','Território',3,'short_text','Em qual cidade você mora?',null,true,'[]',null),
    (v_territorial,'bairroMoradia','Território',4,'short_text','Em qual bairro você mora?',null,true,'[]',null),
    (v_territorial,'localColetaCidade','Território',5,'short_text','Em qual cidade esta entrevista está acontecendo?','Registro da coleta.',true,'[]',null),
    (v_territorial,'localColetaBairro','Território',6,'short_text','Em qual bairro esta entrevista está acontecendo?','Registro da coleta.',true,'[]',null),
    (v_territorial,'pertencimento','Vida no território',7,'scale','De 0 a 10, quanto você se sente parte do seu bairro?',null,true,'[]',null),
    (v_territorial,'pontoPositivo','Vida no território',8,'long_text','O que você mais gosta no seu bairro?',null,false,'[]',null),
    (v_territorial,'problemaPrincipal','Vida no território',9,'long_text','Qual é o problema mais urgente do seu bairro?',null,true,'[]',null),
    (v_territorial,'prioridades','Vida no território',10,'multiple','Quais três melhorias deveriam vir primeiro?','Selecione até 3.',true,'["Saúde","Educação","Segurança","Transporte","Iluminação","Limpeza","Asfalto e vias","Saneamento","Moradia","Emprego e renda","Lazer e cultura","Assistência social","Outra"]',null),
    (v_territorial,'avaliacaoServicos','Serviços públicos',11,'rating','De modo geral, como você avalia os serviços públicos da sua cidade?',null,true,'["Péssimo","Ruim","Regular","Bom","Ótimo","Não sabe avaliar"]',null),
    (v_territorial,'proposta','Serviços públicos',12,'long_text','Se você pudesse apresentar uma proposta à prefeitura, qual seria?',null,false,'[]',null),
    (v_territorial,'participacao','Participação',13,'single','Você teria interesse em participar de uma conversa comunitária sobre essas prioridades?',null,true,'["Sim","Talvez","Não","Prefere não responder"]',null),
    (v_territorial,'manifestacaoEspontanea','Registro interno',14,'internal_note','Manifestação espontânea do entrevistado','Registre somente algo dito por iniciativa própria.',false,'[]',null),
    (v_territorial,'C01','Contato opcional',15,'yes_no','Você deseja receber conteúdos ou os resultados desta pesquisa?','Responder não encerra sem pedir identificação.',true,'[]',null),
    (v_territorial,'C02','Contato opcional',16,'single','O que você deseja receber?',null,false,'["Resultados da pesquisa","Conteúdos da organização","Resultados e conteúdos"]','{"field":"C01","equals":"Sim"}'),
    (v_territorial,'C03','Contato opcional',17,'single','Por qual canal prefere receber?',null,false,'["WhatsApp","E-mail","WhatsApp e e-mail"]','{"field":"C01","equals":"Sim"}'),
    (v_territorial,'C04','Contato opcional',18,'short_text','Qual nome você deseja informar?',null,false,'[]','{"field":"C01","equals":"Sim"}'),
    (v_territorial,'C05','Contato opcional',19,'short_text','Informe seu WhatsApp ou e-mail.','Use somente o canal autorizado pela pessoa.',false,'[]','{"field":"C01","equals":"Sim"}'),
    (v_territorial,'C06','Contato opcional',20,'yes_no','Você autoriza a NorteP a guardar esse contato para a finalidade escolhida?','A participação na pesquisa não depende desta autorização.',true,'[]','{"field":"C01","equals":"Sim"}');

  insert into public.survey_assignments (
    survey_id, researcher_id, active, assigned_by, team_name, city, region, neighborhood
  ) values (
    v_territorial, v_taniara, true, v_founder, 'Piloto oficial',
    null, null, null
  );

  insert into public.surveys (
    slug, title, description, status, survey_type, estimated_minutes,
    consent_version, consent_text, target_cities, target_regions,
    target_neighborhoods, is_test, created_by
  ) values (
    'mobilizacao-participacao-voluntariado',
    'NorteP: Participação, Apoio e Voluntariado',
    'Formulário público de relacionamento enviado por apoiadores e lideranças.',
    'active', 'relationship', 6, '2026-07-30-v1',
    'Este formulário é da NorteP. Suas respostas ajudam a organizar diálogos sobre a cidade e o estado. Nome e contato são opcionais. Cada autorização abaixo é separada e pode ser retirada depois pelo e-mail pesquisadecamponortep@gmail.com. Respostas acadêmicas serão utilizadas apenas de forma anonimizada e somente com consentimento específico.',
    '{}'::text[], '{}'::text[], '{}'::text[], false, v_founder
  ) returning id into v_mobilizacao;

  insert into public.survey_questions
    (survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
  values
    (v_mobilizacao,'cidade','Sobre você',1,'short_text','Em qual cidade você mora?',null,true,'[]',null),
    (v_mobilizacao,'bairro','Sobre você',2,'short_text','Em qual bairro você mora?',null,false,'[]',null),
    (v_mobilizacao,'prioridadeCidade','Prioridades',3,'long_text','Qual mudança você considera mais importante para sua cidade?',null,true,'[]',null),
    (v_mobilizacao,'prioridadeEstado','Prioridades',4,'long_text','Qual deveria ser a principal prioridade de Minas Gerais?',null,false,'[]',null),
    (v_mobilizacao,'temaInteresse','Participação',5,'multiple','Em quais temas você gostaria de contribuir?','Marque quantos desejar.',true,'["Saúde","Educação","Segurança","Emprego e renda","Mobilidade","Assistência social","Meio ambiente","Juventude","Mulheres","Idosos","Cultura e esporte","Outro"]',null),
    (v_mobilizacao,'formaContribuir','Participação',6,'multiple','De que forma você gostaria de participar?','Isto não é contratação ou promessa de pagamento.',true,'["Receber informações","Participar de reuniões on-line","Participar de encontros presenciais","Ajudar voluntariamente em atividades","Convidar outras pessoas para conversar","Produzir ou compartilhar conteúdo de apoio","Ainda quero conhecer melhor"]',null),
    (v_mobilizacao,'disponibilidade','Participação',7,'single','Qual é a sua disponibilidade aproximada?',null,false,'["Durante a semana","Fins de semana","No período da manhã","No período da tarde","No período da noite","Ainda não sei"]',null),
    (v_mobilizacao,'conheceVinicius','Relacionamento',8,'single','Você já conhecia o trabalho do Dr. Vinícius antes deste formulário?',null,true,'["Sim, conheço bem","Já ouvi falar","Não conhecia","Prefere não responder"]',null),
    (v_mobilizacao,'expectativa','Relacionamento',9,'long_text','Que tipo de atuação pública você espera de uma liderança comprometida com sua cidade?',null,false,'[]',null),
    (v_mobilizacao,'sugestaoEncontro','Relacionamento',10,'long_text','Que assunto você gostaria de discutir em um encontro local ou on-line?',null,false,'[]',null),
    (v_mobilizacao,'comoSoube','Relacionamento',11,'single','Como este formulário chegou até você?',null,true,'["WhatsApp de uma liderança","WhatsApp de um apoiador","Rede social","Encontro ou reunião","Indicação de conhecido","Outro"]',null),
    (v_mobilizacao,'comentarioFinal','Relacionamento',12,'long_text','Deseja deixar outra sugestão ou mensagem?',null,false,'[]',null);
end;
$seed$;

alter table public.survey_questions enable trigger survey_questions_founder_guard;

insert into public.audit_events (actor_id, action, entity, entity_id, metadata)
select id, 'official_pilot_started', 'system', '2026-07-30',
  jsonb_build_object(
    'protected_accounts', 2,
    'seeded_surveys', 4,
    'active_field_survey', 'Escuta Territorial: Bairro e Cidade'
  )
from public.profiles
where lower(email) = 'bussolanortep@gmail.com';

commit;
