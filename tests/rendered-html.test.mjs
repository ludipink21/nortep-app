import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const hierarchy = await readFile(new URL("../supabase/migrations/20260730100000_supervisor_territory_and_mobilization.sql", import.meta.url), "utf8");
const officialPilot = await readFile(new URL("../supabase/migrations/20260730110000_reset_pilot_and_seed_surveys.sql", import.meta.url), "utf8");
const questionScope = await readFile(new URL("../supabase/migrations/20260730112000_fix_question_scope.sql", import.meta.url), "utf8");
const strategyObserver = await readFile(new URL("../supabase/migrations/20260730140000_strategy_observer_network.sql", import.meta.url), "utf8");

test("V48 mantém entradas separadas, supervisão e visão exclusiva da fundadora", () => {
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
  assert.match(page, /V48/);
  assert.match(layout, /sw\.js\?v=48/);
  assert.match(worker, /nortep-pesquisa-v48/);
  assert.match(layout, /nortep-icon-v1\.png/);
  assert.match(worker, /nortep-icon-v1\.png/);
  assert.match(layout, /location\.hostname === 'localhost'/);
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
