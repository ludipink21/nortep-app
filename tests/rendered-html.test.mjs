import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260728090000_founder_and_role_boundaries.sql", import.meta.url), "utf8");
const structureGuard = await readFile(new URL("../supabase/migrations/20260728100000_founder_survey_structure_guard.sql", import.meta.url), "utf8");
const teamScope = await readFile(new URL("../supabase/migrations/20260728130000_coordinator_team_scope.sql", import.meta.url), "utf8");
const territoryScope = await readFile(new URL("../supabase/migrations/20260729100000_coordinator_territories_and_invite_hierarchy.sql", import.meta.url), "utf8");

test("V43 mantém entradas separadas por função, equipes próprias e visão exclusiva da fundadora", () => {
  for (const channel of ["principal", "administracao", "coordenacao", "observador", "pesquisador"]) {
    assert.match(page, new RegExp(`"${channel}"`));
  }
  assert.match(page, /Administradora fundadora/);
  assert.match(page, /Novo acesso de campo/);
  assert.match(page, /Minha coordenação/);
  assert.match(page, /Ver todo o aplicativo/);
  assert.match(page, /Prévia exclusiva da fundadora/);
  assert.match(page, /bussolanortep@gmail\.com/);
  assert.match(page, /Entrar ou cadastrar/);
  assert.doesNotMatch(page, /Decisões mais próximas das pessoas/);
  assert.match(page, /pesquisadecamponortep@gmail\.com/);
});

test("service worker e interface usam a mesma versão", () => {
  assert.match(page, /V43/);
  assert.match(layout, /sw\.js\?v=43/);
  assert.match(worker, /nortep-pesquisa-v43/);
});

test("permissões críticas ficam protegidas no banco", () => {
  assert.match(migration, /Somente a administradora fundadora pode criar outro administrador/);
  assert.match(migration, /revoke all on function public\.create_access_invite\(text, text\) from public, anon/);
  assert.match(structureGuard, /survey_questions_founder_guard/);
  assert.match(structureGuard, /public\.is_primary_admin\(\)/);
});

test("V42 limita coordenadores à própria equipe sem apagar dados", () => {
  assert.match(teamScope, /drop trigger if exists profiles_assign_on_activation/);
  assert.match(teamScope, /create table if not exists public\.coordinator_memberships/);
  assert.match(teamScope, /Coordenadores podem convidar somente pesquisadores da própria equipe/);
  assert.match(teamScope, /coordinator_can_access_researcher/);
  assert.match(teamScope, /Somente a administradora fundadora pode criar outro administrador/);
  assert.doesNotMatch(teamScope, /delete from public\.profiles/);
  assert.doesNotMatch(teamScope, /delete from public\.interviews/);
});

test("V43 organiza convites e territórios pela hierarquia correta", () => {
  assert.match(page, /A administração cria coordenadores e define seus territórios/);
  assert.match(page, /O pesquisador será vinculado automaticamente à sua equipe/);
  assert.match(page, /Definir territórios/);
  assert.match(territoryScope, /Pesquisadores devem ser convidados pelo coordenador responsável/);
  assert.match(territoryScope, /create table if not exists public\.coordinator_territories/);
  assert.match(territoryScope, /Somente a administradora fundadora pode criar outro administrador/);
  assert.doesNotMatch(territoryScope, /delete from public\.profiles/);
  assert.doesNotMatch(territoryScope, /delete from public\.interviews/);
});
