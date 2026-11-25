import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {pistasPanel,bindPistas,loadPistas} from '../src/admin/pistas-panel.js';
// Cadastro de pistas pelo admin (decisão do responsável, 25/11/2026: o triador escolhe de uma LISTA cadastrada, sem digitar nome de pista).
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ID1='11111111-1111-1111-1111-111111111111',ID2='22222222-2222-2222-2222-222222222222';
const P=[{id:ID1,name:'Pista 1',place:'Vitória/ES',top:'1827',active:true},{id:ID2,name:'<img src=x onerror=alert(1)>',place:'"Aspas" & cia',top:'',active:false}];
function montar(pistas,server){const dom=new JSDOM('<div id="app"></div>'),app=dom.window.document.querySelector('#app');app.innerHTML=pistasPanel({pistas},{esc});
  const chamadas=[],estado={refrescos:0};bindPistas({client:{server:async(p,b)=>{chamadas.push({p,b});return server?server(b):{pista:{}};}},app,refresh:async()=>{estado.refrescos++;}});return{app,chamadas,estado,w:dom.window};}
const preencher=(tr,v)=>{for(const[k,val]of Object.entries(v))tr.querySelector('[data-f='+k+']').value=val;};

test('o painel lista as pistas, escapa o que vier do banco e traz a linha para adicionar',()=>{
  const {app}=montar(P);assert.equal(app.querySelectorAll('tr[data-pista]').length,2);assert.ok(app.querySelector('#pista-nova'));assert.equal(app.querySelector('img'),null,'nada do banco vira HTML');
  const l2=app.querySelector('tr[data-pista="'+ID2+'"]');assert.equal(l2.querySelector('[data-f=name]').value,'<img src=x onerror=alert(1)>');assert.equal(l2.querySelector('[data-f=place]').value,'"Aspas" & cia');assert.equal(l2.querySelector('[data-f=active]').checked,false);
  assert.equal(app.querySelector('tr[data-pista="'+ID1+'"] [data-f=active]').checked,true);assert.equal(app.querySelector('#pista-nova [data-f=active]'),null,'a pista nova nasce ativa, sem caixa');
});

test('salvar envia o id e os campos editados ao servidor e atualiza o painel',async()=>{
  const {app,chamadas,estado}=montar(P),tr=app.querySelector('tr[data-pista="'+ID1+'"]');preencher(tr,{name:'Pista 1A',place:'Serra/ES'});tr.querySelector('[data-f=active]').checked=false;
  tr.querySelector('[data-save-pista]').click();await sleep(5);
  assert.deepEqual(chamadas,[{p:'/api/intake',b:{action:'pista_save',id:ID1,name:'Pista 1A',place:'Serra/ES',top:'1827',active:false}}]);assert.equal(estado.refrescos,1);
});

test('adicionar envia a pista nova SEM id e SEM "active" (o servidor cria ativa)',async()=>{
  const {app,chamadas,estado}=montar(P);preencher(app.querySelector('#pista-nova'),{name:'Pista 3',place:'Vila Velha/ES',top:'1827'});app.querySelector('#add-pista').click();await sleep(5);
  assert.deepEqual(chamadas,[{p:'/api/intake',b:{action:'pista_save',name:'Pista 3',place:'Vila Velha/ES',top:'1827'}}]);assert.equal(estado.refrescos,1);
});

test('erro do servidor aparece na tela e o painel não é redesenhado',async()=>{
  const {app,estado}=montar(P,()=>{throw Error('Já existe uma pista com este nome, local e TOP.');});app.querySelector('#add-pista').click();await sleep(5);
  assert.equal(app.querySelector('#pista-msg').textContent,'Já existe uma pista com este nome, local e TOP.');assert.equal(estado.refrescos,0);
});

test('se as pistas não puderem ser carregadas, o painel avisa em vez de mostrar uma lista vazia que enganaria',()=>{
  const {app}=montar(null);assert.ok(app.querySelector('#pistas-box').textContent.includes('Não foi possível carregar as pistas'));assert.ok(app.querySelector('#pistas-box').textContent.includes('0010'));assert.equal(app.querySelector('table'),null);
});

test('loadPistas pede a lista ao servidor e aceita resposta sem pistas',async()=>{
  const feitos=[];const client={server:async(p,b)=>{feitos.push([p,b]);return {pistas:P};}};assert.deepEqual(await loadPistas(client),P);assert.deepEqual(feitos,[['/api/intake',{action:'pista_list'}]]);
  assert.deepEqual(await loadPistas({server:async()=>({})}),[]);
});
