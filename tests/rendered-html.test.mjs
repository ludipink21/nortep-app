import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const faviconRoute = await readFile(new URL("../app/favicon.ico/route.ts", import.meta.url), "utf8");
const hierarchy = await readFile(new URL("../supabase/migrations/20260730100000_supervisor_territory_and_mobilization.sql", import.meta.url), "utf8");
const officialPilot = await readFile(new URL("../supabase/migrations/20260730110000_reset_pilot_and_seed_surveys.sql", import.meta.url), "utf8");
const questionScope = await readFile(new URL("../supabase/migrations/20260730112000_fix_question_scope.sql", import.meta.url), "utf8");
const strategyObserver = await readFile(new URL("../supabase/migrations/20260730140000_strategy_observer_network.sql", import.meta.url), "utf8");
const candidateMobilization = await readFile(new URL("../supabase/migrations/20260730170000_candidate_mobilization_control.sql", import.meta.url), "utf8");
const academy = await readFile(new URL("../app/academia.tsx", import.meta.url), "utf8");
const academyStyles = await readFile(new URL("../app/academia.css", import.meta.url), "utf8");
const academyContent = JSON.parse(await readFile(new URL("../app/academia-content.json", import.meta.url), "utf8"));
const academyV4Content = JSON.parse(await readFile(new URL("../app/academia-v51-content.json", import.meta.url), "utf8"));
const academyMigration = await readFile(new URL("../supabase/migrations/20260731150000_academia_nortep.sql", import.meta.url), "utf8");
const academyOperationalMigration = await readFile(new URL("../supabase/migrations/20260731230000_academia_v49_operacional.sql", import.meta.url), "utf8");
const academyV4Migration = await readFile(new URL("../supabase/migrations/20260802120000_academia_pesquisa_supervisao_v4.sql", import.meta.url), "utf8");
const academyManagement = await readFile(new URL("../app/academia-management.tsx", import.meta.url), "utf8");

test("V49 mantém entradas separadas, supervisão e visão exclusiva da fundadora", () => {
  for (const channel of ["principal", "administracao", "coordenacao", "supervisao", "observador", "pesquisador"]) {
    assert.match(page, new RegExp(`"${channel}"`));
  }
  assert.match(page, /Administradora fundadora/);
  assert.match(page, /Minha supervisão/);
  assert.match(page, /Mobilização e relacionamentos/);
  assert.match(page, /Painel Estratégico do Candidato/);
  assert.match(page, /REDE DE MOBILIZAÇÃO/);
  assert.match(page, /Ver todo o aplicativo/);
  assert.match(page, /Prévia exclusiva da fundadora/);
  assert.match(page, /bussolanortep@gmail\.com/);
  assert.match(page, /pesquisadecamponortep@gmail\.com/);
});

test("service worker e interface usam a mesma versão", () => {
  assert.match(page, /V49/);
  assert.match(layout, /sw\.js\?v=49/);
  assert.match(worker, /nortep-pesquisa-v49/);
  assert.match(layout, /nortep-icon-v1\.png/);
  assert.match(worker, /nortep-icon-v1\.png/);
  assert.match(layout, /location\.hostname === 'localhost'/);
});

test("favicon uses the official NorteP icon", () => {
  assert.match(faviconRoute, /nortep-icon-v1\.png/);
  assert.doesNotMatch(faviconRoute, /favicon\.svg/);
});

test("hierarquia territorial aplica menor privilégio", () => {
  assert.match(hierarchy, /create table if not exists public\.team_links/);
  assert.match(hierarchy, /create table if not exists public\.profile_territories/);
  assert.match(hierarchy, /Todo supervisor deve estar vinculado a um coordenador/);
  assert.match(hierarchy, /Supervisores podem convidar somente pesquisadores/);
  assert.match(hierarchy, /Somente a administradora fundadora pode criar outro administrador/);
  assert.match(hierarchy, /manager_can_access_profile/);
  assert.match(hierarchy, /revoke all on function public\.create_managed_access_invite/);
  assert.doesNotMatch(hierarchy, /delete from public\.profiles/);
  assert.doesNotMatch(hierarchy, /delete from public\.interviews/);
});

