import{test}from'node:test';import assert from'node:assert/strict';
import{handleAlert}from'../src/alerts/handler.js';
const J=(status,body)=>({ok:status<400,status,json:async()=>body,text:async()=>JSON.stringify(body)});
const PNG='data:image/png;base64,iVBORw0KGgo=';
const world=(o={})=>{const log=[];const db={settings:{id:true,evolution_url:'https://evo.exemplo.com',instance:'',api_key:'',notify_use:true,active:true},recipients:[{name:'Dr',whatsapp:'5511999990000',active:true}],patched:[]};
 const profile={'u-admin':{id:'u-admin',full_name:'Dr',role:'admin_master',email:'e@x.co'},'u-tri':{id:'u-tri',full_name:'T',role:'triador',email:'t@x.co'}};
 const evo={state:o.state??'absent'};
 const fetch=async(u,i={})=>{const url=String(u);log.push({url,i});
  if(url.includes('/auth/v1/user')){const t=i.headers.Authorization.replace('Bearer ','');return profile[t]?J(200,{id:t}):J(401,{});}
  if(url.includes('/rest/v1/profiles'))return J(200,[profile[/eq\.([^&]+)/.exec(url)[1]]]);
  if(url.includes('/rest/v1/alert_settings')&&(i.method||'GET')==='GET')return J(200,[db.settings]);
  if(url.includes('/rest/v1/alert_settings')&&i.method==='PATCH'){db.patched.push(JSON.parse(i.body));Object.assign(db.settings,JSON.parse(i.body));return J(200,[db.settings]);}
  if(url.includes('/rest/v1/alert_recipients'))return J(200,db.recipients);
  if(url.includes('/instance/connectionState/')){if(evo.state==='absent')return J(404,{});return J(200,{instance:{instanceName:'triagem-hakunas',state:evo.state}});}
  if(url.endsWith('/instance/create')){evo.state='connecting';return J(201,{instance:{instanceName:'triagem-hakunas'},hash:'INSTANCEKEY',qrcode:{base64:o.qr??PNG}});}
  if(url.includes('/instance/connect/'))return J(200,{base64:o.qr??PNG,code:'ABC',pairingCode:'XYZ'});
  if(url.includes('/message/sendText/'))return J(201,{});
  throw new Error('rota inesperada '+url);};
 return{db,log,deps:{fetch,supabaseUrl:'https://x.supabase.co',anonKey:'ANON',serviceKey:'SERVICE',evolutionKey:o.noKey?'':'GLOBALKEY'}};};
const req=(type,tok='u-admin')=>({method:'POST',authorization:'Bearer '+tok,body:{type}});

test('Conectar: sem instância, cria sozinha, guarda o nome e devolve o QR code, sem expor chave',async()=>{const w=world();const r=await handleAlert(req('wa-connect'),w.deps);assert.equal(r.status,200);assert.equal(r.json.qr,PNG);assert.ok(['connecting','close'].includes(r.json.state));assert.ok(w.log.some(c=>c.url.endsWith('/instance/create')));assert.equal(w.db.settings.instance,'triagem-hakunas');assert.ok(!JSON.stringify(r.json).includes('GLOBALKEY'));assert.ok(!JSON.stringify(r.json).includes('INSTANCEKEY'));assert.ok(w.log.filter(c=>c.url.includes('evo.exemplo.com')).every(c=>c.i.headers.apikey==='GLOBALKEY'));});
test('Conectar: instância existente e desconectada só pede um QR novo',async()=>{const w=world({state:'close'});const r=await handleAlert(req('wa-connect'),w.deps);assert.equal(r.json.qr,PNG);assert.ok(!w.log.some(c=>c.url.endsWith('/instance/create')));assert.ok(w.log.some(c=>c.url.includes('/instance/connect/')));});
test('Conectar: se já está conectada, não gera QR',async()=>{const w=world({state:'open'});const r=await handleAlert(req('wa-connect'),w.deps);assert.equal(r.json.state,'open');assert.equal(r.json.qr,undefined);assert.ok(!w.log.some(c=>c.url.includes('/instance/connect/')));});
test('Status devolve o estado da conexão',async()=>{const w=world({state:'open'});assert.equal((await handleAlert(req('wa-status'),w.deps)).json.state,'open');const w2=world({state:'absent'});assert.equal((await handleAlert(req('wa-status'),w2.deps)).json.state,'absent');});
test('Só o admin master conecta ou consulta o WhatsApp',async()=>{const w=world();assert.equal((await handleAlert(req('wa-connect','u-tri'),w.deps)).status,403);assert.equal((await handleAlert(req('wa-status','u-tri'),w.deps)).status,403);assert.ok(!w.log.some(c=>c.url.includes('evo.exemplo.com')));});
test('Sem a chave da Evolution no servidor, explica o que falta em vez de falhar',async()=>{const w=world({noKey:true});const r=await handleAlert(req('wa-connect'),w.deps);assert.equal(r.status,200);assert.match(r.json.error,/chave|configura/i);assert.ok(!w.log.some(c=>c.url.includes('evo.exemplo.com')));});
test('QR fora do formato de imagem é descartado, nunca repassado ao navegador',async()=>{const w=world({qr:'<script>alert(1)</script>'});const r=await handleAlert(req('wa-connect'),w.deps);assert.equal(r.json.qr,undefined);assert.ok(!JSON.stringify(r.json).includes('script'));});
test('QR sem prefixo data: recebe o prefixo de imagem PNG',async()=>{const w=world({qr:'iVBORw0KGgo='});const r=await handleAlert(req('wa-connect'),w.deps);assert.equal(r.json.qr,'data:image/png;base64,iVBORw0KGgo=');});
test('Alertas usam a chave do servidor quando nenhuma foi digitada, sem precisar cadastrar chave',async()=>{const w=world({state:'open'});w.db.settings.instance='triagem-hakunas';const r=await handleAlert({method:'POST',authorization:'Bearer u-admin',body:{type:'test'}},w.deps);assert.equal(r.json.sent,true);const send=w.log.find(c=>c.url.includes('/message/sendText/'));assert.equal(send.i.headers.apikey,'GLOBALKEY');});
