do $$
declare
  v_founder uuid;
  v_region record;
  v_survey_id uuid;
  v_order integer;
  v_leader_first boolean;
begin
  select id into v_founder
  from public.profiles
  where role = 'admin' and admin_level = 'founder'
  order by created_at
  limit 1;

  if v_founder is null then
    raise exception 'Administradora Fundadora não encontrada.';
  end if;

  perform set_config('request.jwt.claim.sub', v_founder::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_founder::text, 'role', 'authenticated')::text, true);

  for v_region in
    select * from (values
      ('alterosas','Alterosas',array['Saúde','Transporte coletivo','Drenagem e enchentes','Pavimentação e vias','Educação','Emprego e renda']::text[],1),
      ('centro','Centro',array['Trânsito','Transporte coletivo','Segurança','Comércio local','Espaços públicos','Moradia']::text[],2),
      ('citrolandia','Citrolândia',array['Saúde','Transporte até o centro','Saneamento','Pavimentação','Emprego','Educação']::text[],3),
      ('icaivera','Icaivera',array['Transporte regional','Saúde','Escolas','Drenagem','Urbanização','Acesso a serviços']::text[],4),
      ('imbirucu','Imbiruçu',array['Mobilidade','Impactos industriais','Saúde','Segurança','Vias','Emprego']::text[],5),
      ('norte','Norte',array['Estradas','Saneamento','Saúde','Educação','Meio ambiente','Internet e conectividade']::text[],6),
      ('petrovale','Petrovale',array['Meio ambiente','Impactos industriais','Saúde','Transporte','Drenagem','Emprego']::text[],7),
      ('ptb','PTB',array['Mobilidade','Saúde','Educação','Segurança','Drenagem','Infraestrutura urbana']::text[],8),
      ('teresopolis','Teresópolis',array['Transporte','Habitação','Saúde','Impactos industriais','Vias','Qualidade ambiental']::text[],9),
      ('vianopolis','Vianópolis',array['Transporte','Estradas','Saúde','Internet','Escolas','Água e saneamento']::text[],10)
    ) as regions(slug_key, regional_name, regional_themes, position)
  loop
    insert into public.surveys(
      slug, title, description, status, estimated_minutes, consent_version, consent_text,
      intro_video_url, thank_you_video_url, created_by, survey_type, target_cities,
      target_regions, target_neighborhoods, is_test, archived_at, updated_at
    ) values (
      'betim-regional-' || v_region.slug_key,
      'Escuta Territorial NorteP — Regional ' || v_region.regional_name,
      'Esta pesquisa busca conhecer prioridades, dificuldades e sugestões de moradores e pessoas com vínculo com a Regional ' || v_region.regional_name || '. As respostas serão analisadas de forma agrupada e poderão contribuir para estudos, propostas públicas e pré-projetos. Durante a pesquisa poderão aparecer perguntas equivalentes sobre Dr. Vinícius Rezende e Olavo Keesen. A participação é voluntária e é possível não responder perguntas opcionais.',
      'draft', 12, '2026-08-06-regional-v1',
      'Você está sendo convidado(a) a participar voluntariamente de uma escuta territorial da NorteP. As respostas serão analisadas de forma agrupada para conhecer prioridades locais e poderão subsidiar estudos, propostas públicas e pré-projetos. Dados de contato só serão guardados mediante autorização específica. Você pode interromper a participação a qualquer momento.',
      null, null, v_founder, 'directional', array['Betim'], array[v_region.regional_name], '{}'::text[], true, null, now()
    )
    on conflict (slug) do update set
      title = excluded.title,
      description = excluded.description,
      estimated_minutes = excluded.estimated_minutes,
      consent_version = excluded.consent_version,
      consent_text = excluded.consent_text,
      survey_type = excluded.survey_type,
      target_cities = excluded.target_cities,
      target_regions = excluded.target_regions,
      is_test = true,
      archived_at = null,
      updated_at = now()
    returning id into v_survey_id;

    delete from public.survey_questions where survey_id = v_survey_id;
    v_order := 10;
    v_leader_first := mod(v_region.position, 2) = 1;

    insert into public.survey_questions(survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
    values
      (v_survey_id,'idadeMinima','Consentimento',v_order,'yes_no','Você tem 16 anos ou mais?',null,true,'[]'::jsonb,null),
      (v_survey_id,'consentirPesquisa','Consentimento',v_order+10,'single','Você aceita participar desta pesquisa?','A participação é voluntária.',true,'["Sim, aceito participar","Não aceito participar"]'::jsonb,null),
      (v_survey_id,'regionalConfirmacao','Território',v_order+20,'single','Você mora, trabalha, estuda ou mantém vínculo frequente com a Regional ' || v_region.regional_name || '?',null,true,'["Sim","Não","Não tenho certeza"]'::jsonb,null),
      (v_survey_id,'bairroMoradia','Território',v_order+30,'short_text','Qual é o bairro relacionado à sua resposta?',null,true,'[]'::jsonb,null),
      (v_survey_id,'tempoMoradia','Perfil territorial',v_order+40,'single','Há quanto tempo você possui vínculo com essa região?',null,false,'["Menos de 1 ano","De 1 a 4 anos","De 5 a 9 anos","De 10 a 19 anos","20 anos ou mais","Prefiro não responder"]'::jsonb,null),
      (v_survey_id,'faixaEtaria','Perfil territorial',v_order+50,'single','Qual é a sua faixa etária?',null,false,'["16 a 17 anos","18 a 24 anos","25 a 34 anos","35 a 44 anos","45 a 59 anos","60 anos ou mais","Prefiro não responder"]'::jsonb,null),
      (v_survey_id,'escolaridade','Perfil territorial',v_order+60,'single','Qual é o seu nível de escolaridade?',null,false,'["Ensino fundamental","Ensino médio","Curso técnico","Ensino superior","Pós-graduação","Prefiro não responder"]'::jsonb,null),
      (v_survey_id,'situacaoTrabalho','Perfil territorial',v_order+70,'multiple','Qual situação descreve melhor sua atividade atual?','Marque as opções que se aplicam.',false,'["Emprego formal","Trabalho autônomo","Empreendedor(a)","Trabalho informal","Desempregado(a)","Estudante","Aposentado(a)","Cuida da casa ou de familiares","Prefiro não responder"]'::jsonb,null),
      (v_survey_id,'problemaPrincipal','Prioridades',v_order+80,'long_text','Qual é o problema mais urgente desta região?',null,true,'[]'::jsonb,null),
      (v_survey_id,'prioridades','Prioridades',v_order+90,'multiple','Quais três áreas deveriam receber prioridade primeiro?','Escolha até três temas.',true,'["Saúde","Educação","Segurança","Transporte e mobilidade","Emprego e renda","Saneamento e drenagem","Asfalto, vias e estradas","Iluminação e espaços públicos","Habitação e urbanização","Assistência social","Meio ambiente","Cultura, esporte e juventude","Outra"]'::jsonb,null),
      (v_survey_id,'avaliacaoServicos','Serviços públicos',v_order+100,'rating','De modo geral, como você avalia os serviços públicos disponíveis na região?',null,true,'["Péssimo","Ruim","Regular","Bom","Ótimo","Não sei avaliar"]'::jsonb,null),
      (v_survey_id,'temasRegionais','Módulo regional',v_order+110,'multiple','Entre os assuntos abaixo, quais dois precisam ser investigados primeiro na Regional ' || v_region.regional_name || '?','As opções foram organizadas para esta regional, mas você também poderá escrever outra sugestão.',true,to_jsonb(v_region.regional_themes || array['Outro']),null),
      (v_survey_id,'propostaRegional','Propostas',v_order+120,'long_text','Qual proposta concreta você apresentaria para melhorar a Regional ' || v_region.regional_name || '?','Escreva com suas próprias palavras.',true,'[]'::jsonb,null),
      (v_survey_id,'qualidadeLideranca','Lideranças públicas',v_order+130,'multiple','Quais características você considera mais importantes em uma liderança pública?',null,false,'["Experiência","Capacidade de diálogo","Conhecimento técnico","Presença nas comunidades","Transparência","Capacidade de conseguir recursos","Compromisso com resultados","Outra"]'::jsonb,null);

    if v_leader_first then
      insert into public.survey_questions(survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
      values
        (v_survey_id,'conheceVinicius','Lideranças públicas',v_order+140,'single','Você já conhecia o trabalho de Dr. Vinícius Rezende?',null,false,'["Conheço bem","Já ouvi falar","Não conhecia","Prefiro não responder"]'::jsonb,null),
        (v_survey_id,'temaVinicius','Lideranças públicas',v_order+150,'multiple','Sobre quais temas você gostaria de ouvir propostas de Dr. Vinícius Rezende?',null,false,'["Saúde","Educação","Segurança","Emprego e renda","Transporte e mobilidade","Assistência social","Meio ambiente","Habitação","Cultura e esporte","Outro","Prefiro não responder"]'::jsonb,null),
        (v_survey_id,'conheceOlavo','Lideranças públicas',v_order+160,'single','Você já conhecia o trabalho de Olavo Keesen?',null,false,'["Conheço bem","Já ouvi falar","Não conhecia","Prefiro não responder"]'::jsonb,null),
        (v_survey_id,'temaOlavo','Lideranças públicas',v_order+170,'multiple','Sobre quais temas você gostaria de ouvir propostas de Olavo Keesen?',null,false,'["Saúde","Educação","Segurança","Emprego e renda","Transporte e mobilidade","Assistência social","Meio ambiente","Habitação","Cultura e esporte","Outro","Prefiro não responder"]'::jsonb,null);
    else
      insert into public.survey_questions(survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
      values
        (v_survey_id,'conheceOlavo','Lideranças públicas',v_order+140,'single','Você já conhecia o trabalho de Olavo Keesen?',null,false,'["Conheço bem","Já ouvi falar","Não conhecia","Prefiro não responder"]'::jsonb,null),
        (v_survey_id,'temaOlavo','Lideranças públicas',v_order+150,'multiple','Sobre quais temas você gostaria de ouvir propostas de Olavo Keesen?',null,false,'["Saúde","Educação","Segurança","Emprego e renda","Transporte e mobilidade","Assistência social","Meio ambiente","Habitação","Cultura e esporte","Outro","Prefiro não responder"]'::jsonb,null),
        (v_survey_id,'conheceVinicius','Lideranças públicas',v_order+160,'single','Você já conhecia o trabalho de Dr. Vinícius Rezende?',null,false,'["Conheço bem","Já ouvi falar","Não conhecia","Prefiro não responder"]'::jsonb,null),
        (v_survey_id,'temaVinicius','Lideranças públicas',v_order+170,'multiple','Sobre quais temas você gostaria de ouvir propostas de Dr. Vinícius Rezende?',null,false,'["Saúde","Educação","Segurança","Emprego e renda","Transporte e mobilidade","Assistência social","Meio ambiente","Habitação","Cultura e esporte","Outro","Prefiro não responder"]'::jsonb,null);
    end if;

    insert into public.survey_questions(survey_id, code, section, sort_order, type, prompt, help_text, required, options, condition)
    values
      (v_survey_id,'interesseReuniao','Participação',v_order+180,'single','Você participaria de uma conversa comunitária sobre essas prioridades?',null,false,'["Sim, presencialmente","Sim, on-line","Talvez","Não","Prefiro não responder"]'::jsonb,null),
      (v_survey_id,'autorizacaoAcademica','Uso das respostas',v_order+190,'yes_no','Você autoriza que suas respostas, sem identificação pessoal, também sejam utilizadas em estudos acadêmicos e na elaboração de pré-projetos?','A resposta é opcional e não interfere na participação.',false,'[]'::jsonb,null),
      (v_survey_id,'C01','Contato opcional',v_order+200,'yes_no','Você deseja receber os resultados desta pesquisa ou informações sobre os temas apresentados?',null,false,'[]'::jsonb,null),
      (v_survey_id,'C02','Contato opcional',v_order+210,'single','O que você deseja receber?',null,false,'["Resultados da pesquisa","Informações sobre Dr. Vinícius Rezende","Informações sobre Olavo Keesen","Informações sobre os dois","Resultados e informações","Prefiro não receber"]'::jsonb,'{"field":"C01","equals":"Sim"}'::jsonb),
      (v_survey_id,'C03','Contato opcional',v_order+220,'single','Por qual canal prefere receber?',null,false,'["WhatsApp","E-mail","WhatsApp e e-mail"]'::jsonb,'{"field":"C01","equals":"Sim"}'::jsonb),
      (v_survey_id,'C04','Contato opcional',v_order+230,'short_text','Qual nome você deseja informar?',null,false,'[]'::jsonb,'{"field":"C01","equals":"Sim"}'::jsonb),
      (v_survey_id,'C05','Contato opcional',v_order+240,'short_text','Informe seu WhatsApp ou e-mail.',null,false,'[]'::jsonb,'{"field":"C01","equals":"Sim"}'::jsonb),
      (v_survey_id,'C06','Contato opcional',v_order+250,'yes_no','Você autoriza a NorteP a guardar esse contato somente para a finalidade escolhida?',null,false,'[]'::jsonb,'{"field":"C01","equals":"Sim"}'::jsonb);

    insert into public.audit_events(actor_id, action, entity, entity_id, metadata)
    values (v_founder, 'regional_survey_draft_prepared', 'survey', v_survey_id::text,
            jsonb_build_object('regional', v_region.regional_name, 'question_count', 26, 'status', 'draft'));
  end loop;
end;
$$;