test("mobilização pública não expõe tabelas e exige consentimento", () => {
  assert.match(page, /O eleitor não cria conta/);
  assert.match(page, /Participação voluntária não é contratação/);
  assert.match(page, /Autorizo o uso acadêmico anonimizado/);
  assert.match(hierarchy, /submit_public_mobilization_response/);
  assert.match(hierarchy, /grant execute on function public\.get_public_mobilization_form\(text\) to anon/);
  assert.match(hierarchy, /revoke all on table public\.team_links, public\.profile_territories/);
});

test("painel do candidato é criado somente pela fundadora e não expõe eleitores", () => {
  assert.match(strategyObserver, /create_candidate_observer_invite/);
  assert.match(strategyObserver, /if not public\.is_primary_admin\(\)/);
  assert.match(strategyObserver, /observer_mode = 'candidato'/);
  assert.match(strategyObserver, /network_names_visible/);
  assert.doesNotMatch(strategyObserver, /respondent_name/);
  assert.doesNotMatch(strategyObserver, /contact_whatsapp/);
  assert.doesNotMatch(strategyObserver, /contact_email/);
});

test("candidato gerencia mobilização sem receber acesso administrativo", () => {
  assert.match(page, /Gerenciar mobilização/);
  assert.match(page, /Movimentação geral/);
  assert.match(candidateMobilization, /observer_mode = 'candidato'/);
  assert.match(candidateMobilization, /set_mobilization_partner_active/);
  assert.match(candidateMobilization, /candidate_operations_summary/);
  assert.doesNotMatch(candidateMobilization, /contact_email|contact_whatsapp|password/);
  assert.doesNotMatch(candidateMobilization, /\bdelete\s+from\b/i);
});

test("cada pesquisa pode ter vídeo final e a rede registra a origem da indicação", () => {
  assert.match(page, /Vídeo de agradecimento \(YouTube\)/);
  assert.match(page, /Indicado por/);
  assert.match(strategyObserver, /set_survey_thank_you_video_admin/);
  assert.match(strategyObserver, /mobilization_partners_parent_not_self/);
});

test("limpeza oficial preserva as contas autorizadas e cria quatro pesquisas", () => {
  assert.match(officialPilot, /bussolanortep@gmail\.com/);
  assert.match(officialPilot, /taniaracristine49@gmail\.com/);
  assert.match(officialPilot, /Betim: Saúde, Cuidado e Futuro/);
  assert.match(officialPilot, /Minas Gerais: Prioridades e Escolhas 2026/);
  assert.match(officialPilot, /Escuta Territorial: Bairro e Cidade/);
  assert.match(officialPilot, /NorteP: Participação, Apoio e Voluntariado/);
  assert.match(officialPilot, /'draft', 'electoral'/);
});

test("pesquisador vê somente perguntas das pesquisas liberadas", () => {
  assert.match(questionScope, /a\.survey_id = survey_questions\.survey_id/);
  assert.match(questionScope, /a\.researcher_id = auth\.uid\(\)/);
  assert.doesNotMatch(questionScope, /a\.survey_id = a\.survey_id/);
});

test("rascunho e fila offline permanecem no mesmo aparelho até sincronizar", () => {
  assert.match(page, /nortep-pendentes/);
  assert.match(page, /nortep-rascunho-/);
  assert.match(page, /Continuar de onde parou/);
  assert.match(page, /window\.addEventListener\("online", autoSync\)/);
  assert.match(worker, /\/\?acesso=pesquisador/);
});

test("capa pública não exibe instruções internas ou mapa físico", () => {
  assert.doesNotMatch(page, /Acesso somente para pessoas autorizadas/);
  assert.match(page, /Pesquisa, território e gestão em um só lugar/);
  assert.match(page, /Leitura operacional sem mapa físico/);
});

