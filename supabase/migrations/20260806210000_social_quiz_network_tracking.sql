-- Quiz público de escuta comunitária para redes sociais.
-- Respostas e contatos são armazenados separadamente. O painel só expõe agregados.

create table if not exists public.social_quiz_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  channel text not null check (channel in ('instagram','facebook','tiktok','whatsapp','youtube','outro')),
  label text not null default '', intro_video_url text, thank_you_video_url text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.social_quiz_questions (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  section text not null default 'Quiz', sort_order integer not null,
  type text not null check (type in ('single','multiple')), prompt text not null,
  help_text text, required boolean not null default false,
  options jsonb not null default '[]'::jsonb, condition jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.social_quiz_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.social_quiz_links(id) on delete cascade,
  anonymous_id text not null check (length(anonymous_id) between 8 and 120),
  event_type text not null check (event_type in ('visit','start','submit')),
  created_at timestamptz not null default now(), unique (link_id, anonymous_id, event_type)
);

create table if not exists public.social_quiz_responses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('QR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  link_id uuid not null references public.social_quiz_links(id) on delete restrict,
  anonymous_id text not null check (length(anonymous_id) between 8 and 120),
  answers jsonb not null default '{}'::jsonb, regional text,
  created_at timestamptz not null default now(), unique (link_id, anonymous_id)
);

create table if not exists public.social_quiz_contacts (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.social_quiz_links(id) on delete restrict,
  respondent_name text, whatsapp text, email text, contact_choice text not null,
  created_at timestamptz not null default now()
);

alter table public.social_quiz_links enable row level security;
alter table public.social_quiz_questions enable row level security;
alter table public.social_quiz_events enable row level security;
alter table public.social_quiz_responses enable row level security;
alter table public.social_quiz_contacts enable row level security;
revoke all on public.social_quiz_links, public.social_quiz_questions, public.social_quiz_events, public.social_quiz_responses, public.social_quiz_contacts from anon, authenticated;

insert into public.social_quiz_questions(code,section,sort_order,type,prompt,help_text,required,options,condition) values
('regional','Onde você está',10,'single','Qual regional de Betim mais combina com onde você mora ou vive o dia a dia?','Escolha uma opção. Se não morar em Betim, tudo bem.',true,'["Alterosas","Centro","Citrolândia","Icaivera","Imbiruçu","Norte","Petrovale","PTB","Teresópolis","Vianópolis","Não moro em Betim","Prefiro não informar"]',null),
('prioridade','Sua prioridade',20,'single','Se pudesse apertar um botão e melhorar UMA coisa agora, qual seria?','Escolha o tema que mais faria diferença no seu dia a dia.',true,'["Saúde","Emprego e renda","Segurança","Educação","Transporte e trânsito","Moradia","Obras e infraestrutura","Assistência social","Lazer, esporte e cultura","Meio ambiente"]',null),
('mudanca','Mudança prática',30,'single','Qual destas mudanças você sentiria mais rápido na rotina?','Sem resposta certa ou errada.',true,'["Atendimento de saúde mais rápido","Mais oportunidades de trabalho e renda","Ruas e iluminação melhores","Mais segurança no bairro","Transporte mais eficiente","Mais vagas e qualidade na educação","Mais atividades para jovens e famílias","Apoio social mais próximo"]',null),
('participacao','Comunidade',40,'single','E você com a sua comunidade: como costuma participar?','Pode ser associação, igreja, escola, esporte, grupo de bairro ou outra ação local.',true,'["Já participo com frequência","Participo às vezes","Ainda não, mas tenho vontade","Prefiro só acompanhar"]',null),
('reuniao','Bora conversar?',50,'single','Você toparia uma conversa rápida para falar sobre sua região?','A participação é sempre opcional.',true,'["Sim, on-line","Sim, presencial","Tanto faz","Talvez","Não por enquanto"]',null),
('voluntario','Participação',60,'single','Você teria interesse em conhecer ações voluntárias na comunidade?','Sem vínculo de emprego e sem obrigação.',true,'["Sim, quero conhecer","Talvez, dependendo da atividade","Não por enquanto"]',null),
('formato','Conteúdo',70,'multiple','Que tipo de conteúdo você mais gosta de ver nas redes?','Escolha até 2.',true,'["Vídeo curto","Stories","Cards com dados","Live/conversa ao vivo","Texto curto","Áudio/podcast"]',null),
('resultado','Fechando',80,'single','Você gostaria de receber o resultado deste quiz quando tivermos uma base maior?','Seu contato só será pedido depois e ficará separado das respostas.',true,'["Sim","Talvez","Não"]',null)
on conflict (code) do update set section=excluded.section,sort_order=excluded.sort_order,type=excluded.type,prompt=excluded.prompt,help_text=excluded.help_text,required=excluded.required,options=excluded.options,condition=excluded.condition,active=true,updated_at=now();

