// Gera src/generated-top-catalog.js: calendário de TOPs com nome, local, data e logomarca (brasão da Track), para o app preencher a identificação do TOP.
// Rode à mão quando quiser atualizar (usa a internet; NÃO faz parte do build):   node scripts/gerar-catalogo-tops.mjs
// Fontes: (1) https://www.loslegendarios.org/top (lista pública; só mostra as próximas semanas) e (2) scripts/catalogo-tops-informado.json
// (TOPs de 2027 informados pelo responsável; entram como "não confirmados"). Nada é inventado: campo que a fonte não traz fica vazio.
import { readFile, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const SITE = 'https://www.loslegendarios.org/top';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; leitura-publica)' };
const COLETADO_EM = new Date().toISOString().slice(0, 10);
const pausa = ms => new Promise(ok => setTimeout(ok, ms));

// O site escreve algumas cidades sem acento, com nome trocado ou com a UF errada. Cada correção é conferida e guardada com o motivo.
const CORRECOES = {
  'Araguaina, TO, Brasil': ['Araguaína, TO', 'acento'],
  'Belem, PA, Brasil': ['Belém, PA', 'acento'],
  'Brasilia, DF, Brasil': ['Brasília, DF', 'acento'],
  'Capao da Canoa, RS, Brasil': ['Capão da Canoa, RS', 'acento'],
  'Florianopolis, SC, Brasil': ['Florianópolis, SC', 'acento'],
  'Goiania, GO, Brasil': ['Goiânia, GO', 'acento'],
  'Goias, GO, Brasil': ['Goiás, GO', 'acento'],
  'Gravatai, RS, Brasil': ['Gravataí, RS', 'acento'],
  'Ji-Parana, RO, Brasil': ['Ji-Paraná, RO', 'acento'],
  'Marilia, SP, Brasil': ['Marília, SP', 'acento'],
  'Nova Andradina, MT, Brasil': ['Nova Andradina, MS', 'UF: Nova Andradina fica em Mato Grosso do Sul'],
  'Nova Hamburgo, RS, Brasil': ['Novo Hamburgo, RS', 'nome: o município é Novo Hamburgo'],
  'Parauapebas, TO, Brasil': ['Parauapebas, PA', 'UF: Parauapebas fica no Pará'],
  'Santo angelo, MT, Brasil': ['Santo Ângelo, RS', 'UF: Santo Ângelo fica no Rio Grande do Sul'],
  'Santo angelo, RS, Brasil': ['Santo Ângelo, RS', 'acento'],
  'Sao Jose do Rio Preto, SP, Brasil': ['São José do Rio Preto, SP', 'acento'],
  'São Luiz do Maranhão, MA, Brasil': ['São Luís, MA', 'nome: o município é São Luís'],
  'Sao Paulo, SP, Brasil': ['São Paulo, SP', 'acento'],
  'Cancun, Quintana Roo, México': ['Cancún, Quintana Roo, México', 'acento'],
  'Culiacan, Sinaloa, México': ['Culiacán, Sinaloa, México', 'acento'],
  'Morelia, Michoacan, México': ['Morelia, Michoacán, México', 'acento'],
  'Oaxaca de Juarez, Oaxaca, México': ['Oaxaca de Juárez, Oaxaca, México', 'acento'],
  'Ciudade del Este, Ciudad Del Este, Paraguai': ['Ciudad del Este, Paraguai', 'nome: Ciudad del Este'],
  'Domenic Republic, Domenic Republic, República Dominicana': ['República Dominicana', 'o site repete um nome com erro de grafia no lugar da cidade; fica só o país'],
};

const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const texto = s => dec(s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function baixar(url, binario = false) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw Error('HTTP ' + r.status + ' em ' + url);
  return binario ? Buffer.from(await r.arrayBuffer()) : r.text();
}

