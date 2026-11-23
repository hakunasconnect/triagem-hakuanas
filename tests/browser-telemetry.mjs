// Ponta a ponta em Chromium real: login do triador no app -> uso registrado no Supabase real -> visto pelo admin.
// Uso: CHROME_PATH=... SUPABASE_ACCESS_TOKEN=... node tests/browser-telemetry.mjs
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const REF = 'wwfkazbjiutihtexqknm', base = `https://${REF}.supabase.co`, MGMT = process.env.SUPABASE_ACCESS_TOKEN;
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: 'Bearer ' + MGMT } })).json();
const service = keys.find(k => k.name === 'service_role').api_key;
const adminApi = (path, init = {}) => fetch(base + path, { ...init, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const sql = async q => (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + MGMT, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json());
const email = `tel-${Date.now()}@example.com`, password = 'Prov1sória-' + Math.random().toString(36).slice(2) + '!';
const u = await (await adminApi('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
await sql(`update public.profiles set full_name='Triador Teste', legend_number='004321' where id='${u.id}'`);
const html = await readFile('dist/index.html');
const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(html); }).listen(0);
let browser; const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.click('[data-tab=settings]');
  await page.waitForSelector('#account-form');
  await page.fill('#account-form [name=email]', email); await page.fill('#account-form [name=password]', password);
  await page.click('#account-form button[type=submit]');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#account-error').textContent(), '', 'sem aceite, o login não pode seguir');
  assert.equal(await page.locator('#account-out').count(), 0, 'login não pode ocorrer sem o aceite');
  console.log('OK: sem marcar o aceite, o login é barrado');
  await page.check('#account-form [name=consent]'); await page.click('#account-form button[type=submit]');
  await page.waitForSelector('#account-out');
  assert.equal(await page.inputValue('[name=triager]'), 'Triador Teste');
  assert.equal(await page.inputValue('[name=legendNumber]'), '004321');
  console.log('OK: login conecta e preenche triador e nº de Legendário no cabeçalho');
  await page.click('[data-tab=book]'); await page.click('[data-tab=calc]');
  await page.waitForTimeout(4500);
  const sess = await sql(`select id, app_version, started_at is not null as s from public.usage_sessions where user_id='${u.id}'`);
  assert.equal(sess.length, 1);
  const evs = await sql(`select event_type, meta from public.usage_events where user_id='${u.id}' order by id`);
  const types = evs.map(e => e.event_type);
  assert.ok(types.includes('login') && types.filter(t => t === 'screen_view').length >= 2, JSON.stringify(types));
  assert.ok(evs.some(e => e.meta.screen === 'book') && evs.some(e => e.meta.screen === 'calc'));
  console.log('OK: sessão e telas abertas gravadas no banco: ' + types.join(', '));
  assert.ok(!JSON.stringify(evs).match(/@|Triador Teste|004321/), 'dado pessoal vazou nas métricas');
  console.log('OK: nenhum e-mail, nome ou número de Legendário nas métricas');
  await page.click('[data-tab=settings]'); await page.click('#account-out'); await page.waitForSelector('#account-form');
  await page.waitForTimeout(800);
  const end = await sql(`select ended_at is not null as ended from public.usage_sessions where user_id='${u.id}'`);
  assert.equal(end[0].ended, true);
  assert.ok((await sql(`select 1 from public.usage_events where user_id='${u.id}' and event_type='logout'`)).length === 1);
  console.log('OK: sair encerra a sessão e registra a saída');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close(); server.close();
  await adminApi('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
}
