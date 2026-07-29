import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260728090000_founder_and_role_boundaries.sql", import.meta.url), "utf8");
const structureGuard = await readFile(new URL("../supabase/migrations/20260728100000_founder_survey_structure_guard.sql", import.meta.url), "utf8");

test("V41 mantém entradas separadas por função e visão exclusiva da fundadora", () => {
  for (const channel of ["principal", "administracao", "coordenacao", "observador", "pesquisador"]) {
    assert.match(page, new RegExp(`"${channel}"`));
  }
  assert.match(page, /Administradora fundadora/);
  assert.match(page, /Criar coordenador/);
  assert.match(page, /Minha coordenação/);
  assert.match(page, /Ver todo o aplicativo/);
  assert.match(page, /Prévia exclusiva da fundadora/);
  assert.match(page, /bussolanortep@gmail\.com/);
});

test("service worker e interface usam a mesma versão", () => {
  assert.match(page, /V41/);
  assert.match(layout, /sw\.js\?v=41/);
  assert.match(worker, /nortep-pesquisa-v41/);
});

test("permissões críticas ficam protegidas no banco", () => {
  assert.match(migration, /Somente a administradora fundadora pode criar outro administrador/);
  assert.match(migration, /revoke all on function public\.create_access_invite\(text, text\) from public, anon/);
  assert.match(structureGuard, /survey_questions_founder_guard/);
  assert.match(structureGuard, /public\.is_primary_admin\(\)/);
});
