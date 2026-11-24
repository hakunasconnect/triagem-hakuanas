// App offline no Chromium real, celular (390 px): "Inscrições do formulário" traz as fichas, rejeita a inválida,
// importa a escolhida como participante e marca como importada. TODA a rede é simulada: nenhum dado real é tocado.
// Roda sobre dist/index.html (o do site, que pode falar com o servidor); o arquivo offline tem CSP sem conexão externa, de propósito.
// Uso: npm run build && CHROME_PATH=... node tests/browser-forms-import.mjs
import { chromium } from '@playwright/test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const OK = '11111111-1111-1111-1111-111111111111', BAD = '22222222-2222-2222-2222-222222222222', OLD = '33333333-3333-3333-3333-333333333333';
const mk = (id, name, over = {}, status = 'novo') => ({ id, name, status, top: '1845', receivedAt: '2026-11-24T15:00:00Z', record: { fields: { name, cpf: '529.982.247-25', email: 'a@x.co', phone: '(16) 99294-3215', age: '38', weight: '82,5', height: '178', ...over }, extras: [{ label: 'Endereço', value: 'Rua das Flores, 10' }], flags: ['htn'], prep: { activity: '1', walk: '0', tetanus: '0', prior: '0' } } });
const ITENS = [mk(OK, 'Ana Souza'), mk(BAD, 'Jovem Demais', { age: '15', cpf: '' })];
const ANTIGA = mk(OLD, 'Carlos Antigo', { cpf: '111.444.777-35' }, 'importado');

const html = await readFile(new URL('../dist/index.html', import.meta.url));
const srv = http.createServer((q, r) => { const raiz = q.url === '/' || q.url.startsWith('/?'); r.writeHead(raiz ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(raiz ? html : ''); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const chamadas = { intake: [], alert: [], naoSimulado: [] };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await ctx.route(u => /^https:/.test(u.protocol), async route => { // só a rede externa é simulada; o servidor local entrega o app
  const req = route.request(), u = new URL(req.url()), json = body => route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (u.pathname === '/api/intake') { const b = JSON.parse(req.postData() || '{}'); chamadas.intake.push({ auth: req.headers().authorization, ...b }); return b.action === 'list' ? json({ items: b.includeImported ? [...ITENS, ANTIGA] : ITENS }) : json({ marked: (b.ids || []).length }); }
  if (u.pathname === '/api/alert') { chamadas.alert.push(JSON.parse(req.postData() || '{}')); return json({ saved: 1, sent: false }); }
  if (u.pathname.includes('/auth/v1/token')) return json({ access_token: 'tok-teste', user: { id: 'u-t', email: 't@x.co' } });
  if (u.pathname.includes('/rest/v1/profiles')) return json([{ full_name: 'Triador Teste', legend_number: '123' }]);
  if (u.pathname.includes('/rest/v1/usage_sessions') && req.method() === 'POST') return json([{ id: 'sess-1' }]);
  if (u.pathname.includes('/rest/v1/') || u.pathname.includes('/auth/v1/logout')) return json([]);
  chamadas.naoSimulado.push(req.method() + ' ' + req.url()); return route.abort();
});
const page = await ctx.newPage();
const erros = []; page.on('pageerror', e => erros.push(e.message));
await page.goto('http://127.0.0.1:' + srv.address().port + '/');
await page.waitForTimeout(800);
const aba = n => page.getByRole('button', { name: n }).first().click();
const ok = m => console.log('OK     ' + m);

// 1) Sem login: a janela explica o que fazer, sem buscar nada
await page.locator('#import-forms').click();
await page.waitForSelector('#forms-status');
assert.match(await page.locator('#forms-status').innerText(), /Entre na conta do triador/); assert.equal(chamadas.intake.length, 0);
await page.locator('#close-modal').click(); ok('sem login: orienta a entrar e não busca nada');

// 2) Login do triador e busca
await aba(/Configura/i); await page.waitForTimeout(300);
await page.locator('#account-form input[name="email"]').fill('t@x.co'); await page.locator('#account-form input[name="password"]').fill('Senha-Falsa-123!');
await page.locator('#account-form input[type="checkbox"]').check(); // ciência de que o uso do app é registrado (exigida pelo app)
await page.locator('#account-form input[name="password"]').press('Enter');
await page.waitForSelector('text=Conectado como', { timeout: 8000 });
await aba(/Participantes/i); await page.waitForTimeout(300);
await page.locator('#import-forms').click();
await page.waitForSelector('[data-form-id]');
const linhas = await page.locator('[data-form-id]').count(); assert.equal(linhas, 2, 'duas inscrições novas');
assert.equal(chamadas.intake[0].action, 'list'); assert.equal(chamadas.intake[0].auth, 'Bearer tok-teste', 'usa o login do triador');
assert.equal(await page.locator(`[data-form-id="${OK}"]`).isChecked(), true, 'a ficha válida vem marcada');
assert.equal(await page.locator(`[data-form-id="${BAD}"]`).isDisabled(), true, 'a ficha inválida não pode ser importada');
const texto = await page.locator('#forms-list').innerText(); assert.match(texto, /Ana Souza/); assert.match(texto, /Não pode ser importada: .*Idade/); ok('lista 2 inscrições: válida marcada, inválida bloqueada com o motivo');

// 3) "Mostrar também as já importadas"
await page.locator('#forms-all').check(); await page.waitForFunction(() => document.querySelectorAll('[data-form-id]').length === 3);
assert.equal(chamadas.intake.at(-1).includeImported, true); assert.equal(await page.locator(`[data-form-id="${OLD}"]`).isChecked(), false, 'já importada não vem marcada');
await page.locator('#forms-all').uncheck(); await page.waitForFunction(() => document.querySelectorAll('[data-form-id]').length === 2); ok('mostra e esconde as já importadas');

// 4) Importar exige a conferência
await page.locator('#forms-import').click();
assert.match(await page.locator('#forms-error').innerText(), /Confirme que conferiu/); assert.equal(chamadas.intake.filter(c => c.action === 'mark').length, 0);
await page.locator('#forms-confirm').check(); await page.locator('#forms-import').click();
await page.waitForFunction(() => !document.querySelector('#modal')?.open);
const corpo = await page.locator('body').innerText(); assert.match(corpo, /Ana Souza/, 'a participante entrou na lista'); assert.doesNotMatch(corpo, /Jovem Demais/);
const marca = chamadas.intake.find(c => c.action === 'mark'); assert.deepEqual(marca.ids, [OK], 'só a escolhida é marcada como importada');
assert.ok(chamadas.alert.some(c => c.type === 'start' && c.count === 1), 'avisa o início da triagem como na importação de arquivo');
ok('importa só a escolhida, mostra na lista e marca como importada no servidor');

// 5) Já na lista: a mesma inscrição volta como duplicada e desmarcada
await page.locator('#import-forms').click(); await page.waitForSelector('[data-form-id]');
assert.equal(await page.locator(`[data-form-id="${OK}"]`).isChecked(), false); assert.match(await page.locator('#forms-list').innerText(), /Já está na lista: Ana Souza/);
ok('quem já está na lista vem desmarcado, com aviso');

assert.deepEqual(chamadas.naoSimulado, [], 'nenhuma chamada de rede fora do simulado'); assert.deepEqual(erros, [], 'sem erros de JavaScript');
await browser.close(); srv.close(); console.log('\nTudo certo.');
