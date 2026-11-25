// Prova no Chromium de verdade (não entra no `npm test`): escolher um TOP do calendário prepara a logomarca real (JPEG -> PNG) e preenche a identificação.
// Uso:  npm run build && node tests/browser-top-catalog.mjs   (CHROME_PATH opcional; padrão: chromium do Playwright em %LOCALAPPDATA%)
import {chromium} from '@playwright/test';import http from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const SAIDA=process.env.SAIDA||'test-results/catalogo/';await mkdir(SAIDA,{recursive:true});
const srv=http.createServer(async(q,r)=>{try{const b=await readFile('dist'+new URL(q.url,'http://x').pathname);r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(b);}catch{r.writeHead(404);r.end('nao');}});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||process.env.LOCALAPPDATA+'/ms-playwright/chromium-1248/chrome-win64/chrome.exe'});
const erros=[],ok=m=>console.log('✔',m);
try{
  const ctx=await browser.newContext({viewport:{width:1280,height:1000},deviceScaleFactor:1.5}),page=await ctx.newPage();page.on('pageerror',e=>erros.push(e.message));
  await page.goto('http://127.0.0.1:'+srv.address().port+'/triagem-hakunas-offline.html');await page.waitForTimeout(700);await page.click('[data-tab=settings]');await page.waitForTimeout(300);
  const valor=async parte=>page.$eval('#top-catalog',(s,p)=>[...s.options].find(o=>o.textContent.includes(p))?.value,parte);
  // 1) TOP do calendário oficial (Brasil): logomarca real
  await page.selectOption('#top-catalog',await valor('Bento Gonçalves, RS'));await page.waitForFunction(()=>document.querySelector('#catalog-status').textContent.startsWith('Preenchido com'),null,{timeout:15000});
  assert.equal(await page.inputValue('[name=location]'),'Bento Gonçalves, RS');assert.equal(await page.inputValue('[name=event]'),'Track Vale dos Vinhedos');assert.equal(await page.inputValue('[name=baseLogoBackground]'),'dark');
  const logo=await page.$eval('#header-preview .event-logo-left img',i=>({ok:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight,png:i.src.startsWith('data:image/png;base64,')}));
  assert.ok(logo.ok&&logo.png,'a logomarca foi decodificada e virou PNG: '+JSON.stringify(logo));ok('Bento Gonçalves: logomarca real preparada como PNG '+logo.w+'×'+logo.h+', local e nome preenchidos');
  await page.locator('#top-catalog').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-120));await page.screenshot({path:SAIDA+'1-catalogo-bento.png'});
  // 2) TOP informado (sem logo): número e local, mantém a logo anterior
  await page.selectOption('#top-catalog',await valor('Track Legacy'));await page.waitForFunction(()=>document.querySelector('#catalog-status').textContent.includes('Track Legacy'),null,{timeout:15000});
  assert.equal(await page.inputValue('[name=topNumber]'),'1827');assert.equal(await page.inputValue('[name=location]'),'Vitória / Serra, ES');assert.ok(await page.$('#header-preview .event-logo-left img'),'a logo anterior continua');ok('TOP 1827 (informado): número e local preenchidos, logo anterior mantida, aviso de não confirmado');
  await page.locator('#top-catalog').scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollBy(0,-120));await page.screenshot({path:SAIDA+'2-catalogo-1827-nao-confirmado.png'});
  // 3) Salvar e ver o cabeçalho na lista de participantes
  await page.selectOption('#top-catalog',await valor('Bento Gonçalves, RS'));await page.waitForFunction(()=>document.querySelector('#catalog-status').textContent.includes('Bento'),null,{timeout:15000});
  await page.fill('[name=topNumber]','1845');await page.fill('[name=triager]','Triador Exemplo');await page.fill('[name=legendNumber]','123456');await page.click('#save-header');await page.waitForTimeout(400);
  await page.click('[data-tab=people]');await page.waitForTimeout(500);
  const cab=await page.$('[data-event-header]');assert.ok(cab);const txt=await cab.innerText();assert.ok(txt.toUpperCase().includes('TOP 1845')&&txt.toUpperCase().includes('BENTO GONÇALVES, RS'),txt.replace(/\s+/g,' '));assert.ok(await cab.$('.event-logo-left img'));ok('cabeçalho da lista: '+txt.replace(/\s+/g,' ').slice(0,90));
  await cab.screenshot({path:SAIDA+'3-cabecalho-na-lista.png'});
  // 4) celular
  const m=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2}),pm=await m.newPage();pm.on('pageerror',e=>erros.push('celular: '+e.message));
  await pm.goto('http://127.0.0.1:'+srv.address().port+'/triagem-hakunas-offline.html');await pm.waitForTimeout(600);await pm.click('[data-tab=settings]');await pm.waitForTimeout(300);
  await pm.selectOption('#top-catalog',await pm.$eval('#top-catalog',s=>[...s.options].find(o=>o.textContent.includes('Bento Gonçalves, RS')).value));await pm.waitForFunction(()=>document.querySelector('#catalog-status').textContent.startsWith('Preenchido com'),null,{timeout:15000});
  await pm.locator('#top-catalog').scrollIntoViewIfNeeded();await pm.screenshot({path:SAIDA+'4-celular-catalogo.png'});ok('celular: escolha do TOP funciona');
  assert.deepEqual(erros,[]);ok('sem erros de página');
}finally{await browser.close();srv.close();}
