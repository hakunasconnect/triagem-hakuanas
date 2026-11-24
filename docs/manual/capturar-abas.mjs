// Explora o app (build local, rede simulada, nenhum dado real) e despeja o texto de cada aba + uma captura.
import { chromium } from '../../node_modules/@playwright/test/index.mjs';
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('./', import.meta.url);
const html = await readFile(new URL('../../dist/index.html', import.meta.url));
const srv = http.createServer((q, r) => { const raiz = q.url === '/' || q.url.startsWith('/?'); r.writeHead(raiz ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(raiz ? html : ''); });
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await ctx.route(u => /^https:/.test(u.protocol), r => r.abort());
const page = await ctx.newPage();
const erros = []; page.on('pageerror', e => erros.push(e.message));
await page.goto('http://127.0.0.1:' + srv.address().port + '/');
await page.waitForTimeout(1000);
const tabs = await page.$$eval('button[data-tab]', bs => bs.map(b => ({ id: b.dataset.tab, label: b.innerText.trim() })));
console.log('ABAS', JSON.stringify(tabs));
for (const t of tabs) {
  await page.locator(`button[data-tab="${t.id}"]`).first().click();
  await page.waitForTimeout(400);
  const txt = await page.locator('main').innerText();
  await writeFile(new URL(`aba-${t.id}.txt`, OUT), txt);
  const botoes = await page.$$eval('main button, main a[href], main input, main select, main textarea', els => els.map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.type ? '[' + e.type + ']' : ''} :: ${(e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || '').trim().slice(0, 70)}`));
  await writeFile(new URL(`aba-${t.id}-controles.txt`, OUT), botoes.join('\n'));
  console.log(t.id, 'texto', txt.length, 'controles', botoes.length);
}
console.log('erros', JSON.stringify(erros));
await browser.close(); srv.close();
