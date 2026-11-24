// /admin no Chromium real, celular (390 px), com respostas SIMULADAS do banco: não precisa de token nem toca em dados reais.
// Prova o que cada papel enxerga, os atalhos no topo e que uma falha ao abrir o painel aparece na tela (não volta calada ao login).
// Uso: npm run build && CHROME_PATH=... node tests/browser-admin-stub.mjs
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const html = await readFile(new URL('../dist/admin.html', import.meta.url));
const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const origin = 'http://127.0.0.1:' + srv.address().port;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ago = m => new Date(Date.now() - m * 60000).toISOString();
const person = (id, email, role) => ({ id, email, full_name: email.split('@')[0], role, legend_number: '1', permissions: {}, must_change_password: false, created_at: ago(900) });
const NUM = '5516992943215';

async function abre(role, { quebra } = {}) {
  const me = person('u-' + role, role + '@x.co', role), master = role === 'admin_master';
  const db = {
    profiles: [me, person('u-t', 'tri@x.co', 'triador')], usage_sessions: [], usage_events: [],
    alert_settings: master ? [{ id: true, evolution_url: 'https://evo.exemplo.com', instance: 'triagem', api_key: '', notify_use: true, active: true }] : [],
    alert_recipients: master ? [{ id: 'r1', name: 'Dr Edson', whatsapp: NUM, active: true, created_at: ago(500) }] : [],
    alerts: [{ id: 1, created_at: ago(60), color: 'red', participant_name: 'Fulano', participant_phone: '', participant_email: '', reasons: ['x'], delivery: [] }],
  };
  if (quebra) db.alerts = 'resposta inesperada'; // faz o desenho do painel falhar
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(s => sessionStorage.setItem('hakunas-admin-session', JSON.stringify(s)), { access_token: 'a.b.c', refresh_token: 'r', user: { id: me.id, email: me.email } });
  const page = await ctx.newPage();
  await page.route('https://wwfkazbjiutihtexqknm.supabase.co/**', route => { const u = new URL(route.request().url()); if (u.pathname.includes('/auth/v1/user')) return route.fulfill({ json: { id: me.id } }); return route.fulfill({ json: db[u.pathname.split('/rest/v1/')[1]] ?? [] }); });
  await page.route('**/api/alert', route => route.fulfill({ json: { state: 'open' } }));
  await page.goto(origin + '/admin'); await page.waitForTimeout(1500);
  return { page, ctx };
}
const links = async page => page.locator('nav.jump a').allInnerTexts();
const noViewport = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return !!b && b.y >= 0 && b.y < 844; };

// MASTER: vê tudo e chega a cada seção pelos atalhos
{
  const { page, ctx } = await abre('admin_master');
  const txt = await page.locator('body').innerText();
  assert.ok(txt.includes('Exportar CSV'), 'o painel do master deve abrir');
  for (const s of ['#alerts', '#wa-box', '#rec-box', '#hist-box', '#manage-users']) assert.ok(await page.locator(s).first().isVisible(), 'master deve ver ' + s);
  assert.ok(txt.includes(NUM), 'o número do master deve aparecer em "Quem recebe"');
  assert.deepEqual(await links(page), ['Usuários', 'Alertas e WhatsApp', 'Quem recebe', 'Últimos alertas']);
  assert.equal(await noViewport(page, '#rec-box'), false, 'antes do atalho, "Quem recebe" está fora da tela do celular');
  await page.locator('nav.jump a', { hasText: 'Quem recebe' }).click(); await page.waitForTimeout(300);
  assert.equal(await noViewport(page, '#rec-box'), true, 'o atalho deve levar a "Quem recebe"');
  await ctx.close(); console.log('OK     master: vê WhatsApp, "Quem recebe" e histórico; atalhos levam até lá');
}
// ADMIN: não vê WhatsApp nem destinatários (só do master), vê o histórico e não tem esses atalhos
{
  const { page, ctx } = await abre('admin');
  assert.ok((await page.locator('body').innerText()).includes('Exportar CSV'));
  for (const s of ['#wa-box', '#rec-box']) assert.equal(await page.locator(s).first().isVisible(), false, 'admin não deve ver ' + s);
  assert.ok(await page.locator('#hist-box').first().isVisible(), 'admin vê os alertas');
  assert.equal(await page.locator('[data-delalert]').count(), 0, 'admin não apaga alertas');
  const l = await links(page); assert.ok(!l.includes('Quem recebe') && !l.includes('Alertas e WhatsApp'), 'sem atalho para o que não é dele: ' + l);
  await ctx.close(); console.log('OK     admin: sem WhatsApp, sem destinatários, sem apagar alerta, sem os atalhos correspondentes');
}
// FALHA AO DESENHAR: aparece uma mensagem, não o login mudo
{
  const { page, ctx } = await abre('admin_master', { quebra: true });
  const txt = await page.locator('body').innerText();
  assert.ok(txt.includes('Não foi possível abrir o painel'), 'a falha deve aparecer na tela. Tela mostrou: ' + txt.replace(/\s+/g, ' ').slice(0, 120));
  await ctx.close(); console.log('OK     falha ao abrir o painel: a mensagem aparece na tela');
}
await browser.close(); srv.close();
console.log('\nTudo certo.');
