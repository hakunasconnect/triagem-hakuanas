// Teste em navegador real (Chromium) do /admin contra o Supabase real.
// Há UM único admin master: o teste entra com uma sessão de teste dele (sem criar outro admin nem mexer na senha)
// e só altera dados próprios (prefixo "br-"); restaura a configuração do WhatsApp que encontrar.
// As chamadas /api/* vão ao site publicado (APP_URL), então publique antes de rodar.
// Uso: CHROME_PATH=... SHOTS_DIR=... SUPABASE_ACCESS_TOKEN=... node tests/browser-admin.mjs
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { adminSession } from '../scripts/lib/admin-session.mjs';
const REF = 'wwfkazbjiutihtexqknm', MGMT = process.env.SUPABASE_ACCESS_TOKEN, APP = process.env.APP_URL || 'https://triagemhakunas.vercel.app';
if (!MGMT) throw Error('Defina SUPABASE_ACCESS_TOKEN.');
const { base, anon, service, session } = await adminSession({ ref: REF, mgmt: MGMT });
const adminApi = (path, init = {}) => fetch(base + path, { ...init, headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json', ...(init.headers || {}) } });
const sql = q => fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + MGMT, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
const sqlJson = async q => (await sql(q)).json();
const esc = v => String(v ?? '').replace(/'/g, "''");
const html = await readFile('dist/admin.html');
const savedSettings = (await sqlJson('select evolution_url, instance, api_key, active, notify_use from public.alert_settings'))[0];
const tag = Date.now();
const plainEmail = `br-plain-${tag}@example.com`, plainPass = 'Prov1sória-' + Math.random().toString(36).slice(2) + '!';
const plain = await (await adminApi('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: plainEmail, password: plainPass, email_confirm: true }) })).json();
// Servidor local: serve o /admin e repassa /api/* ao site publicado.
const server = http.createServer(async (rq, rs) => {
  if (rq.url.startsWith('/api/')) {
    const chunks = []; for await (const c of rq) chunks.push(c);
    const r = await fetch(APP + rq.url, { method: rq.method, headers: { 'content-type': 'application/json', ...(rq.headers.authorization ? { authorization: rq.headers.authorization } : {}) }, body: rq.method === 'POST' ? Buffer.concat(chunks) : undefined });
    rs.statusCode = r.status; rs.setHeader('content-type', 'application/json'); rs.end(Buffer.from(await r.arrayBuffer())); return;
  }
  rs.setHeader('content-type', 'text/html; charset=utf-8'); rs.end(html);
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
let browser; const errors = [];
const watch = (page, name) => { page.on('pageerror', e => errors.push(name + ': ' + e.message)); page.on('console', m => m.type() === 'error' && !/status of 400/.test(m.text()) && errors.push(name + ' console: ' + m.text())); };
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  // 1) Login pela tela: usuário comum é barrado; senha errada é recusada.
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(); watch(page, 'login');
    await page.goto(url); await page.waitForSelector('#f'); await page.waitForTimeout(1500);
    await page.fill('#e', plainEmail); await page.fill('#p', 'senha-errada'); await page.click('button[type=submit]');
    await page.waitForSelector('text=E-mail ou senha incorretos'); console.log('OK: senha errada é recusada');
    await page.fill('#p', plainPass); await page.click('button[type=submit]');
    await page.waitForSelector('text=restrito ao admin master'); console.log('OK: usuário comum é barrado');
    await ctx.close(); }
  // 2) Painel com a sessão de teste do admin master, em desktop e celular.
  for (const [name, w, h] of [['desktop', 1280, 900], ['mobile', 390, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(s => window.sessionStorage.setItem('hakunas-admin-session', JSON.stringify(s)), session);
    const page = await ctx.newPage(); watch(page, name);
    await page.goto(url); await page.waitForSelector('.kpis');
    console.log(`OK ${name}: painel abre para o admin master`);
    assert.ok(await page.locator('#manage-users tbody tr').count() >= 2);
    assert.ok(await page.locator('#manage-users [data-remove][data-self="1"]').count() === 1, 'o admin master tem apagar-usuário protegido');
    if (name === 'desktop') {
      // Alertas por WhatsApp: conexão, número e remoção (só a própria linha de teste).
      assert.ok(await page.locator('#wa-connect, #wa-status').first().isVisible());
      await page.click('summary:has-text("Avançado")'); await page.fill('#evo-inst', 'instancia-teste'); await page.fill('#evo-key', 'chave-de-teste-123');
      await page.click('#evo-form button[type=submit]'); await page.waitForSelector('#evo-msg:has-text("Conexão salva")');
      await page.fill('#rec-name', 'Destino Teste br'); await page.fill('#rec-num', '12'); await page.click('#rec-form button[type=submit]');
      await page.waitForSelector('#rec-msg:has-text("inválido")');
      await page.fill('#rec-num', '+55 (11) 99999-0000'); await page.click('#rec-form button[type=submit]');
      await page.waitForSelector('td:has-text("5511999990000")');
      page.once('dialog', d => d.accept());
      await page.click('tr:has-text("Destino Teste br") [data-del]'); await page.waitForSelector('tr:has-text("Destino Teste br")', { state: 'detached' });
      console.log('OK desktop: conexão salva, número validado, adicionado e removido');
      // Gerenciar usuários: criar, editar, trocar a senha e apagar (pelo site publicado).
      const email = `br-novo-${tag}@example.com`;
      await page.fill('#mu-email', email); await page.fill('#mu-name', 'Usuário Teste br'); await page.fill('#mu-legend', '4321'); await page.selectOption('#mu-role', 'coordenador');
      await page.click('#mu-form button[type=submit]'); await page.waitForSelector('#mu-new:has-text("Senha provisória")');
      const created = (await sqlJson(`select role, legend_number, must_change_password from public.profiles where email='${esc(email)}'`))[0];
      assert.deepEqual(created, { role: 'coordenador', legend_number: '4321', must_change_password: true });
      console.log('OK desktop: usuário criado com papel, Legendário e troca de senha obrigatória');
      const row = page.locator(`tr[data-user]:has-text("${email}")`);
      await row.locator('[data-name]').fill('Nome Editado br'); await row.locator('select[data-role]').selectOption('triador'); await row.locator('[data-save]').click();
      await page.waitForSelector('#mu-msg:has-text("Usuário salvo")');
      assert.equal((await sqlJson(`select role from public.profiles where email='${esc(email)}'`))[0].role, 'triador');
      page.once('dialog', d => d.accept('Provisoria-Teste-2026'));
      await page.locator(`tr[data-user]:has-text("${email}") [data-pass]`).click(); await page.waitForSelector('#mu-msg:has-text("Senha provisória definida")');
      page.once('dialog', d => d.accept());
      await page.locator(`tr[data-user]:has-text("${email}") [data-remove]`).click(); await page.waitForSelector(`tr[data-user]:has-text("${email}")`, { state: 'detached' });
      assert.equal((await sqlJson(`select count(*)::int as n from public.profiles where email='${esc(email)}'`))[0].n, 0);
      console.log('OK desktop: usuário editado, senha redefinida e apagado');
    }
    await page.locator('tr.click').first().click(); await page.waitForSelector('#detail h2');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, 'rolagem horizontal na página: ' + overflow);
    await page.screenshot({ path: process.env.SHOTS_DIR + `/admin-${name}.png`, fullPage: true });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    assert.equal(dl.suggestedFilename(), 'uso-triagem-hakunas.csv');
    console.log(`OK ${name}: detalhe por usuário, sem estouro de largura, CSV baixa`);
    await ctx.close();
  }
  assert.deepEqual(errors, []);
  console.log('Sem erros de console.');
} finally {
  await browser?.close(); server.close();
  await sql("delete from public.alert_recipients where name='Destino Teste br'");
  if (savedSettings) await sql("update public.alert_settings set evolution_url='" + esc(savedSettings.evolution_url) + "', instance='" + esc(savedSettings.instance) + "', api_key='" + esc(savedSettings.api_key) + "', active=" + !!savedSettings.active + ", notify_use=" + !!savedSettings.notify_use + " where id=true");
  const leftovers = await sqlJson("select id from auth.users where email like 'br-%@example.com'").catch(() => []);
  for (const u of leftovers) await adminApi('/auth/v1/admin/users/' + u.id, { method: 'DELETE' });
}
