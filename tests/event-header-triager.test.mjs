import{test}from'node:test';import assert from'node:assert/strict';import{JSDOM}from'jsdom';import * as XLSX from'xlsx';
import{normalizeEventHeader,normalizeAppSettings,eventHeaderHTML,headerPending}from'../src/event-header.js';
import{buildReports}from'../src/reports.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAALSURBVAiZY2AAAgAABQABYlUyiAAAAABJRU5ErkJggg==';
const header=()=>({topNumber:'01782',location:'Local sintético',baseName:'Base sintética',baseLogo:png,legendLogo:png,triager:'Triador Sintético',legendNumber:'004321'});

test('Triador e número de Legendário são normalizados e preservam zeros à esquerda',()=>{const h=normalizeEventHeader(header());assert.equal(h.triager,'Triador Sintético');assert.equal(h.legendNumber,'004321');const e=normalizeEventHeader();assert.equal(e.triager,'');assert.equal(e.legendNumber,'');});
test('Triador e número inválidos não entram no estado',()=>{for(const n of['L-123','12.5','1e3','12345678901','abc'])assert.throws(()=>normalizeEventHeader({...header(),legendNumber:n}),/Legend/);assert.throws(()=>normalizeEventHeader({...header(),triager:'x'.repeat(101)}),/Triador/);assert.throws(()=>normalizeEventHeader({...header(),triager:42}),/Triador/);});
test('Cabeçalho mostra triador e número de Legendário, com texto escapado',()=>{const dom=new JSDOM(eventHeaderHTML(header())),d=dom.window.document;const t=d.querySelector('.event-triager');assert.ok(t,'linha do triador ausente');assert.match(t.textContent,/Triador Sintético/);assert.match(t.textContent,/Legendário nº 004321/);dom.window.close();const bad=new JSDOM(eventHeaderHTML({...header(),triager:'<img src=x onerror=alert(1)>'}));assert.equal(bad.window.document.querySelectorAll('img[onerror],script').length,0);bad.window.close();});
test('Sem triador informado, o cabeçalho diz que não foi informado e não inventa nome',()=>{const html=eventHeaderHTML({...header(),triager:'',legendNumber:''});assert.ok(html.includes('Triador não informado'));assert.ok(!html.includes('Legendário nº'));});
test('Pendências do cabeçalho incluem triador e número de Legendário',()=>{assert.equal(headerPending(header()).length,0);const p=headerPending(normalizeEventHeader());assert.ok(p.includes('nome do triador'));assert.ok(p.includes('número de Legendário do triador'));assert.equal(p.length,7);});
test('Configuração antiga sem os campos novos continua válida e vazia nesses campos',()=>{const legacy=normalizeAppSettings({event:'Legado',reviewer:'',protocols:[],header:{topNumber:'1',location:'L',baseName:'B'}});assert.equal(legacy.header.triager,'');assert.equal(legacy.header.legendNumber,'');});
test('Relatório leva triador e número de Legendário na planilha de resumo e no HTML de cada ficha',()=>{const p={id:crypto.randomUUID(),name:'Pessoa sintética',flags:[],reviewed:[]},r=buildReports([p],{header:header()});const rows=XLSX.utils.sheet_to_json(XLSX.read(r.missing.data,{type:'array'}).Sheets.Resumo,{header:1});assert.ok(rows.some(x=>x[0]==='Triador'&&x[1]==='Triador Sintético'));assert.ok(rows.some(x=>x[0]==='Número de Legendário do triador'&&x[1]==='004321'));const dom=new JSDOM(r.full.data);assert.equal(dom.window.document.querySelectorAll('article.record .event-triager').length,1);dom.window.close();});
test('PDF real traz triador e número de Legendário no cabeçalho de todas as páginas',async()=>{
 const {DOMMatrix,ImageData,Path2D}=await import('@napi-rs/canvas');Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
 globalThis.pdfjsWorker=await import('pdfjs-dist/build/pdf.worker.min.mjs');
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const {reportModel}=await import('../src/reports.js'),{exportReport}=await import('../src/report-exports.js');
 const p={id:crypto.randomUUID(),name:'Pessoa sintética',age:'40',weight:'80',height:'178',flags:[],reviewed:[],sourceFields:[{label:'Campo longo',value:'texto longo sintético '.repeat(75),location:'teste!Z9'}]};
 const m=reportModel([p],{header:{topNumber:'01782',location:'Local sintético',baseName:'Base sintética',triager:'Triador Sintético',legendNumber:'004321'}}),f=exportReport(m,'full','pdf');
 const doc=await getDocument({data:new Uint8Array(f.data),useSystemFonts:false}).promise;
 for(let n=1;n<=doc.numPages;n++){const t=(await(await doc.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ');assert.match(t,/Triador Sintético/);assert.match(t,/Legendário nº 004321/);}
 await doc.destroy();
});
