import { chromium } from '../../node_modules/@playwright/test/index.mjs';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const DIR = new URL('./', import.meta.url);
// Rode de dentro de docs/manual:  node build.mjs [saida.pdf]   (padrão: saida/Manual-do-Triador-Triagem-Hakunas.pdf)
mkdirSync('saida', { recursive: true });
const SAIDA = process.argv[2] || 'saida/Manual-do-Triador-Triagem-Hakunas.pdf';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- apêndice A gerado a partir do texto real da aba "Critérios e fontes"
const linhas = readFileSync(new URL('aba-book.txt', DIR), 'utf8').split('\n');
const grupos = ['Histórico', 'Medicamentos', 'Sintomas', 'Exclusões', 'Fatores adicionais'];
let apendice = '';
for (let i = 0; i < linhas.length; i++) {
  if (grupos.includes(linhas[i].trim()) && /^Critério\t/.test(linhas[i + 1] || '')) {
    let rows = '', j = i + 2;
    for (; j < linhas.length; j++) { const c = linhas[j].split('\t'); if (c.length < 5) break; rows += '<tr>' + c.slice(0, 5).map(x => '<td>' + esc(x.trim()) + '</td>').join('') + '</tr>'; }
    apendice += `<h3>${linhas[i].trim()}</h3><table class="crit"><thead><tr><th style="width:27%">Critério</th><th>Condição</th><th>Pontos</th><th>Cor</th><th>Exclusão / estado</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
}
if (!apendice) throw new Error('apêndice vazio');
let corpo = readFileSync(new URL('corpo.html', DIR), 'utf8').replace('{{APENDICE_CRITERIOS}}', apendice);
// O link do formulário NÃO fica no repositório (público): vem da variável LINK_FORMULARIO ou do arquivo local ignorado pelo Git.
const arqLink = new URL('link-formulario.local.txt', DIR);
const linkFormulario = (process.env.LINK_FORMULARIO || (existsSync(arqLink) ? readFileSync(arqLink, 'utf8') : '')).trim();
if (corpo.includes('{{LINK_FORMULARIO}}')) {
  if (!/^https:\/\/docs\.google\.com\/forms\/.+\/viewform/.test(linkFormulario)) throw new Error('Informe o link de RESPOSTA do formulário (termina em /viewform): variável LINK_FORMULARIO ou arquivo docs/manual/link-formulario.local.txt.');
  corpo = corpo.split('{{LINK_FORMULARIO}}').join(linkFormulario);
}
corpo = corpo.replace(/<table([^>]*)>([\s\S]*?)<\/table>/g, (m, at, inner) => (inner.match(/<tr/g) || []).length <= 7 ? '<table data-curta="1"' + at + '>' + inner + '</table>' : m);

// --- itens do sumário
const itens = [];
for (const m of corpo.matchAll(/<h([12]) id="([^"]+)">(?:<span class="n">([^<]*)<\/span> )?([^<]+)<\/h\1>/g)) itens.push({ nivel: +m[1], id: m[2], n: m[3] || '', titulo: m[4].trim().replace(/&gt;/g, '>').replace(/&amp;/g, '&') });
const montar = (pgs) => '<ul class="toc">' + itens.map(it => `<li class="l${it.nivel}"><span class="t"><a href="#${it.id}">${it.n && it.nivel === 1 && /^\d+$/.test(it.n) ? it.n + '. ' : ''}${esc(it.titulo)}</a></span><span class="pg">${pgs[it.id] ?? '00'}</span></li>`).join('') + '</ul>';
const html = (pgs) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Manual do Triador — Triagem Hakunas</title><link rel="stylesheet" href="estilo.css"></head><body>${corpo.replace('{{TOC}}', montar(pgs))}</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || process.env.LOCALAPPDATA + '/ms-playwright/chromium-1248/chrome-win64/chrome.exe' });
async function gerar(pgs, destino) {
  writeFileSync(new URL('manual.html', DIR), html(pgs));
  const page = await browser.newPage();
  await page.goto(new URL('manual.html', DIR).href); await page.waitForLoadState('load');
  await page.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
  await page.pdf({ path: destino, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#6b746d;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>Manual do Triador · Triagem Hakunas v1.8.3 · apoio à avaliação profissional</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
  await page.close();
}
// --- extrai o número da página de cada título direto do PDF
const pdfjs = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const norm = s => s.replace(/\s+/g, '').toLowerCase();
async function paginas(arq) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arq)), useSystemFonts: true, verbosity: 0 }).promise;
  const txt = []; for (let p = 1; p <= doc.numPages; p++) { const t = await (await doc.getPage(p)).getTextContent(); txt.push(norm(t.items.map(i => i.str).join(' '))); }
  return txt;
}
function localizar(txt) {
  const ultimo = itens[itens.length - 1]; const fimToc = txt.findIndex(t => t.includes(norm(ultimo.titulo))); // 1ª página com o último título = última página do sumário
  const pgs = {}; let atual = fimToc + 1;
  for (const it of itens) { let k = atual; while (k < txt.length && !txt[k].includes(norm(it.titulo))) k++; if (k >= txt.length) { console.log('NÃO ACHEI', it.titulo); continue; } pgs[it.id] = k + 1; atual = k; }
  return { pgs, fimToc: fimToc + 1 };
}
let pgs = {};
for (let volta = 1; volta <= 4; volta++) {
  await gerar(pgs, SAIDA);
  const txt = await paginas(SAIDA); const r = localizar(txt);
  const igual = JSON.stringify(r.pgs) === JSON.stringify(pgs);
  console.log(`volta ${volta}: ${txt.length} páginas, sumário termina na ${r.fimToc}, estável=${igual}`);
  pgs = r.pgs; if (igual) break;
}
await browser.close();
writeFileSync(new URL('paginas.json', DIR), JSON.stringify(pgs, null, 1));
console.log('tamanho', Math.round(statSync(SAIDA).size / 1024) + ' KB');
