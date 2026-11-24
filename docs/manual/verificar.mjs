import { readFileSync } from 'node:fs';
const pdfjs = await import('../../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2])), useSystemFonts: true, verbosity: 0 }).promise;
const paginas = []; for (let p = 1; p <= doc.numPages; p++) paginas.push((await (await doc.getPage(p)).getTextContent()).items.map(i => i.str).join(' '));
const todo = paginas.join('\n');
console.log('páginas:', doc.numPages);
for (const [nome, re] of [['marcadores {{', /\{\{|\}\}/], ['undefined/NaN', /undefined|NaN/], ['caractere quebrado', /\uFFFD/], ['TODO', /TODO|XXX/]]) console.log(nome + ':', re.test(todo) ? 'ENCONTRADO' : 'nenhum');
const pgs = JSON.parse(readFileSync('paginas.json', 'utf8'));
const checar = { c1: 'O que o aplicativo faz', c6: 'Fazendo a triagem', c7: 'Entendendo as cores', c9: 'Guardando, imprimindo', a1: 'Apêndice A', a2: 'Folha de consulta rápida' };
for (const [id, t] of Object.entries(checar)) { const p = pgs[id]; console.log(`sumário diz ${id} na pág ${p}: título começa nessa página? ${paginas[p - 1].replace(/\s+/g, ' ').includes(t)}`); }
const palavras = todo.split(/\s+/).length; console.log('palavras aproximadas:', palavras);
