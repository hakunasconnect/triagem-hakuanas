import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{webcrypto}from'node:crypto';import{JSDOM,VirtualConsole}from'jsdom';
// Contrato (decisão do responsável, 24/11/2026): quem tem critério de exclusão aparece na lista com um sinal de alarme visível,
// sem mudar a cor nem a pontuação (exclusão com 0 ponto continua "Verde"; o alarme é só aviso, não classificação nem liberação).
test('lista marca com alarme quem tem critério de exclusão, sem mudar cor nem pontuação',async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(await readFile('dist/triagem-hakunas-offline.html','utf8'),{url:'file:///offline.html',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,$=s=>w.document.querySelector(s);
 try{
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.fetch=async()=>{throw Error('Rede proibida');};w.eval(w.document.scripts[0].textContent);
  // Eva: só exclusão (verde); Félix: nada; Gil: só hipertensão (vermelho, sem exclusão); Hugo: exclusão + hipertensão (vermelho).
  for(const[name,flags]of[['Eva sintética',['surgery']],['Félix sintético',[]],['Gil sintético',['htn']],['Hugo sintético',['surgery','htn']]]){
   $('#new').click();for(const[k,v]of Object.entries({name,age:'40',weight:'80',height:'178'}))$('[name='+k+']').value=v;
   for(const f of flags)$('[name=flag][value='+f+']').checked=true;
   $('#record-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  }
  const row=nome=>[...w.document.querySelectorAll('[data-edit]')].map(b=>b.closest('tr')).find(tr=>tr.textContent.includes(nome));
  const eva=row('Eva'),felix=row('Félix'),gil=row('Gil'),hugo=row('Hugo');
  // 1) alarme só em quem tem exclusão, com o motivo à vista
  const alarmeEva=eva.querySelector('[data-exclusion-alert]');
  assert.ok(alarmeEva,'Eva (exclusão) deve ter o sinal de alarme na lista');
  assert.match(alarmeEva.textContent,/⚠/);assert.match(alarmeEva.textContent,/Critério de exclusão/);
  assert.match(alarmeEva.closest('td').textContent,/Grande cirurgia nos últimos 3 meses/,'o motivo da exclusão aparece na mesma célula, junto do alarme');
  assert.ok(hugo.querySelector('[data-exclusion-alert]'),'exclusão também é marcada quando a cor é vermelha');
  assert.equal(felix.querySelector('[data-exclusion-alert]'),null,'sem exclusão, sem alarme');
  assert.equal(gil.querySelector('[data-exclusion-alert]'),null,'vermelho sem exclusão não ganha o alarme de exclusão');
  // 2) o alarme NÃO muda cor nem pontuação (contrato: exclusão não reclassifica)
  assert.ok(eva.querySelector('.pill.green')&&/Verde/.test(eva.textContent),'exclusão com 0 ponto continua Verde');
  assert.match(eva.textContent,/Parcial · 0 pontos/);assert.match(felix.textContent,/Parcial · 0 pontos/);
  assert.ok(hugo.querySelector('.pill.red'));
  // 3) o cartão "Atenção prioritária" segue contando exclusão ou vermelho/preto: Eva, Gil e Hugo
  const cartao=[...w.document.querySelectorAll('.metric')].find(m=>m.textContent.includes('Atenção prioritária'));
  assert.equal(cartao.querySelector('strong').textContent.trim(),'03');
  assert.deepEqual(errors,[]);
 }finally{w.close();}
});