create or replace function public.create_social_quiz_link(p_channel text,p_label text default '',p_intro_video_url text default null,p_thank_you_video_url text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_link public.social_quiz_links;
begin
 if not public.can_manage_mobilization() then raise exception 'Acesso não autorizado para gerar links de redes.'; end if;
 if p_channel not in ('instagram','facebook','tiktok','whatsapp','youtube','outro') then raise exception 'Rede social inválida.'; end if;
 insert into public.social_quiz_links(channel,label,intro_video_url,thank_you_video_url,created_by)
 values(p_channel,left(trim(coalesce(p_label,'')),120),nullif(trim(coalesce(p_intro_video_url,'')),''),nullif(trim(coalesce(p_thank_you_video_url,'')),''),auth.uid()) returning * into v_link;
 return jsonb_build_object('id',v_link.id,'code',v_link.code,'channel',v_link.channel,'label',v_link.label);
end $$;

create or replace function public.set_social_quiz_link_active(p_link_id uuid,p_active boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_link public.social_quiz_links;
begin
 if not public.can_manage_mobilization() then raise exception 'Acesso não autorizado.'; end if;
 update public.social_quiz_links set active=coalesce(p_active,false),updated_at=now() where id=p_link_id returning * into v_link;
 if v_link.id is null then raise exception 'Link não encontrado.'; end if;
 return jsonb_build_object('id',v_link.id,'active',v_link.active);
end $$;

create or replace function public.get_social_quiz_form(p_code text) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('link',jsonb_build_object('channel',l.channel,'label',l.label,'intro_video_url',l.intro_video_url,'thank_you_video_url',l.thank_you_video_url),'questions',coalesce((select jsonb_agg(jsonb_build_object('code',q.code,'section',q.section,'sort_order',q.sort_order,'type',q.type,'prompt',q.prompt,'help_text',q.help_text,'required',q.required,'options',q.options,'condition',q.condition) order by q.sort_order) from public.social_quiz_questions q where q.active),'[]'::jsonb)) from public.social_quiz_links l where l.code=upper(trim(coalesce(p_code,''))) and l.active;
$$;

create or replace function public.record_social_quiz_event(p_code text,p_anonymous_id text,p_event_type text) returns boolean language plpgsql security definer set search_path=public as $$
declare v_link_id uuid;
begin
 if p_event_type not in ('visit','start','submit') then raise exception 'Evento inválido.'; end if;
 if length(trim(coalesce(p_anonymous_id,'')))<8 then raise exception 'Identificador inválido.'; end if;
 select id into v_link_id from public.social_quiz_links where code=upper(trim(coalesce(p_code,''))) and active;
 if v_link_id is null then raise exception 'Link indisponível.'; end if;
 insert into public.social_quiz_events(link_id,anonymous_id,event_type) values(v_link_id,left(trim(p_anonymous_id),120),p_event_type) on conflict(link_id,anonymous_id,event_type) do nothing;
 return true;
end $$;

create or replace function public.submit_social_quiz_response(p_code text,p_anonymous_id text,p_answers jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_link public.social_quiz_links;v_response public.social_quiz_responses;v_required text[]:=array['regional','prioridade','mudanca','participacao','reuniao','voluntario','formato','resultado'];v_key text;
begin
 if length(trim(coalesce(p_anonymous_id,'')))<8 then raise exception 'Identificador inválido.'; end if;
 select * into v_link from public.social_quiz_links where code=upper(trim(coalesce(p_code,''))) and active;
 if v_link.id is null then raise exception 'Link indisponível.'; end if;
 foreach v_key in array v_required loop if nullif(trim(coalesce(p_answers->>v_key,'')),'') is null then raise exception 'Preencha todas as perguntas do quiz.'; end if; end loop;
 insert into public.social_quiz_responses(link_id,anonymous_id,answers,regional) values(v_link.id,left(trim(p_anonymous_id),120),coalesce(p_answers,'{}'),nullif(trim(p_answers->>'regional'),'')) on conflict(link_id,anonymous_id) do update set answers=excluded.answers,regional=excluded.regional returning * into v_response;
 insert into public.social_quiz_events(link_id,anonymous_id,event_type) values(v_link.id,left(trim(p_anonymous_id),120),'submit') on conflict(link_id,anonymous_id,event_type) do nothing;
 return jsonb_build_object('code',v_response.code,'thank_you_video_url',v_link.thank_you_video_url);
end $$;

create or replace function public.submit_social_quiz_contact(p_code text,p_name text default null,p_whatsapp text default null,p_email text default null,p_contact_choice text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_link_id uuid;v_id uuid;
begin
 select id into v_link_id from public.social_quiz_links where code=upper(trim(coalesce(p_code,''))) and active;
 if v_link_id is null then raise exception 'Link indisponível.'; end if;
 if nullif(trim(coalesce(p_contact_choice,'')),'') is null then raise exception 'Escolha a finalidade do contato.'; end if;
 if nullif(trim(coalesce(p_whatsapp,'')),'') is null and nullif(trim(coalesce(p_email,'')),'') is null then raise exception 'Informe WhatsApp ou e-mail.'; end if;
 insert into public.social_quiz_contacts(link_id,respondent_name,whatsapp,email,contact_choice) values(v_link_id,nullif(left(trim(coalesce(p_name,'')),120),''),nullif(left(trim(coalesce(p_whatsapp,'')),40),''),nullif(left(lower(trim(coalesce(p_email,''))),160),''),left(trim(p_contact_choice),180)) returning id into v_id;
 return jsonb_build_object('saved',true,'contact_id',v_id);
end $$;

create or replace function public.list_social_quiz_links() returns table(id uuid,code text,channel text,label text,intro_video_url text,thank_you_video_url text,active boolean,created_at timestamptz,visits bigint,starts bigint,submissions bigint,contacts bigint,meeting_interest bigint,volunteer_interest bigint) language plpgsql security definer set search_path=public as $$
begin
 if not public.can_manage_mobilization() then raise exception 'Acesso não autorizado.'; end if;
 return query select l.id,l.code,l.channel,l.label,l.intro_video_url,l.thank_you_video_url,l.active,l.created_at,
 (select count(*) from public.social_quiz_events e where e.link_id=l.id and e.event_type='visit'),(select count(*) from public.social_quiz_events e where e.link_id=l.id and e.event_type='start'),(select count(*) from public.social_quiz_responses r where r.link_id=l.id),(select count(*) from public.social_quiz_contacts c where c.link_id=l.id),(select count(*) from public.social_quiz_responses r where r.link_id=l.id and r.answers->>'reuniao' in ('Sim, on-line','Sim, presencial','Tanto faz')),(select count(*) from public.social_quiz_responses r where r.link_id=l.id and r.answers->>'voluntario'='Sim, quero conhecer') from public.social_quiz_links l order by l.created_at desc;
end $$;

create or replace function public.social_quiz_summary() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_total bigint;v_visits bigint;v_starts bigint;
begin
 if not public.can_manage_mobilization() then raise exception 'Acesso não autorizado.'; end if;
 select count(*) into v_total from public.social_quiz_responses;select count(*) into v_visits from public.social_quiz_events where event_type='visit';select count(*) into v_starts from public.social_quiz_events where event_type='start';
 return jsonb_build_object('total_responses',v_total,'visits',v_visits,'starts',v_starts,'sample_label',case when v_total<10 then 'Base inicial: leia como sinal, não como retrato da população.' else 'Base em crescimento: continue tratando os resultados como participação espontânea, não amostra representativa.' end,
 'by_channel',coalesce((select jsonb_agg(row_to_json(x) order by x.responses desc,x.channel) from(select l.channel,count(distinct e.anonymous_id) filter(where e.event_type='visit') visits,count(distinct e.anonymous_id) filter(where e.event_type='start') starts,count(distinct r.id) responses from public.social_quiz_links l left join public.social_quiz_events e on e.link_id=l.id left join public.social_quiz_responses r on r.link_id=l.id group by l.channel)x),'[]'),
 'priorities',coalesce((select jsonb_agg(row_to_json(x) order by x.responses desc,x.label) from(select answers->>'prioridade' label,count(*) responses from public.social_quiz_responses where nullif(answers->>'prioridade','') is not null group by answers->>'prioridade')x),'[]'),
 'formats',coalesce((select jsonb_agg(row_to_json(x) order by x.responses desc,x.label) from(select value label,count(*) responses from public.social_quiz_responses r,lateral unnest(string_to_array(coalesce(r.answers->>'formato',''),'||')) value where value<>'' group by value)x),'[]'),
 'regions',coalesce((select jsonb_agg(row_to_json(x) order by x.responses desc,x.label) from(select regional label,count(*) responses from public.social_quiz_responses where nullif(regional,'') is not null group by regional)x),'[]'),
 'participation',coalesce((select jsonb_agg(row_to_json(x) order by x.responses desc,x.label) from(select answers->>'participacao' label,count(*) responses from public.social_quiz_responses where nullif(answers->>'participacao','') is not null group by answers->>'participacao')x),'[]'),
 'meeting_interest',(select count(*) from public.social_quiz_responses where answers->>'reuniao' in ('Sim, on-line','Sim, presencial','Tanto faz')),'volunteer_interest',(select count(*) from public.social_quiz_responses where answers->>'voluntario'='Sim, quero conhecer'),'contacts',(select count(*) from public.social_quiz_contacts));
end $$;

revoke all on function public.create_social_quiz_link(text,text,text,text), public.set_social_quiz_link_active(uuid,boolean), public.get_social_quiz_form(text), public.record_social_quiz_event(text,text,text), public.submit_social_quiz_response(text,text,jsonb), public.submit_social_quiz_contact(text,text,text,text,text), public.list_social_quiz_links(), public.social_quiz_summary() from public;
grant execute on function public.create_social_quiz_link(text,text,text,text), public.set_social_quiz_link_active(uuid,boolean), public.list_social_quiz_links(), public.social_quiz_summary() to authenticated;
grant execute on function public.get_social_quiz_form(text), public.record_social_quiz_event(text,text,text), public.submit_social_quiz_response(text,text,jsonb), public.submit_social_quiz_contact(text,text,text,text,text) to anon, authenticated;

create or replace function public.list_vault_contacts(p_token text,p_limit integer default 100) returns table(interview_id uuid,respondent_name text,contact_choice text,contact_whatsapp text,contact_email text,created_at timestamptz) language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.vault_sessions where profile_id=auth.uid() and token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and expires_at>now()) then raise exception 'Cofre bloqueado ou sessão expirada.'; end if;
 insert into public.audit_events(actor_id,action,entity,entity_id,metadata) values(auth.uid(),'vault_contacts_viewed','contact_vault',auth.uid()::text,jsonb_build_object('limit',least(greatest(coalesce(p_limit,100),1),250)));
 return query select source.interview_id,source.respondent_name,source.contact_choice,source.contact_whatsapp,source.contact_email,source.created_at from(
  select c.interview_id,c.respondent_name,c.contact_choice,c.contact_whatsapp,c.contact_email,c.created_at from public.contact_vault c
  union all select mc.response_id,mc.respondent_name,concat_ws(' · ','Mobilização',case when mr.content_opt_in then 'conteúdo' end,case when mr.meetings_opt_in then 'encontros' end,case when mr.volunteer_opt_in then 'voluntariado' end,case when mr.academic_consent then 'uso acadêmico anonimizado' end),mc.whatsapp,mc.email,mc.created_at from public.mobilization_contacts mc join public.mobilization_responses mr on mr.id=mc.response_id
  union all select sc.id,sc.respondent_name,'Quiz das redes · '||sc.contact_choice,sc.whatsapp,sc.email,sc.created_at from public.social_quiz_contacts sc
 )source order by source.created_at desc limit least(greatest(coalesce(p_limit,100),1),250);
end $$;