test("Formação NorteP está integrada ao Ecossistema sem substituir a V49", () => {
  assert.match(page, /import AcademiaNorteP from "\.\/academia"/);
  assert.match(page, /Formação NorteP/);
  assert.match(page, /<AcademiaNorteP/);
  assert.match(layout, /\.\/academia\.css/);
  assert.match(page, /session=\{session\}/);
  assert.match(academy, /Progresso protegido/);
  assert.match(academy, /Acompanhamento central ativado/);
  assert.match(academy, /Certificado emitido/);
  assert.match(academyStyles, /--academy-purple:#5b1734/);
  assert.match(academyStyles, /--academy-gold:#c69a3a/);
});

test("Academia tem entrada direta e aulas flexíveis para continuar depois", () => {
  assert.match(page, /\?produto=academia&acesso=pesquisador/);
  assert.match(page, /Abrir aulas e exercícios/);
  assert.match(page, /Estude no seu ritmo, salve o exercício e continue quando quiser/);
  assert.match(academy, /Salvar exercício/);
  assert.match(academy, /Concluir e continuar/);
  assert.match(academy, /Aula anterior/);
  assert.match(academy, /Você pode tentar novamente agora ou continuar e voltar depois/);
  assert.doesNotMatch(academy, /if \(!progress\.correctness\[lesson\.id\]/);
});

test("Academia contém trilhas, prática, avaliação, biblioteca e certificação", () => {
  const expectedRoles = ["pesquisador", "mobilizador", "supervisor", "coordenador", "administrador", "analista", "observador", "fundadora", "instrutor"];
  for (const role of expectedRoles) assert.ok(academyContent.roles[role], `trilha ausente: ${role}`);
  const commonLessons = academyContent.commonModules.flatMap(module => module.lessons);
  const roleLessons = Object.values(academyContent.roles).flatMap(track => track.modules.flatMap(module => module.lessons));
  assert.equal(commonLessons.length + roleLessons.length, 57);
  assert.match(academy, /EXERCÍCIO/);
  assert.match(academy, /AVALIAÇÃO RÁPIDA/);
  assert.match(academy, /Biblioteca/);
  assert.match(academy, /Certificação/);
  assert.match(academy, /Acompanhamento/);
});

test("Academia respeita o perfil atual e não contém credenciais administrativas", () => {
  assert.match(academy, /profile\.is_primary_admin/);
  assert.match(academy, /profile\.role === "admin"/);
  assert.doesNotMatch(academy, /service_role|SUPABASE_SERVICE_ROLE|secret[_-]?key/i);
  assert.doesNotMatch(JSON.stringify(academyContent), /service_role|SUPABASE_SERVICE_ROLE|secret[_-]?key/i);
});

test("Academia persiste progresso com RLS e não abre respostas corretas ao navegador", () => {
  assert.match(academyMigration, /create table if not exists public\.academy_lessons/);
  assert.match(academyMigration, /create table if not exists public\.academy_lesson_progress/);
  assert.match(academyMigration, /create table if not exists public\.academy_certificates/);
  assert.match(academyMigration, /security definer/);
  assert.match(academyMigration, /manager_can_access_profile/);
  assert.match(academyMigration, /revoke all on table public\.academy_lessons from public, anon, authenticated/);
  assert.match(academyMigration, /grant execute on function public\.save_academy_lesson_progress/);
  assert.doesNotMatch(academyMigration, /\bdelete\s+from\s+public\.(profiles|surveys|interviews|responses)\b/i);
  assert.doesNotMatch(academyMigration, /grant\s+select\s+on\s+table\s+public\.academy_lessons\s+to\s+authenticated/i);
});

test("gabaritos das 57 aulas ficam exclusivamente no servidor", () => {
  const rows = [...academyMigration.matchAll(/\('3\.0\.0','([^']+)','([^']+)',(\d+)\)/g)]
    .map(match => ({ role: match[1], lesson: match[2], answer: Number(match[3]) }));
  assert.equal(rows.length, 57);
  const lessons = [
    ...academyContent.commonModules.flatMap(module => module.lessons),
    ...Object.values(academyContent.roles).flatMap(track => track.modules.flatMap(module => module.lessons)),
  ];
  assert.ok(lessons.every(lesson => !("answer" in lesson.quiz)));
  assert.doesNotMatch(academy, /quiz\.answer/);
  assert.match(academy, /answer_correct/);
});

test("Academia operacional possui instrutoria, editor e fluxo editorial protegido", () => {
  assert.match(academy, /AcademyInstructorPanel/);
  assert.match(academy, /AcademyContentEditor/);
  assert.match(academyManagement, /Rascunho → revisão → aprovação → publicação/);
  assert.match(academyOperationalMigration, /academy_content_revisions/);
  assert.match(academyOperationalMigration, /status='review'/);
  assert.match(academyOperationalMigration, /status='approved'/);
  assert.match(academyOperationalMigration, /status='published'/);
  assert.match(academyOperationalMigration, /p_content - 'answer'/);
  assert.match(academyOperationalMigration, /#- '\{quiz,answer\}'/);
  assert.match(academyOperationalMigration, /revoke all on table public\.academy_content_revisions from public, anon, authenticated/);
  assert.match(academyOperationalMigration, /academy_track_assignments/);
  assert.match(academyOperationalMigration, /set_academy_track_assignment/);
  assert.match(academyManagement, /PERFIS DE ALUNOS/);
});

test("Academia V4 começa pelo aplicativo e separa Pesquisa, Supervisão e demais perfis", () => {
  assert.equal(academyV4Content.version, "4.0.0");
  assert.match(JSON.stringify(academyV4Content), /Apresentação: por que existe a NorteP/);
  assert.match(JSON.stringify(academyV4Content), /convite, cadastro e entrada segura/);
  assert.match(JSON.stringify(academyV4Content), /O que é uma pesquisa/);
  assert.match(JSON.stringify(academyV4Content), /Conhecendo o aplicativo/);
  assert.equal(academyV4Content.roles.pesquisador.modules.flatMap(module => module.lessons).length, 3);
  assert.equal(academyV4Content.roles.supervisor.modules.flatMap(module => module.lessons).length, 2);
  for (const role of ["mobilizador", "coordenador", "administrador", "analista", "observador", "fundadora"]) assert.equal(academyV4Content.roles[role].status, "coming_soon");
  assert.match(page, /Aulas e formação/);
  assert.match(page, /ir\("academia"\)/);
});

test("gabaritos V4 seguem no Supabase e vídeos ficam como espaços editáveis", () => {
  const lessons = [
    ...academyV4Content.commonModules.flatMap(module => module.lessons),
    ...academyV4Content.roles.pesquisador.modules.flatMap(module => module.lessons),
    ...academyV4Content.roles.supervisor.modules.flatMap(module => module.lessons),
  ];
  assert.equal(lessons.length, 9);
  assert.ok(lessons.every(lesson => !Object.hasOwn(lesson.quiz, "answer")));
  assert.ok(lessons.every(lesson => lesson.context && lesson.video && Object.hasOwn(lesson.video, "url")));
  assert.equal([...academyV4Migration.matchAll(/\('4\.0\.0','([^']+)','([^']+)',(\d+)\)/g)].length, 9);
  assert.match(academyV4Migration, /não remove usuários, entrevistas, pesquisas, respostas/i);
  assert.match(academy, /Espaço reservado para inserir o link do vídeo/);
});

test("prática, certificação anual, recertificação e progresso agregado estão integrados", () => {
  assert.match(academyOperationalMigration, /academy_practice_submissions/);
  assert.match(academyOperationalMigration, /maybe_issue_academy_certificate/);
  assert.match(academyOperationalMigration, /request_academy_recertification/);
  assert.match(academyOperationalMigration, /expires_at/);
  assert.match(academyOperationalMigration, /awaiting_practice/);
  assert.match(academyOperationalMigration, /recertification_due/);
  assert.match(academy, /Prática obrigatória/);
  assert.match(academy, /Solicitar recertificação/);
});