async function lerSite() {
  const cartoes = [];
  for (let pg = 1; pg <= 20; pg++) {
    const html = await baixar(SITE + (pg > 1 ? '?page=' + pg : ''));
    const blocos = html.split('<div class="top-wrapper').slice(1);
    if (!blocos.length) break;
    for (const c of blocos) {
      const capa = c.match(/<img src="([^"]*\/storage\/tracks\/[^"]+)"[^>]*alt="([^"]*)"/);
      const data = c.match(/datetime="(\d{4}-\d{2}-\d{2})/);
      const marca = c.match(/<div class="info">\s*<img src="[^"]+" alt="([^"]*)"/);
      const titulo = c.match(/<h4 class="card-title">([\s\S]*?)<\/h4>/);
      const locais = [...c.matchAll(/<p class="card-text[^"]*">([\s\S]*?)<\/p>/g)].map(m => texto(m[1]));
      if (!data || !locais[1]) throw Error('Cartão fora do formato esperado na página ' + pg + ': o site mudou; revise o gerador.');
      cartoes.push({ date: data[1], name: (titulo ? texto(titulo[1]) : '') || (capa ? texto(capa[2]) : ''), country: marca ? texto(marca[1]) : '', localSite: locais[1], capa: capa ? capa[1] : '' });
    }
    if (!/rel="next"/.test(html)) break;
    await pausa(600);
  }
  if (cartoes.length < 10) throw Error('Poucos cartões lidos (' + cartoes.length + '): o site mudou; revise o gerador.');
  return cartoes;
}

function formatarLocal(localSite) {
  const corr = CORRECOES[localSite];
  if (corr) return { place: corr[0], correcao: corr[1] };
  const partes = localSite.split(',').map(s => s.trim()).filter(Boolean), vistos = new Set(), out = [];
  for (const p of partes) { const k = p.toLowerCase(); if (!vistos.has(k)) { vistos.add(k); out.push(p); } }
  if (out.length && out[out.length - 1].toLowerCase() === 'brasil') out.pop(); // no Brasil o país é implícito: "Cidade, UF"
  return { place: out.join(', '), correcao: '' };
}

async function miniatura(url) {
  const img = await loadImage(await baixar(url, true)), escala = Math.min(1, 160 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * escala)), h = Math.max(1, Math.round(img.height * escala)), cv = createCanvas(w, h), ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
  return 'data:image/jpeg;base64,' + cv.toBuffer('image/jpeg', 72).toString('base64');
}

const cartoes = await lerSite();
console.log('cartões lidos no site:', cartoes.length);
const logos = new Map();
for (const u of new Set(cartoes.map(c => c.capa).filter(Boolean))) { logos.set(u, await miniatura(u)); await pausa(250); }

const entradas = [], vistos = new Set();
for (const c of cartoes) {
  const { place, correcao } = formatarLocal(c.localSite), chave = [c.date, place, c.name].join('|');
  if (vistos.has(chave)) continue; // o site repete o mesmo TOP em cartões diferentes
  vistos.add(chave);
  entradas.push({ date: c.date, dateEnd: '', name: c.name, number: '', place, country: c.country, localSite: c.localSite, correcao, logo: c.capa ? logos.get(c.capa) : '', source: 'site oficial', confirmed: true, nota: '' });
}
const informados = JSON.parse(await readFile(new URL('./catalogo-tops-informado.json', import.meta.url), 'utf8'));
for (const i of informados) entradas.push({ date: i.date, dateEnd: i.dateEnd, name: i.name, number: i.number, place: i.place, country: i.country, localSite: '', correcao: '', logo: '', source: 'informado pelo responsável', confirmed: false, nota: i.nota });

const ordem = e => [e.date || '9999-12-31', e.country === 'Brasil' ? '0' : '1', e.place, e.name].join('|');
entradas.sort((a, b) => ordem(a).localeCompare(ordem(b), 'pt'));
const usados = new Set();
for (const e of entradas) { let id = [e.date || 'sem-data', slug(e.name) || 'sem-nome', slug(e.place) || 'sem-local'].join('_'), n = 2; const base = id; while (usados.has(id)) id = base + '_' + n++; usados.add(id); e.id = id; }

const meta = { fonte: SITE, coletadoEm: COLETADO_EM, aviso: 'O site oficial só publica as próximas semanas e não traz o número do TOP. Itens "informados pelo responsável" não foram confirmados em fonte pública.' };
const saida = '// GERADO por scripts/gerar-catalogo-tops.mjs em ' + COLETADO_EM + '. NÃO edite à mão: rode o gerador de novo.\n// Logomarca: miniatura (JPEG, até 160 px) do brasão da Track publicado em ' + SITE + '. As imagens pertencem aos Legendários.\n'
  + 'export const TOP_CATALOG_META = ' + JSON.stringify(meta) + ';\nexport const TOP_CATALOG = ' + JSON.stringify(entradas) + ';\n';
await writeFile(new URL('../src/generated-top-catalog.js', import.meta.url), saida);

const kb = Math.round(saida.length / 1024);
console.log('entradas:', entradas.length, '| do site:', entradas.filter(e => e.confirmed).length, '| informadas:', entradas.filter(e => !e.confirmed).length, '| com logomarca:', entradas.filter(e => e.logo).length, '| locais corrigidos:', entradas.filter(e => e.correcao).length, '| arquivo:', kb, 'KB');
