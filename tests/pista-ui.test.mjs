import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {webcrypto} from 'node:crypto';import {JSDOM,VirtualConsole} from 'jsdom';
// Tela do triador (pedido de 25/11/2026): "Minha pista" gera o link do formulário DELE; a janela de inscrições mostra de qual pista/triador veio cada ficha
// e NÃO deixa marcada por padrão a ficha sem identificação. A rede é simulada; a lógica de atribuição está em tests/intake-pistas.test.mjs.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ULTIMO=null; // última tela aberta: só para o diagnóstico quando uma espera estoura
async function until(fn,msg){for(let i=0;i<300;i++){if(fn())return;await sleep(20);}
  const t=s=>ULTIMO?.$(s)?.textContent;throw Error('Não concluiu: '+msg+' | status='+t('#pista-status')+' | erro='+t('#pista-error')+' | forms-status='+t('#forms-status')+' | forms-erro='+t('#forms-error')+' | chamadas='+JSON.stringify(ULTIMO?.chamadas)+' | erros='+JSON.stringify(ULTIMO?.errors));}
const LINK='https://docs.google.com/forms/d/e/FORMULARIO-DE-TESTE/viewform?usp=pp_url&entry.111222333=K7M2QX9P4T';
const P1={id:'aaaaaaaa-0000-0000-0000-000000000001',name:'Pista 1',place:'Vitória/ES',top:'1827',active:true};
const P2={id:'aaaaaaaa-0000-0000-0000-000000000002',name:'Pista 2',place:'Vitória/ES',top:'1827',active:false};
const CLAIM={code:'K7M2QX9P4T',link:LINK,linkConfigured:true,pista:P1,triager:{name:'Triador Um',legend:'111'}};
const registro=(id,nome,extra={})=>({id,name:nome,receivedAt:'2026-11-25T12:00:00Z',top:'1827',status:'novo',pista:null,pistaCode:'',record:{fields:{name:nome,cpf:'529.982.247-25',email:nome.split(' ')[0].toLowerCase()+'@exemplo.com',phone:'(11) 98888-7777',age:'38',weight:'70',height:'168'},extras:[],flags:[],prep:{activity:'1',walk:'0',tetanus:'0',prior:'0'}},...extra});
async function abrir(resp={}){
  const chamadas=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(await readFile('dist/triagem-hakunas-offline.html','utf8'),{url:'https://triagemhakunas.vercel.app/',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,$=s=>w.document.querySelector(s);
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const J=b=>({ok:true,status:200,json:async()=>b,text:async()=>JSON.stringify(b)});
  w.fetch=async(u,i={})=>{const url=new URL(String(u)),corpo=i.body?JSON.parse(i.body):undefined,m=i.method||'GET';
    if(url.pathname==='/api/intake'){chamadas.push({auth:(i.headers||{}).Authorization,...corpo});return J(resp[corpo.action]?resp[corpo.action](corpo):{error:'ação não simulada'});}
    if(url.pathname.includes('/auth/v1/token'))return J({access_token:'tok-t',refresh_token:'r',user:{id:'u1',email:'t@x.co'}});
    if(url.pathname.includes('/rest/v1/profiles'))return J([{full_name:'Triador Um',legend_number:'111'}]);
    if(url.pathname.includes('/rest/v1/usage_sessions')&&m==='POST')return J([{id:'s1'}]);
    if(url.pathname.includes('/rest/v1/')||url.pathname.includes('/auth/v1/logout'))return J([]);
    return {ok:false,status:404,json:async()=>({}),text:async()=>''};};
  w.eval(w.document.scripts[0].textContent);
  return ULTIMO={w,$,chamadas,errors,
    async entrar(){$('[data-tab=settings]').click();const f=$('#account-form');f.querySelector('input[name=email]').value='t@x.co';f.querySelector('input[name=password]').value='Senha-Falsa-123!';f.querySelector('input[type=checkbox]').checked=true;f.dispatchEvent(new w.Event('submit',{cancelable:true}));
      await until(()=>$('#account-out')||$('#account-error')?.textContent,'login');if(!$('#account-out'))throw Error('login falhou: '+$('#account-error').textContent);$('[data-tab=people]').click();}};
}

test('sem login, "Minha pista" orienta a entrar e não chama o servidor',async()=>{
  const app=await abrir();try{app.$('#my-pista').click();await until(()=>app.$('#pista-status').textContent.includes('Entre na conta'),'aviso de login');assert.equal(app.chamadas.length,0);assert.equal(app.$('#pista-select'),null);}finally{app.w.close();}
});

test('logado: escolhe a pista (só as ativas), gera o link com o código, copia e manda por WhatsApp',async()=>{
  const app=await abrir({pista_list:()=>({pistas:[P1,P2],mine:[],canManage:false}),pista_claim:()=>CLAIM});
  try{await app.entrar();let copiado=null;Object.defineProperty(app.w.navigator,'clipboard',{value:{writeText:async t=>{copiado=t;}},configurable:true});
    app.$('#my-pista').click();await until(()=>app.$('#pista-select'),'lista de pistas');
    const opcoes=[...app.$('#pista-select').options];assert.equal(opcoes.length,1,'pista desativada não aparece');assert.equal(opcoes[0].textContent,'Pista 1 · Vitória/ES · TOP 1827');assert.equal(opcoes[0].value,P1.id);
    app.$('#pista-go').click();await until(()=>app.$('#pista-link'),'link gerado');
    assert.equal(app.$('#pista-link').value,LINK);assert.equal(app.$('#pista-code').textContent,'K7M2QX9P4T');
    const wa=app.$('#pista-wa');assert.ok(wa.href.startsWith('https://wa.me/?text='));const texto=decodeURIComponent(wa.href.replace('https://wa.me/?text=',''));assert.ok(texto.includes(LINK)&&texto.includes('TOP 1827'));assert.equal(wa.target,'_blank');assert.ok(wa.rel.includes('noopener'));
    app.$('#pista-copy').click();await until(()=>app.$('#toast').textContent==='Link copiado.','confirmação da cópia');assert.equal(copiado,LINK);
    const claims=app.chamadas.filter(c=>c.action==='pista_claim');assert.equal(claims.length,1);assert.equal(claims[0].pistaId,P1.id);assert.equal(claims[0].auth,'Bearer tok-t','usa o login do triador');
    assert.deepEqual(app.errors,[]);
  }finally{app.w.close();}
});

test('se o link do formulário não estiver configurado no servidor, mostra o código e avisa o administrador (sem link inventado)',async()=>{
  const app=await abrir({pista_list:()=>({pistas:[P1],mine:[]}),pista_claim:()=>({...CLAIM,link:null,linkConfigured:false})});
  try{await app.entrar();app.$('#my-pista').click();await until(()=>app.$('#pista-select'),'lista');app.$('#pista-go').click();await until(()=>app.$('#pista-code'),'código');
    assert.equal(app.$('#pista-link'),null);assert.equal(app.$('#pista-wa'),null);assert.ok(app.$('#pista-result').textContent.includes('ainda não foi configurado'));
  }finally{app.w.close();}
});

test('erro do servidor e ausência de pistas aparecem com mensagem clara',async()=>{
  const a=await abrir({pista_list:()=>({error:'Sem permissão.'})});
  try{await a.entrar();a.$('#my-pista').click();await until(()=>a.$('#pista-error').textContent==='Sem permissão.','erro do servidor');assert.equal(a.$('#pista-select'),null);}finally{a.w.close();}
  const b=await abrir({pista_list:()=>({pistas:[P2],mine:[]})});
  try{await b.entrar();b.$('#my-pista').click();await until(()=>b.$('#pista-status').textContent.includes('Nenhuma pista cadastrada'),'sem pistas');assert.equal(b.$('#pista-select'),null);}finally{b.w.close();}
});

test('janela de inscrições: mostra pista e triador de cada ficha; a ficha SEM identificação não vem marcada e avisa o motivo',async()=>{
  const itens=[registro('11111111-1111-1111-1111-111111111111','Ana Souza',{pista:{name:'Pista 1',place:'Vitória/ES',top:'1827',triager:'Triador Um',legend:'111'},pistaCode:'K7M2QX9P4T'}),
    registro('22222222-2222-2222-2222-222222222222','Beto Lima',{pistaCode:'ZZZZZZZZZZ'}),registro('33333333-3333-3333-3333-333333333333','Caio Reis')];
  const app=await abrir({list:()=>({items:itens})});
  try{await app.entrar();app.$('#import-forms').click();await until(()=>app.w.document.querySelectorAll('[data-form-id]').length===3,'três inscrições');
    const linha=id=>app.$('[data-form-id="'+id+'"]'),txt=id=>linha(id).closest('label').textContent;
    assert.equal(linha(itens[0].id).checked,true,'com pista: marcada');assert.ok(txt(itens[0].id).includes('📍 Pista 1 (Triador Um)'));assert.ok(!txt(itens[0].id).includes('Sem identificação'));
    assert.equal(linha(itens[1].id).checked,false,'sem identificação: NÃO marcada');assert.equal(linha(itens[1].id).disabled,false,'mas a coordenação pode marcar');
    assert.ok(txt(itens[1].id).includes('Sem identificação da pista')&&txt(itens[1].id).includes('código ZZZZZZZZZZ não reconhecido'));
    assert.equal(linha(itens[2].id).checked,false);assert.ok(txt(itens[2].id).includes('veio sem código'));
    assert.deepEqual(app.errors,[]);
  }finally{app.w.close();}
});
