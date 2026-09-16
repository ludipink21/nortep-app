import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// These identities exist only in intercepted localhost requests. No production
// login, profile, supporter, survey or analytics endpoint is contacted.
const base = 'http://127.0.0.1:3120';
const screenshots = process.env.NORTEP_SCREENSHOTS || '/tmp/nortep-electoral-screenshots';
await mkdir(screenshots, { recursive: true });
const executablePath = process.env.NORTEP_CHROMIUM_PATH;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3120'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/api/analise-eleitoral/dados', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(ready, serverLog);
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const fixture = { id: '00000000-0000-4000-8000-000000000001', name: 'Prévia NorteP', email: 'preview@example.invalid', role: 'admin', admin_level: 'founder', is_primary_admin: true, active: true, access_removed_at: null };
  const dataset = JSON.parse(await readFile(new URL('../app/analise-eleitoral/data/mg-2024.json', import.meta.url)));
  const betim = dataset.contests.find(c => c.id === '619:41335');
  const heron = betim.candidates.find(c => c.name === 'HERON GUIMARAES');
  const vinicius = betim.candidates.find(c => c.name === 'DR.VINICIUS');
  const errors = [];
  async function contextFor(profile = fixture, saved = null, loggedIn = true) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    await context.route('https://**/*', async route => {
      const url = new URL(route.request().url());
      if (!url.hostname.endsWith('.supabase.co')) return route.abort();
      let body = [];
      if (url.pathname === '/auth/v1/user') body = { id: profile.id };
      else if (url.pathname === '/rest/v1/profiles') body = [profile];
      else if (url.pathname.includes('/rpc/')) body = [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await context.addInitScript(({ profile, saved, loggedIn }) => {
      if (loggedIn) localStorage.setItem('nortep-sessao', JSON.stringify({ access_token: 'local-test-only', refresh_token: 'local-test-only', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: profile.id } }));
      if (saved) localStorage.setItem('nortep-eleitoral-consultas-v1:00000000-0000-4000-8000-000000000001', saved);
    }, { profile, saved, loggedIn });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    return { context, page };
  }
  const { context, page } = await contextFor();
  const appWrites = [];
  page.on('request', r => { if (r.url().includes('.supabase.co') && r.method() !== 'GET') appWrites.push(r.method() + ' ' + new URL(r.url()).pathname); });
  await page.goto(base + '/analise-eleitoral');
  await page.getByRole('button', { name: 'Começar uma consulta' }).waitFor();
  await page.screenshot({ path: screenshots + '/NorteP-Analise-Inicio.png', fullPage: true });
  await page.getByRole('button', { name: 'Começar uma consulta' }).click();
  await page.getByRole('heading', { name: /Conheça os resultados|Uma cidade/ }).waitFor();
  assert.match(await page.locator('.ea-metrics').innerText(), /206\.941/);
  await page.getByRole('checkbox', { name: 'Comparar HERON GUIMARAES', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Comparar DR.VINICIUS', exact: true }).check();
  assert.equal(await page.getByRole('checkbox', { name: 'Comparar ZULU', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Comparar selecionados' }).click();
  assert.match(await page.locator('.ea-explanation').innerText(), /29\.461/);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: screenshots + '/NorteP-Analise-Comparacao.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar consulta', exact: true }).click();
  await page.getByLabel('Nome da consulta').fill('Betim — minha consulta');
  await page.locator('.ea-save-form button[type=submit]').click();
  await page.getByRole('button', { name: /^Minhas consultas/ }).click();
  await page.getByRole('heading', { name: 'Betim — minha consulta' }).waitFor();
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  assert.equal(await page.getByLabel('Candidato 1').inputValue(), heron.id);
  assert.equal(await page.getByLabel('Candidato 2').inputValue(), vinicius.id);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar dados' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  const csv = await readFile(downloadPath, 'utf8');
  assert.match(csv, /Tribunal Superior Eleitoral/);
  assert.match(csv, /HERON GUIMARAES/);
  assert.match(csv, /DR\.VINICIUS/);
  await page.getByLabel('Recorte', { exact: true }).selectOption(Object.keys(betim.zones)[0]);
  const zoneTotal = betim.zones[Object.keys(betim.zones)[0]].valid;
  assert.match(await page.locator('.ea-metrics').innerText(), new RegExp(zoneTotal.toLocaleString('pt-BR').replaceAll('.', '\\.')));
  await page.getByLabel('Município', { exact: true }).selectOption('41238'); // Belo Horizonte
  assert.equal(await page.getByLabel('Candidato 1').inputValue(), '');
  const rounds = await page.getByLabel('Turno', { exact: true }).locator('option').count();
  assert.equal(rounds, 2);
  await page.getByLabel('Turno', { exact: true }).selectOption({ label: '2º turno' });
  assert.match(await page.locator('.ea-toolbar').innerText(), /2º turno/);
  await page.getByRole('button', { name: 'Consultar resultados', exact: true }).click();
  await page.getByPlaceholder('Buscar nome, número ou partido').fill('NOME INEXISTENTE');
  await page.getByRole('heading', { name: 'Nenhum candidato encontrado.' }).waitFor();
  await page.getByRole('button', { name: 'Limpar busca' }).click();
  // Restore comparison from a copied link.
  await page.goto(base + `/analise-eleitoral?eleicao=${betim.id}&candidato=${heron.id}&candidato=${vinicius.id}`);
  await page.locator('.ea-compare-cards').waitFor();
  assert.equal(await page.getByLabel('Candidato 2').inputValue(), vinicius.id);
  assert.deepEqual(appWrites, [], 'electoral browsing must not write to Supabase');
  const stored = await page.evaluate(() => localStorage.getItem('nortep-eleitoral-consultas-v1:00000000-0000-4000-8000-000000000001'));
  assert.equal(JSON.parse(stored).length, 1);
  // Mobile navigation, selections and readable layout.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ea-sidebar').getBoundingClientRect().right <= 1);
  await page.screenshot({ path: screenshots + '/NorteP-Analise-Celular.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile page overflows');
  await page.getByRole('button', { name: 'Começar uma consulta' }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile results overflow');
  // Same production component, real founder identity, no writes in preview.
  await page.goto(base + '/analise-eleitoral?previa=supervisor');
  await page.locator('.ea-preview').waitFor();
  await page.getByRole('button', { name: 'Começar uma consulta' }).click();
  assert.equal(await page.getByRole('button', { name: 'Salvar consulta', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('nortep-eleitoral-consultas-v1:00000000-0000-4000-8000-000000000001')), stored);
  await page.goto(base + '/analise-eleitoral?previa=pesquisador');
  await page.getByRole('heading', { name: 'Um acesso para cada função.' }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/?abrir=ecossistema');
  await page.locator('.np-hub').waitFor();
  await page.mouse.move(1439, 0);
  await page.screenshot({ path: screenshots + '/NorteP-Ecossistema.png', fullPage: true });
  await page.getByRole('link', { name: /Análise Eleitoral/ }).first().click();
  await page.getByRole('button', { name: 'Começar uma consulta' }).waitFor();
  await page.goto(base + '/?abrir=visoes');
  await page.locator('.np-electoral-preview-links').waitFor();
  await page.locator('.np-electoral-preview-links').getByRole('link', { name: 'Supervisão' }).click();
  await page.locator('.ea-preview').waitFor();
  // Approved roles still respect account separation and active status.
  const other = await contextFor({ ...fixture, id: '00000000-0000-4000-8000-000000000002', role: 'supervisor', admin_level: null, is_primary_admin: false }, stored);
  await other.page.goto(base + '/analise-eleitoral?previa=admin');
  await other.page.getByRole('button', { name: /^Minhas consultas/ }).click();
  await other.page.getByRole('heading', { name: 'Sua próxima consulta pode ficar aqui.' }).waitFor();
  assert.equal(await other.page.locator('.ea-preview').count(), 0, 'secondary role cannot enter founder preview');
  const inactive = await contextFor({ ...fixture, active: false });
  await inactive.page.goto(base + '/analise-eleitoral');
  await inactive.page.getByRole('alert').waitFor();
  assert.equal(await inactive.page.locator('.ea-shell').count(), 0);
  const anonymous = await contextFor(fixture, null, false);
  await anonymous.page.goto(base + `/analise-eleitoral?eleicao=${betim.id}&candidato=${heron.id}&candidato=${vinicius.id}`);
  await anonymous.page.getByRole('link', { name: 'Administração principal', exact: true }).waitFor();
  assert.match(await anonymous.page.getByRole('link', { name: 'Administração principal', exact: true }).getAttribute('href'), /eleicao=619%3A41335/);
  // A login redirect preserves the shared query with a fixed local destination.
  await page.goto(base + `/?acesso=principal&continuar=analise-eleitoral&eleicao=${betim.id}&candidato=${heron.id}&candidato=${vinicius.id}`);
  await page.locator('.ea-compare-cards').waitFor();
  assert.equal(await page.getByLabel('Candidato 2').inputValue(), vinicius.id);
  assert.deepEqual(errors, [], 'browser runtime errors');
  await Promise.all([context.close(), other.context.close(), inactive.context.close(), anonymous.context.close()]);
  console.log('PASS: official data, city/zone/round filters, compare, save/reopen, CSV, copied links, mobile, founder preview, account separation, inactive access, ecosystem navigation and login return.');
  console.log('Screenshots: ' + screenshots);
} finally {
  await browser?.close();
  server.kill();
}
