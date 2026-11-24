// Utilitários: servidor local do build, navegador, rede simulada, marcações numeradas e capturas.
import { chromium } from '../../node_modules/@playwright/test/index.mjs';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export const DIR = new URL('./', import.meta.url);
export const SHOTS = new URL('./shots/', import.meta.url).pathname.slice(1);
await mkdir(SHOTS, { recursive: true });
const html = await readFile(new URL('../../dist/index.html', import.meta.url));
export const srv = http.createServer((q, r) => { const raiz = q.url === '/' || q.url.startsWith('/?'); r.writeHead(raiz ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(raiz ? html : ''); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
export const URL_APP = 'http://127.0.0.1:' + srv.address().port + '/';
export const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
export const log = [];
export const nota = (m) => { log.push(m); console.log(m); };

// Toda a rede externa é simulada: nenhum dado real é tocado. Login e inscrições são FICTÍCIOS.
export const INSCRICOES = [
  { id: '11111111-1111-1111-1111-111111111111', name: 'Ana Souza (exemplo)', status: 'novo', top: '1845', receivedAt: '2026-11-24T15:00:00Z', record: { fields: { name: 'Ana Souza (exemplo)', cpf: '529.982.247-25', email: 'ana@exemplo.com', phone: '(11) 98888-7777', age: '38', weight: '70', height: '168' }, extras: [], flags: ['htn'], prep: { activity: '1', walk: '0', tetanus: '0', prior: '0' } } },
  { id: '22222222-2222-2222-2222-222222222222', name: 'Jovem Demais (exemplo)', status: 'novo', top: '1845', receivedAt: '2026-11-24T15:10:00Z', record: { fields: { name: 'Jovem Demais (exemplo)', email: 'j@exemplo.com', phone: '(11) 97777-6666', age: '15', weight: '55', height: '160' }, extras: [], flags: [], prep: {} } },
];
export async function novoContexto(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5, ...opts });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await ctx.route(u => /^https:/.test(u.protocol), async route => {
    const req = route.request(), u = new URL(req.url()), json = b => route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/api/intake') { const b = JSON.parse(req.postData() || '{}'); return b.action === 'list' ? json({ items: INSCRICOES }) : json({ marked: (b.ids || []).length }); }
    if (u.pathname === '/api/alert') return json({ saved: 0, sent: false });
    if (u.pathname.includes('/auth/v1/token')) return json({ access_token: 'tok-exemplo', user: { id: 'u-ex', email: 'triador@exemplo.com' } });
    if (u.pathname.includes('/rest/v1/profiles')) return json([{ full_name: 'Triador Exemplo', legend_number: '123456' }]);
    if (u.pathname.includes('/rest/v1/usage_sessions') && req.method() === 'POST') return json([{ id: 'sess-ex' }]);
    if (u.pathname.includes('/rest/v1/') || u.pathname.includes('/auth/v1/logout')) return json([]);
    return route.abort();
  });
  const page = await ctx.newPage(); const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(URL_APP); await page.waitForTimeout(900);
  return { ctx, page, erros };
}

const BADGE = 'position:absolute;z-index:2147483647;width:26px;height:26px;border-radius:50%;background:#e11d48;color:#fff;font:700 15px/26px Arial,sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.45);pointer-events:none';
const BOX = 'position:absolute;z-index:2147483646;border:3px solid #e11d48;border-radius:8px;pointer-events:none;box-sizing:border-box';
// itens: [[locator|selector, numero, {dx,dy,pad}]]  — desenha caixa + bolinha numerada sobre o elemento
export async function marcar(page, itens) {
  const dlgLoc = page.locator('dialog[open]'); const temDlg = await dlgLoc.count() > 0;
  const dbox2 = temDlg ? await dlgLoc.first().boundingBox() : null;
  const vp = page.viewportSize();
  const dados = [];
  for (const [alvo, n, o = {}] of itens) {
    const loc = typeof alvo === 'string' ? page.locator(alvo).first() : alvo.first();
    if (!(await loc.count())) { nota('  (marca ' + n + ' sem elemento: ' + alvo + ')'); continue; }
    const b = await loc.boundingBox(); if (!b) continue;
    // só marca o que está visível no recorte (abaixo do cabeçalho fixo / acima do rodapé fixo)
    const topo = temDlg ? dbox2.y + 70 : 80, base = temDlg ? dbox2.y + dbox2.height - 72 : vp.height;
    if (!o.fixo && (b.y + b.height < topo || b.y > base)) { nota('  (marca ' + n + ' fora da área visível: ' + String(alvo).slice(0, 40) + ')'); continue; }
    dados.push({ n, b, o });
  }
  await page.evaluate(({ dados, dbox, BADGE, BOX }) => {
    const host = dbox ? document.querySelector('dialog[open]') : document.body;
    for (const { n, b, o } of dados) {
      const pad = o.pad ?? 3;
      const x = dbox ? b.x - dbox.x + host.scrollLeft : b.x, y = dbox ? b.y - dbox.y + host.scrollTop : b.y;
      const box = document.createElement('div'); box.className = 'hk-mark'; box.style.cssText = BOX + `;left:${x - pad}px;top:${y - pad}px;width:${b.width + pad * 2}px;height:${b.height + pad * 2}px;` + (dbox ? '' : 'position:fixed;');
      const bd = document.createElement('div'); bd.className = 'hk-mark'; bd.textContent = n; bd.style.cssText = BADGE + `;left:${x - pad - 11 + (o.dx || 0)}px;top:${y - pad - 11 + (o.dy || 0)}px;` + (dbox ? '' : 'position:fixed;');
      host.append(box, bd);
    }
  }, { dados, dbox: dbox2, BADGE, BOX });
}
export const limpar = (page) => page.evaluate(() => document.querySelectorAll('.hk-mark').forEach(e => e.remove()));

export async function foto(page, nome, { marks = [], alvo = 'dialog[open]', clip, secao, antes } = {}) {
  if (antes) await antes();
  await page.waitForTimeout(250);
  const arq = SHOTS + nome + '.png';
  if (secao) { // seção da página: rola até o topo dela ficar logo abaixo da barra fixa e recorta só a seção
    await page.evaluate(s => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 92); }, secao);
    await page.waitForTimeout(250);
    const b = await page.locator(secao).first().boundingBox();
    const y = Math.max(b.y, 78), h = Math.min(b.y + b.height, page.viewportSize().height) - y;
    if (marks.length) await marcar(page, marks);
    await page.screenshot({ path: arq, clip: { x: b.x, y, width: b.width, height: h } });
  } else {
    if (marks.length) await marcar(page, marks);
    if (clip) await page.screenshot({ path: arq, clip });
    else if (alvo === 'pagina') await page.screenshot({ path: arq });
    else await page.locator(alvo).first().screenshot({ path: arq });
  }
  await limpar(page);
  nota('foto ' + nome);
  return arq;
}
export const rolarDialog = (page, y) => page.evaluate(v => { const d = document.querySelector('dialog[open]'); d.scrollTop = v === 'fim' ? d.scrollHeight : v; }, y);
export const rolarAte = async (page, texto) => page.evaluate(t => { const d = document.querySelector('dialog[open]'); const el = [...d.querySelectorAll('h2,h3,h4,legend,summary,strong,b')].find(e => e.innerText.trim().startsWith(t)); if (el) { el.scrollIntoView({ block: 'start' }); d.scrollTop = Math.max(0, d.scrollTop - 90); } return !!el; }, texto);
export async function cadastrar(page, dados, flags = [], extra = {}) {
  await page.locator('#new').click(); await page.waitForTimeout(250); const m = page.locator('#modal');
  for (const [k, v] of Object.entries(dados)) await m.locator(`[name="${k}"]`).first().fill(v);
  for (const f of flags) await m.locator(`input[name="flag"][value="${f}"]`).check();
  if (extra.completo) {
    for (const s of ['history', 'meds', 'symptoms', 'exclusions', 'extra']) await m.locator(`input[name="reviewed"][value="${s}"]`).check();
    for (const [k, v] of Object.entries({ activity: '3 ou mais vezes / semana', walk: 'Sim', tetanus: 'Sim', prior: 'Sim' })) await m.locator(`select[name="${k}"]`).selectOption({ label: v });
    await m.locator('input[name="reviewer"]').fill('Dr. Exemplo CRM 0000'); await m.locator('input[name="certificate"]').check();
  }
  return m;
}
export const salvarFicha = async (page) => { await page.locator('#modal button[type=submit]').last().click(); await page.waitForTimeout(350); };
export const fim = async () => { await browser.close(); srv.close(); await writeFile(new URL('shots-log.txt', DIR), log.join('\n')); };
