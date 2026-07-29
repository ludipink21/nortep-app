-- NorteP Pesquisa · questionário exploratório estadual
-- Criado em modo de teste. O módulo eleitoral permanece desativado.

begin;

do $$
declare
  v_survey_id uuid;
  v_admin_id uuid;
begin
  select id into v_admin_id
  from public.profiles
  where lower(email) = 'bussolanortep@gmail.com'
  limit 1;

  select id into v_survey_id
  from public.surveys
  where slug = 'minas-gerais-territorio-servicos-escolhas-2026'
  limit 1;

  if v_survey_id is null then
    insert into public.surveys (
      slug, title, description, status, survey_type, estimated_minutes,
      consent_version, consent_text, is_test, target_cities, target_regions,
      target_neighborhoods, created_by
    ) values (
      'minas-gerais-territorio-servicos-escolhas-2026',
      'Minas Gerais — Território, Serviços e Escolhas 2026',
      'Pesquisa exploratória estadual iniciada pelo piloto de Betim. Núcleo territorial, serviços públicos, prioridades estaduais, informação, participação e perfil. Módulo eleitoral desativado.',
      'pilot',
      'quantitative',
      15,
      '2026-07-24-mg-v1',
      'Olá. Eu faço parte da equipe NorteP Pesquisa. Estamos realizando uma pesquisa para entender como as pessoas avaliam o lugar onde vivem e quais são as prioridades para Minas Gerais. A participação é voluntária. Você pode deixar de responder qualquer pergunta ou encerrar a entrevista quando quiser. As respostas podem ser anônimas e serão analisadas em conjunto.',
      true,
      array['Betim','Contagem','Belo Horizonte','Montes Claros','Januária','São Francisco','Buenópolis'],
      array['Minas Gerais'],
      '{}'::text[],
      v_admin_id
    )
    returning id into v_survey_id;
  end if;

  insert into public.survey_questions (
    survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition
  )
  select
    v_survey_id, q.code, q.section, q.sort_order, q.type, q.prompt,
    nullif(q.help_text, ''), q.required, q.options, q.condition
  from jsonb_to_recordset($questions$
  [
    {"code":"idadeMinima","section":"Abertura e consentimento","sort_order":1,"type":"yes_no","prompt":"Você tem 16 anos ou mais?","help_text":"Se a resposta for não, agradeça e encerre sem salvar.","required":true,"options":[],"condition":null},
    {"code":"moraMinas","section":"Abertura e consentimento","sort_order":2,"type":"yes_no","prompt":"Você mora atualmente em Minas Gerais?","help_text":"Se a resposta for não, agradeça e encerre sem salvar.","required":true,"options":[],"condition":null},
    {"code":"consentirPesquisa","section":"Abertura e consentimento","sort_order":3,"type":"yes_no","prompt":"Você entendeu as informações e aceita participar voluntariamente desta pesquisa?","help_text":"Se a resposta for não, encerre sem guardar as respostas.","required":true,"options":[],"condition":null},

    {"code":"Q04","section":"Território","sort_order":4,"type":"region","prompt":"Em qual município de Minas Gerais você mora?","help_text":"","required":true,"options":["Betim","Contagem","Belo Horizonte","Montes Claros","Januária","São Francisco","Buenópolis","Outro município"],"condition":null},
    {"code":"Q05","section":"Território","sort_order":5,"type":"short_text","prompt":"Em qual bairro, distrito, comunidade ou localidade você mora?","help_text":"Não registre endereço nem número da casa.","required":true,"options":[],"condition":null},
    {"code":"Q06","section":"Território","sort_order":6,"type":"single","prompt":"A área onde você mora é:","help_text":"","required":true,"options":["Urbana","Rural","Comunidade tradicional","Não sabe","Prefere não responder"],"condition":null},
    {"code":"Q07","section":"Território","sort_order":7,"type":"single","prompt":"Há quanto tempo você mora neste município?","help_text":"","required":false,"options":["Menos de 1 ano","De 1 a 4 anos","De 5 a 9 anos","De 10 a 19 anos","20 anos ou mais","Desde que nasceu","Prefere não responder"],"condition":null},
    {"code":"Q08","section":"Território","sort_order":8,"type":"single","prompt":"De modo geral, você se sente pertencente ao bairro ou comunidade onde mora?","help_text":"","required":false,"options":["Muito","Mais ou menos","Pouco","Nada","Não sabe"],"condition":null},
    {"code":"Q09","section":"Território","sort_order":9,"type":"long_text","prompt":"Qual é a melhor coisa do lugar onde você mora?","help_text":"Registre a resposta espontânea.","required":false,"options":[],"condition":null},
    {"code":"Q10","section":"Território","sort_order":10,"type":"long_text","prompt":"Qual é o principal problema do lugar onde você mora hoje?","help_text":"Não apresente opções antes da resposta.","required":false,"options":[],"condition":null},
    {"code":"Q11","section":"Território","sort_order":11,"type":"multiple","prompt":"Entre os temas abaixo, quais são os três problemas que mais precisam de atenção?","help_text":"Selecione até três.","required":true,"options":["Saúde","Educação","Segurança","Emprego e renda","Transporte público","Trânsito, estradas e mobilidade","Moradia","Saneamento, água e esgoto","Limpeza urbana e coleta de lixo","Assistência social","Cuidado com idosos","Políticas para crianças e adolescentes","Combate à violência contra as mulheres","Meio ambiente","Cultura, esporte e lazer","Acesso à internet e serviços digitais","Outro","Não sabe"],"condition":null},

    {"code":"Q12","section":"Qualidade de vida e serviços","sort_order":12,"type":"scale","prompt":"De 0 a 10, como você avalia a qualidade de vida no seu município?","help_text":"0 significa muito ruim e 10 significa excelente.","required":true,"options":[],"condition":null},
    {"code":"Q13","section":"Qualidade de vida e serviços","sort_order":13,"type":"single","prompt":"Nos últimos dois anos, a vida no seu município:","help_text":"","required":false,"options":["Melhorou","Ficou igual","Piorou","Não sabe"],"condition":null},
    {"code":"Q14","section":"Qualidade de vida e serviços","sort_order":14,"type":"single","prompt":"Como você avalia o atendimento de saúde no seu município?","help_text":"","required":false,"options":["Muito bom","Bom","Regular","Ruim","Muito ruim","Não usa ou não sabe"],"condition":null},
    {"code":"Q15","section":"Qualidade de vida e serviços","sort_order":15,"type":"single","prompt":"Como você avalia as escolas públicas no seu município?","help_text":"","required":false,"options":["Muito bom","Bom","Regular","Ruim","Muito ruim","Não usa ou não sabe"],"condition":null},
    {"code":"Q16","section":"Qualidade de vida e serviços","sort_order":16,"type":"single","prompt":"Como você avalia a segurança no seu município?","help_text":"","required":false,"options":["Muito boa","Boa","Regular","Ruim","Muito ruim","Não sabe"],"condition":null},
    {"code":"Q17","section":"Qualidade de vida e serviços","sort_order":17,"type":"single","prompt":"Como você avalia o transporte público no seu município?","help_text":"","required":false,"options":["Muito bom","Bom","Regular","Ruim","Muito ruim","Não usa ou não sabe"],"condition":null},
    {"code":"Q18","section":"Qualidade de vida e serviços","sort_order":18,"type":"single","prompt":"Como você avalia as ruas, estradas e a mobilidade no seu município?","help_text":"","required":false,"options":["Muito boas","Boas","Regulares","Ruins","Muito ruins","Não sabe"],"condition":null},
    {"code":"Q19","section":"Qualidade de vida e serviços","sort_order":19,"type":"single","prompt":"Como você avalia o abastecimento de água e o saneamento no seu município?","help_text":"","required":false,"options":["Muito bons","Bons","Regulares","Ruins","Muito ruins","Não usa ou não sabe"],"condition":null},
    {"code":"Q20","section":"Qualidade de vida e serviços","sort_order":20,"type":"single","prompt":"Como você avalia a limpeza urbana e a coleta de lixo no seu município?","help_text":"","required":false,"options":["Muito boas","Boas","Regulares","Ruins","Muito ruins","Não usa ou não sabe"],"condition":null},
    {"code":"Q21","section":"Qualidade de vida e serviços","sort_order":21,"type":"single","prompt":"Como você avalia a assistência social no seu município?","help_text":"","required":false,"options":["Muito boa","Boa","Regular","Ruim","Muito ruim","Não usa ou não sabe"],"condition":null},
    {"code":"Q22","section":"Qualidade de vida e serviços","sort_order":22,"type":"single","prompt":"Como você avalia as oportunidades de trabalho e renda no seu município?","help_text":"","required":false,"options":["Muito boas","Boas","Regulares","Ruins","Muito ruins","Não sabe"],"condition":null},
    {"code":"Q23","section":"Qualidade de vida e serviços","sort_order":23,"type":"single","prompt":"Qual desses serviços deveria receber atenção primeiro?","help_text":"","required":true,"options":["Atendimento de saúde","Escolas públicas","Segurança","Transporte público","Ruas, estradas e mobilidade","Água e saneamento","Limpeza urbana e coleta de lixo","Assistência social","Trabalho e renda","Outro","Não sabe"],"condition":null},
    {"code":"Q24","section":"Qualidade de vida e serviços","sort_order":24,"type":"single","prompt":"Nos últimos 12 meses, você deixou de conseguir algum serviço público de que precisava?","help_text":"","required":false,"options":["Sim","Não","Não sabe","Prefere não responder"],"condition":null},
    {"code":"Q25","section":"Qualidade de vida e serviços","sort_order":25,"type":"multiple","prompt":"Qual serviço você não conseguiu?","help_text":"","required":false,"options":["Saúde","Educação","Assistência social","Segurança","Transporte","Habitação","Documento ou atendimento administrativo","Outro","Prefere não responder"],"condition":{"field":"Q24","equals":"Sim"}},

    {"code":"Q26","section":"Município e Minas Gerais","sort_order":26,"type":"single","prompt":"Como você avalia a atuação da prefeitura do seu município?","help_text":"","required":false,"options":["Ótima","Boa","Regular","Ruim","Péssima","Não sabe"],"condition":null},
    {"code":"Q27","section":"Município e Minas Gerais","sort_order":27,"type":"single","prompt":"Na sua opinião, Minas Gerais está:","help_text":"","required":false,"options":["No caminho certo","Nem no caminho certo nem no errado","No caminho errado","Não sabe"],"condition":null},
    {"code":"Q28","section":"Município e Minas Gerais","sort_order":28,"type":"single","prompt":"Como você avalia a atuação do Governo de Minas Gerais?","help_text":"","required":false,"options":["Ótima","Boa","Regular","Ruim","Péssima","Não sabe"],"condition":null},
    {"code":"Q29","section":"Município e Minas Gerais","sort_order":29,"type":"long_text","prompt":"Qual deveria ser a principal prioridade do Governo de Minas Gerais hoje?","help_text":"Registre espontaneamente.","required":false,"options":[],"condition":null},
    {"code":"Q30","section":"Município e Minas Gerais","sort_order":30,"type":"multiple","prompt":"Escolha até três áreas que deveriam ser prioridade em Minas Gerais.","help_text":"Selecione até três.","required":true,"options":["Saúde","Educação","Segurança pública","Emprego e desenvolvimento econômico","Redução da pobreza","Transporte e rodovias","Habitação e saneamento","Combate à fome","Proteção das mulheres","Cuidado com idosos","Juventude","Agricultura familiar","Meio ambiente, água e mineração","Cultura, esporte e turismo","Combate à corrupção","Equilíbrio das contas públicas","Desenvolvimento do interior","Outra","Não sabe"],"condition":null},
    {"code":"Q31","section":"Município e Minas Gerais","sort_order":31,"type":"single","prompt":"Você considera que o Governo de Minas está presente e atende às necessidades do seu município?","help_text":"","required":false,"options":["Atende muito","Atende em parte","Atende pouco","Não atende","Não sabe"],"condition":null},
    {"code":"Q32","section":"Município e Minas Gerais","sort_order":32,"type":"long_text","prompt":"O que o Governo de Minas deveria fazer primeiro no seu município?","help_text":"","required":false,"options":[],"condition":null},
    {"code":"Q33","section":"Município e Minas Gerais","sort_order":33,"type":"single","prompt":"Você acha que a sua região recebe do Governo de Minas:","help_text":"","required":false,"options":["Mais atenção do que outras regiões","A mesma atenção","Menos atenção do que outras regiões","Não sabe"],"condition":null},
    {"code":"Q34","section":"Município e Minas Gerais","sort_order":34,"type":"region","prompt":"Com qual região de Minas Gerais você mais se identifica?","help_text":"","required":false,"options":["Central","Metropolitana de Belo Horizonte","Norte de Minas","Noroeste de Minas","Vale do Jequitinhonha","Vale do Mucuri","Vale do Rio Doce","Zona da Mata","Sul/Sudoeste de Minas","Triângulo Mineiro/Alto Paranaíba","Oeste de Minas","Campo das Vertentes","Outra denominação","Não sabe"],"condition":null},

    {"code":"Q35","section":"Informação e participação","sort_order":35,"type":"multiple","prompt":"Por onde você mais recebe notícias sobre o seu município e Minas Gerais?","help_text":"Selecione até três.","required":false,"options":["Televisão","Rádio","Jornal ou portal de notícias","WhatsApp","Instagram","Facebook","TikTok","YouTube","Familiares, amigos ou vizinhos","Igreja ou comunidade religiosa","Associação, sindicato ou movimento","Outra fonte","Não acompanha notícias"],"condition":null},
    {"code":"Q36","section":"Informação e participação","sort_order":36,"type":"single","prompt":"Em geral, quanto você confia nas informações políticas que recebe?","help_text":"","required":false,"options":["Confia muito","Confia em parte","Confia pouco","Não confia","Não sabe"],"condition":null},
    {"code":"Q37","section":"Informação e participação","sort_order":37,"type":"single","prompt":"Quanto você se interessa por política?","help_text":"","required":false,"options":["Muito","Mais ou menos","Pouco","Nada","Prefere não responder"],"condition":null},
    {"code":"Q38","section":"Informação e participação","sort_order":38,"type":"single","prompt":"Nos últimos 12 meses, você participou de alguma reunião, associação, conselho, movimento ou atividade para melhorar sua comunidade?","help_text":"","required":false,"options":["Sim","Não","Prefere não responder"],"condition":null},
    {"code":"Q39","section":"Informação e participação","sort_order":39,"type":"single","prompt":"Você sente que as autoridades escutam as pessoas da sua comunidade?","help_text":"","required":false,"options":["Escutam muito","Escutam às vezes","Escutam pouco","Não escutam","Não sabe"],"condition":null},

    {"code":"R01","section":"Módulo regional","sort_order":40,"type":"long_text","prompt":"Qual problema é mais característico desta região e precisa de uma solução estadual?","help_text":"","required":false,"options":[],"condition":null},
    {"code":"R02","section":"Módulo regional","sort_order":41,"type":"long_text","prompt":"Qual atividade, recurso ou qualidade da região poderia gerar mais oportunidades?","help_text":"","required":false,"options":[],"condition":null},
    {"code":"R03","section":"Módulo regional","sort_order":42,"type":"single","prompt":"Com que frequência você precisa ir a outro município para conseguir atendimento, estudar, trabalhar ou acessar um serviço?","help_text":"","required":false,"options":["Todos os dias","Algumas vezes por semana","Algumas vezes por mês","Raramente","Nunca","Não sabe"],"condition":null},
    {"code":"R04","section":"Módulo regional","sort_order":43,"type":"single","prompt":"Quando precisa se deslocar para outro município, qual é o principal motivo?","help_text":"","required":false,"options":["Trabalho","Saúde","Educação","Compras ou serviços","Atendimento público","Não precisa se deslocar","Outro","Prefere não responder"],"condition":null},

    {"code":"S01","section":"Perfil sociodemográfico","sort_order":44,"type":"single","prompt":"Em qual faixa de idade você está?","help_text":"","required":true,"options":["16 a 17 anos","18 a 24 anos","25 a 34 anos","35 a 44 anos","45 a 59 anos","60 anos ou mais","Prefere não responder"],"condition":null},
    {"code":"S02","section":"Perfil sociodemográfico","sort_order":45,"type":"single","prompt":"Como você se identifica em relação ao gênero?","help_text":"","required":true,"options":["Mulher","Homem","Não binário ou outra identidade","Prefere se autodescrever","Prefere não responder"],"condition":null},
    {"code":"S03","section":"Perfil sociodemográfico","sort_order":46,"type":"single","prompt":"Qual é a sua cor ou raça?","help_text":"Resposta por autodeclaração.","required":false,"options":["Branca","Preta","Amarela","Parda","Indígena","Prefere não responder"],"condition":null},
    {"code":"S04","section":"Perfil sociodemográfico","sort_order":47,"type":"single","prompt":"Qual é a sua escolaridade?","help_text":"","required":true,"options":["Não estudou","Ensino fundamental incompleto","Ensino fundamental completo","Ensino médio incompleto","Ensino médio completo","Ensino superior incompleto","Ensino superior completo","Pós-graduação","Prefere não responder"],"condition":null},
    {"code":"S05","section":"Perfil sociodemográfico","sort_order":48,"type":"single","prompt":"Qual é a sua principal situação de trabalho atualmente?","help_text":"","required":false,"options":["Empregado com carteira","Empregado sem carteira","Servidor público","Autônomo ou por conta própria","Empresário ou empregador","Trabalho rural","Desempregado e procurando trabalho","Estudante","Aposentado ou pensionista","Cuida da casa ou de familiares sem remuneração","Outra situação","Prefere não responder"],"condition":null},
    {"code":"S06","section":"Perfil sociodemográfico","sort_order":49,"type":"single","prompt":"Somando a renda das pessoas que moram na sua casa, qual é aproximadamente a renda familiar por mês?","help_text":"","required":true,"options":["Até 1 salário mínimo","Mais de 1 até 2 salários mínimos","Mais de 2 até 3 salários mínimos","Mais de 3 até 5 salários mínimos","Mais de 5 até 10 salários mínimos","Mais de 10 salários mínimos","Não sabe","Prefere não responder"],"condition":null},
    {"code":"S07","section":"Perfil sociodemográfico","sort_order":50,"type":"short_text","prompt":"Você possui religião ou crença? Se quiser, pode informar qual.","help_text":"","required":false,"options":[],"condition":null},
    {"code":"S08","section":"Perfil sociodemográfico","sort_order":51,"type":"single","prompt":"Seu título de eleitor está registrado:","help_text":"","required":false,"options":["Neste município","Em outro município de Minas Gerais","Em outro estado","Não possui título","Não sabe","Prefere não responder"],"condition":null},

    {"code":"C01","section":"Contato opcional","sort_order":52,"type":"yes_no","prompt":"Você deseja receber informações ou ser convidado para alguma atividade futura da NorteP?","help_text":"A pesquisa pode ser concluída de forma anônima.","required":true,"options":[],"condition":null},
    {"code":"C02","section":"Contato opcional","sort_order":53,"type":"multiple","prompt":"Para qual finalidade você autoriza o contato?","help_text":"","required":false,"options":["Receber o resultado geral da pesquisa","Participar de outra pesquisa","Receber convite para reunião ou atividade","Outro motivo informado"],"condition":{"field":"C01","equals":"Sim"}},
    {"code":"C03","section":"Contato opcional","sort_order":54,"type":"multiple","prompt":"Por qual meio você aceita receber o contato?","help_text":"","required":false,"options":["WhatsApp","Telefone","E-mail"],"condition":{"field":"C01","equals":"Sim"}},
    {"code":"C04","section":"Contato opcional","sort_order":55,"type":"short_text","prompt":"Se desejar, informe seu nome.","help_text":"","required":false,"options":[],"condition":{"field":"C01","equals":"Sim"}},
    {"code":"C05","section":"Contato opcional","sort_order":56,"type":"short_text","prompt":"Informe o telefone, WhatsApp ou e-mail autorizado.","help_text":"","required":false,"options":[],"condition":{"field":"C01","equals":"Sim"}},
    {"code":"C06","section":"Contato opcional","sort_order":57,"type":"yes_no","prompt":"Você autoriza a NorteP a guardar esse contato somente para as finalidades escolhidas acima?","help_text":"Se a resposta for não, o contato não deverá ser usado.","required":false,"options":[],"condition":{"field":"C01","equals":"Sim"}},
    {"code":"C07","section":"Contato opcional","sort_order":58,"type":"yes_no","prompt":"Você autoriza registrar apenas a localização aproximada desta entrevista para análise territorial?","help_text":"Nunca registre o endereço residencial exato.","required":false,"options":[],"condition":null},
    {"code":"OBS","section":"Encerramento","sort_order":59,"type":"internal_note","prompt":"Observação de campo do pesquisador","help_text":"Não registre opinião política nem dados pessoais desnecessários.","required":false,"options":[],"condition":null}
  ]
  $questions$::jsonb) as q(
    code text, section text, sort_order integer, type text, prompt text,
    help_text text, required boolean, options jsonb, condition jsonb
  )
  on conflict (survey_id, code) do update set
    section = excluded.section,
    sort_order = excluded.sort_order,
    type = excluded.type,
    prompt = excluded.prompt,
    help_text = excluded.help_text,
    required = excluded.required,
    options = excluded.options,
    condition = excluded.condition;

  insert into public.survey_assignments (
    survey_id, researcher_id, active, assigned_by, team_name, city, region
  )
  select
    v_survey_id, p.id, true, v_admin_id, 'Piloto Minas Gerais',
    'Betim', 'Metropolitana de Belo Horizonte'
  from public.profiles p
  where lower(p.email) = 'taniaracristine49@gmail.com'
    and p.role = 'pesquisador'
    and p.active
    and p.access_removed_at is null
  on conflict (survey_id, researcher_id) do update set
    active = true,
    assigned_by = excluded.assigned_by,
    team_name = excluded.team_name,
    city = excluded.city,
    region = excluded.region;
end;
$$;

commit;
