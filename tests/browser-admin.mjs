// Teste em navegador real (Chromium) do /admin contra o Supabase real, com usuários descartáveis.
// Uso: SUPABASE_ACCESS_TOKEN=... node tests/browser-admin.mjs
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const REF = 'wwfkazbjiutihtexqknm', base = `https://${REF}.supabase.co`, MGMT = process.env.SUPABASE_ACCESS_TOKEN;
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: 'Bearer ' + MGMT } })).json();
const service = keys.find(k => k.name === 'service_role').api_key;
const adminApi = (path, init = {}) => fetch(base + path, { ...init, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const sql = q => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + MGMT, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
const mk = async (role, mustChange) => {
  const email = `br-${role}-${Date.now()}@example.com`, password = 'Prov1sória-' + Math.random().toString(36).slice(2) + '!';
  const u = await (await adminApi('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) })).json();
  await sql(`update public.profiles set role='${role}', must_change_password=${mustChange}, full_name='Teste ${role}' where id='${u.id}'`);
  return { id: u.id, email, password };
};
const html = await readFile('dist/admin.html');
const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(html); }).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const admin = await mk('admin_master', true), plain = await mk('triador', false);
let browser; const errors = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const [name, w, h] of [['desktop', 1280, 900], ['mobile', 390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } }), page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message)); page.on('console', m => m.type() === 'error' && !/status of 400/.test(m.text()) && errors.push(name + ' console: ' + m.text()));
    await page.goto(url);
    await page.fill('#e', plain.email); await page.fill('#p', plain.password); await page.click('button[type=submit]');
    await page.waitForSelector('text=restrito ao admin master');
    console.log(`OK ${name}: usuário comum é barrado`);
    await page.fill('#e', admin.email); await page.fill('#p', 'senha-errada'); await page.click('button[type=submit]');
    await page.waitForSelector('text=E-mail ou senha incorretos');
    console.log(`OK ${name}: senha errada é recusada`);
    await page.fill('#p', admin.password); await page.click('button[type=submit]');
    if (name === 'desktop') {
      await page.waitForSelector('text=Defina uma nova senha');
      console.log('OK desktop: senha provisória força a troca antes de qualquer dado');
      assert.equal(await page.locator('.kpis').count(), 0);
      await page.fill('#n', 'curta1!'); await page.fill('#c', 'curta1!'); await page.click('button[type=submit]');
      await page.waitForSelector('text=pelo menos 10 caracteres');
      await page.fill('#n', 'Nova-Senha-Forte-2026!'); await page.fill('#c', 'Nova-Senha-Forte-2026!'); await page.click('button[type=submit]');
      admin.password = 'Nova-Senha-Forte-2026!';
    }
    await page.waitForSelector('.kpis');
    console.log(`OK ${name}: painel abre para o admin master`);
    assert.ok(await page.locator('table tbody tr').count() >= 2);
    await page.locator('tr.click').first().click();
    await page.waitForSelector('#detail h2');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'rolagem horizontal na página: ' + overflow);
    await page.screenshot({ path: process.env.SHOTS_DIR + `/admin-${name}.png`, fullPage: true });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    assert.equal(dl.suggestedFilename(), 'uso-triagem-hakunas.csv');
    console.log(`OK ${name}: detalhe por usuário, sem estouro de largura, CSV baixa`);
    await page.click('#out'); await page.waitForSelector('#f');
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('Sem erros de console.');
} finally {
  await browser?.close(); server.close();
  for (const u of [admin, plain]) await adminApi('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
}
